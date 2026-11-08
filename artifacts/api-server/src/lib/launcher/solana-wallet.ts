/**
 * Read-only Solana balance inspection. No wallet secrets or signing.
 * RPC URL is server-configured, never supplied by a user request.
 */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const LAMPORTS_PER_SOL = 1_000_000_000;

export function isSolanaPublicKey(address: string): boolean {
  if (typeof address !== "string" || address.length < 32 || address.length > 44) return false;
  let value = 0n;
  for (const character of address) {
    const digit = ALPHABET.indexOf(character);
    if (digit === -1) return false;
    value = value * 58n + BigInt(digit);
  }
  let size = 0;
  while (value > 0n) { value >>= 8n; size++; }
  for (const character of address) {
    if (character !== "1") break;
    size++;
  }
  return size === 32;
}

export type SolanaBalance = {
  address: string;
  lamports: number;
  sol: number;
  slot: number;
};

type RpcReply = {
  jsonrpc?: string;
  result?: { context?: { slot?: number }; value?: unknown };
  error?: { message?: string };
};

export async function readSolanaBalance(
  address: string,
  options: { rpcUrl?: string; fetcher?: typeof fetch } = {},
): Promise<SolanaBalance> {
  if (!isSolanaPublicKey(address)) throw new Error("Invalid Solana public address.");
  const rpcUrl = options.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address, { commitment: "confirmed" }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Solana RPC request failed.");
    const payload = await response.json() as RpcReply;
    if (payload.error || !payload.result) throw new Error("Solana RPC returned an error.");
    const lamports = payload.result.value;
    const slot = payload.result.context?.slot;
    if (
      typeof lamports !== "number" || !Number.isSafeInteger(lamports) || lamports < 0 ||
      typeof slot !== "number" || !Number.isSafeInteger(slot) || slot < 0
    ) throw new Error("Invalid Solana RPC response.");
    return { address, lamports, sol: lamports / LAMPORTS_PER_SOL, slot };
  } finally {
    clearTimeout(timeout);
  }
}
