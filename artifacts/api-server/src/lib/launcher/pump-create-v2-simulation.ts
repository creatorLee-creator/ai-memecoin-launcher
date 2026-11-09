/**
 * Isolated SOL-paired Pump.fun create_v2 transaction construction and RPC simulation.
 *
 * SIMULATION ONLY: Generates a disposable 32-byte mint ADDRESS with no
 * corresponding private key. The serialized v0 transaction contains zeroed
 * required signature slots, and never leaves this module except in an RPC
 * simulateTransaction request with sigVerify:false. This transaction cannot
 * be signed/broadcast by the app. Real launches require a separate, reviewed
 * signer and explicit spending authorization.
 *
 * No public HTTP route exposes this service.
 */
import { randomBytes } from "node:crypto";
import {
  PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { buildOfficialCreateV2Instruction } from "./pump-sdk-runtime.ts";
import { simulateUnsignedTransaction, type SimulationOptions, type SimulationResult } from "./unsigned-solana-simulation.ts";
import { isSolanaPublicKey } from "./solana-wallet.ts";

const MAX_WIRE_BYTES = 1232;
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";

export type PumpSimulationInput = {
  user: string;
  creator: string;
  name: string;
  symbol: string;
  metadataUri: string;
};

export type PumpSimulationReport = {
  mode: "unsigned_simulation_only";
  program: "pump.fun/create_v2";
  network: "solana-mainnet";
  payer: string;
  creator: string;
  disposableMint: string;
  requiredSignatures: number;
  wireSizeBytes: number;
  simulation: SimulationResult;
  metadataPublished: "not_verified";
  signed: false;
  broadcast: false;
};

type RpcEnvelope = {
  result?: { value?: { blockhash?: unknown; lastValidBlockHeight?: unknown } };
  error?: unknown;
};

async function fetchRecentBlockhash(options: SimulationOptions): Promise<string> {
  // Endpoints are server-controlled; do not accept URLs from an API request.
  const endpoint = options.rpcUrl ?? process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getLatestBlockhash",
        params: [{ commitment: "confirmed" }],
      }),
      signal: abort.signal,
    });
    if (!response.ok) throw new Error("Solana blockhash RPC request failed.");
    const body = await response.json() as RpcEnvelope;
    const blockhash = body.result?.value?.blockhash;
    if (body.error || typeof blockhash !== "string" || !isSolanaPublicKey(blockhash)) {
      throw new Error("Solana RPC returned an invalid recent blockhash.");
    }
    return blockhash;
  } finally {
    clearTimeout(timeout);
  }
}

export async function simulatePumpCreateV2(
  input: PumpSimulationInput,
  options: SimulationOptions = {},
): Promise<PumpSimulationReport> {
  if (!isSolanaPublicKey(input.user) || !isSolanaPublicKey(input.creator)) {
    throw new Error("Invalid payer or creator public key.");
  }
  if (typeof input.metadataUri !== "string" ||
      !/^https:\/\/(?:ipfs\.io\/ipfs\/|[a-z0-9.-]+\/)[a-zA-Z0-9/_?=.-]+$/.test(input.metadataUri)) {
    throw new Error("A public HTTPS metadata URI is required.");
  }
  // Random public address only; no Keypair.generate(), seed phrase, secret key or signing.
  const mint = new PublicKey(randomBytes(32));
  const prepared = await buildOfficialCreateV2Instruction({
    mint: mint.toBase58(),
    user: input.user,
    creator: input.creator,
    name: input.name,
    symbol: input.symbol,
    uri: input.metadataUri,
    mayhemMode: false,
    cashback: false,
    holderReward: false,
  });
  const descriptor = prepared.instruction;
  const instruction = new TransactionInstruction({
    programId: new PublicKey(descriptor.programId),
    keys: descriptor.accounts.map(a => ({
      pubkey: new PublicKey(a.address), isSigner: a.isSigner, isWritable: a.isWritable,
    })),
    data: Buffer.from(descriptor.data),
  });
  const recentBlockhash = await fetchRecentBlockhash(options);
  const message = new TransactionMessage({
    payerKey: new PublicKey(input.user),
    recentBlockhash,
    instructions: [instruction],
  }).compileToV0Message();
  // VersionedTransaction populates zero-filled signatures, not valid signatures.
  const unsignedTransaction = new VersionedTransaction(message);
  const wire = unsignedTransaction.serialize();
  if (wire.length > MAX_WIRE_BYTES) {
    throw new Error("Unsigned create_v2 transaction exceeds Solana packet size.");
  }
  const simulation = await simulateUnsignedTransaction(
    Buffer.from(wire).toString("base64"),
    Buffer.from(message.serialize()).toString("base64"),
    options,
  );
  return {
    mode: "unsigned_simulation_only",
    program: "pump.fun/create_v2",
    network: "solana-mainnet",
    payer: input.user, creator: input.creator, disposableMint: mint.toBase58(),
    requiredSignatures: message.header.numRequiredSignatures,
    wireSizeBytes: wire.length,
    simulation,
    metadataPublished: "not_verified",
    signed: false,
    broadcast: false,
  };
}
