import { createHash } from "node:crypto";
import { Client } from "@replit/object-storage";

// Both identifiers are hashed so user-controlled strings never become storage paths.
// Artwork stays private; it is served only after an authenticated ownership check.
export function artworkStorageKey(userId: string, artworkSeed: string): string {
  const user = createHash("sha256").update(userId).digest("hex");
  const seed = createHash("sha256").update(artworkSeed).digest("hex");
  return `launcher-artwork/${user}/${seed}.png`;
}

const client = new Client();

export async function persistArtwork(
  userId: string,
  artworkSeed: string,
  base64: string,
): Promise<void> {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 8 || bytes.length > 9_000_000 ||
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Invalid PNG artwork.");
  }
  const result = await client.uploadFromBytes(artworkStorageKey(userId, artworkSeed), bytes);
  if (!result.ok) throw new Error("Unable to persist artwork.");
}

export async function loadArtwork(userId: string, artworkSeed: string): Promise<Buffer | null> {
  const result = await client.downloadAsBytes(artworkStorageKey(userId, artworkSeed));
  if (!result.ok) return null;
  return Buffer.concat(result.value);
}
