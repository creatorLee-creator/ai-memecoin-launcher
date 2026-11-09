/**
 * Publish public token metadata to IPFS via Pinata when explicitly invoked.
 *
 * Important:
 * - The existing Replit Object Storage artwork remains private.
 * - Pinning creates a NEW public copy. It is not reversible by deleting
 *   a private launch record. Callers must obtain a deliberate user action.
 * - PINATA_JWT is server-side only. No key is included in return values.
 * - No Solana transaction is created, signed, simulated or broadcast here.
 */
export type TokenMetadataInput = {
  name: string;
  symbol: string;
  description: string;
};
export type PublicTokenMetadata = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: true;
  createdOn: "https://pump.fun";
};

export function isValidCid(cid: string): boolean {
  // CIDv0 or lowercase base32 CIDv1. Never accept user-supplied URL strings.
  return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid) ||
    /^b[a-z2-7]{30,120}$/.test(cid);
}
export function ipfsGatewayUri(cid: string): string {
  if (!isValidCid(cid)) throw new Error("Invalid IPFS content identifier.");
  return `https://ipfs.io/ipfs/${cid}`;
}
export function buildPublicTokenMetadata(
  input: TokenMetadataInput,
  imageCid: string,
): PublicTokenMetadata {
  if (typeof input.name !== "string" || input.name.length < 1 || input.name.length > 32 ||
      typeof input.symbol !== "string" || !/^[A-Za-z0-9]{2,10}$/.test(input.symbol) ||
      typeof input.description !== "string" || input.description.length > 280) {
    throw new Error("Invalid public token metadata.");
  }
  return {
    name: input.name, symbol: input.symbol, description: input.description,
    image: ipfsGatewayUri(imageCid), showName: true, createdOn: "https://pump.fun",
  };
}

type PinataReply = { data?: { cid?: unknown } };
export type PinataUploadOptions = {
  jwt?: string;
  fetcher?: typeof fetch;
  uploadEndpoint?: string;
};
const DEFAULT_UPLOAD = "https://uploads.pinata.cloud/v3/files";

/** Only caller-controlled known-safe file names; never reveal userId or seed. */
async function pinPublicFile(
  file: Blob,
  name: string,
  options: PinataUploadOptions,
): Promise<string> {
  const jwt = options.jwt ?? process.env.PINATA_JWT;
  if (!jwt) throw new Error("Public metadata publishing is not configured.");
  const body = new FormData();
  body.set("network", "public");
  body.set("file", file, name);
  body.set("name", name);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await (options.fetcher ?? fetch)(options.uploadEndpoint ?? DEFAULT_UPLOAD, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Unable to pin public token metadata.");
    const result = await response.json() as PinataReply;
    if (typeof result.data?.cid !== "string" || !isValidCid(result.data.cid)) {
      throw new Error("IPFS publisher returned an invalid content identifier.");
    }
    return result.data.cid;
  } finally {
    clearTimeout(timeout);
  }
}

export async function publishTokenMetadata(
  input: TokenMetadataInput,
  privateArtworkPng: Buffer,
  options: PinataUploadOptions = {},
): Promise<{ metadataUri: string; imageUri: string; metadataCid: string; imageCid: string }> {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (privateArtworkPng.length < 8 || privateArtworkPng.length > 9_000_000 ||
      !privateArtworkPng.subarray(0, 8).equals(pngSignature)) {
    throw new Error("Invalid artwork PNG bytes.");
  }
  // Validate all user data BEFORE uploading artwork. Build with a placeholder
  // CID to exercise identical validation, but never publish that placeholder.
  buildPublicTokenMetadata(input, "bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m");
  const imageCid = await pinPublicFile(
    new Blob([Uint8Array.from(privateArtworkPng)], { type: "image/png" }), "token-artwork.png", options,
  );
  const metadata = buildPublicTokenMetadata(input, imageCid);
  const bytes = JSON.stringify(metadata);
  if (Buffer.byteLength(bytes) > 5000) throw new Error("Token metadata exceeds size limit.");
  const metadataCid = await pinPublicFile(
    new Blob([bytes], { type: "application/json" }), "token-metadata.json", options,
  );
  const metadataUri = ipfsGatewayUri(metadataCid);
  if (metadataUri.length > 200) throw new Error("Pump metadata URI too long.");
  return { metadataUri, imageUri: metadata.image, metadataCid, imageCid };
}
