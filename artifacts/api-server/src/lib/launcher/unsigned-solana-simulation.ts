/**
 * Solana RPC inspection for an already assembled, unsigned transaction.
 * This module NEVER signs or broadcasts. No user-facing endpoint accepts raw txs.
 * A future Pump.fun instruction builder must invoke it internally after preflight.
 */
export type SimulationResult = {
  mode: "simulation_only";
  executed: false;
  broadcast: false;
  simulationOk: boolean;
  error: string | null;
  unitsConsumed: number | null;
  logs: string[];
  baseFeeLamports: number | null;
  baseFeeSol: number | null;
  feeAvailability: "quoted" | "unavailable";
};

export type SimulationOptions = {
  rpcUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type RpcResponse<T> = {
  result?: T | null;
  error?: { code?: number; message?: string };
};

function validBase64(input: string, maxBytes: number): boolean {
  if (typeof input !== "string" || input.length === 0 || input.length > Math.ceil(maxBytes / 3) * 4 + 4 ||
      input.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input)) return false;
  const data = Buffer.from(input, "base64");
  return data.length > 0 && data.length <= maxBytes && data.toString("base64") === input;
}

async function rpc<T>(
  method: string,
  params: unknown[],
  options: SimulationOptions,
): Promise<T> {
  // Never take RPC URLs from an API request. The only runtime URL comes from server configuration.
  const url = options.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Solana RPC request failed.");
    const payload = await response.json() as RpcResponse<T>;
    if (payload.error || payload.result === undefined || payload.result === null) {
      throw new Error("Solana RPC returned an error.");
    }
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

type Simulated = {
  context?: { slot?: unknown };
  value?: {
    err?: unknown;
    logs?: unknown;
    unitsConsumed?: unknown;
  };
};

export async function simulateUnsignedTransaction(
  unsignedTransactionBase64: string,
  serializedMessageBase64: string,
  options: SimulationOptions = {},
): Promise<SimulationResult> {
  // Current legacy/v0 transactions: max 1,232 bytes per packet. No signatures are required
  // for RPC simulation, but signature slots must be present in the serialized transaction.
  if (!validBase64(unsignedTransactionBase64, 1232) ||
      !validBase64(serializedMessageBase64, 1232)) {
    throw new Error("Malformed or oversized transaction/message encoding.");
  }
  const simulation = await rpc<Simulated>("simulateTransaction", [
    unsignedTransactionBase64,
    {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: true,
      innerInstructions: false,
    },
  ], options);
  if (!simulation || typeof simulation.value !== "object" || !simulation.value) {
    throw new Error("Invalid transaction simulation RPC response.");
  }
  const val = simulation.value;
  const error = val.err == null ? null : JSON.stringify(val.err).slice(0, 400);
  const unitsConsumed = typeof val.unitsConsumed === "number" &&
    Number.isSafeInteger(val.unitsConsumed) && val.unitsConsumed >= 0 ? val.unitsConsumed : null;
  const logs = Array.isArray(val.logs) ?
    val.logs.filter((entry): entry is string => typeof entry === "string").slice(0, 30).map(entry => entry.slice(0, 250)) : [];
  // Quote base fee separately. This does NOT include rent, priority fees, or optional self-buy.
  let baseFeeLamports: number | null = null;
  try {
    const fee = await rpc<{ value?: unknown }>("getFeeForMessage", [
      serializedMessageBase64, { commitment: "confirmed" },
    ], options);
    if (typeof fee.value === "number" && Number.isSafeInteger(fee.value) && fee.value >= 0) {
      baseFeeLamports = fee.value;
    }
  } catch {
    // Network fee is unknown, never report zero as a guess.
  }
  return {
    mode: "simulation_only",
    executed: false,
    broadcast: false,
    simulationOk: error === null,
    error,
    unitsConsumed,
    logs,
    baseFeeLamports,
    baseFeeSol: baseFeeLamports === null ? null : baseFeeLamports / 1_000_000_000,
    feeAvailability: baseFeeLamports === null ? "unavailable" : "quoted",
  };
}
