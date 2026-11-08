import assert from "node:assert/strict";
import test from "node:test";
import { isSolanaPublicKey, readSolanaBalance } from "../src/lib/launcher/solana-wallet.ts";

const address = "11111111111111111111111111111111";

test("Solana public address checks decoded size and base58 characters", () => {
  assert.equal(isSolanaPublicKey(address), true);
  assert.equal(isSolanaPublicKey("invalid"), false);
  assert.equal(isSolanaPublicKey("0".repeat(32)), false);
  assert.equal(isSolanaPublicKey("1".repeat(33)), false);
});

test("read-only wallet checker returns confirmed balance", async () => {
  let observedBody: unknown;
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    observedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      jsonrpc: "2.0", result: { context: { slot: 42 }, value: 1_500_000_000 },
    }), { status: 200 });
  }) as typeof fetch;
  const result = await readSolanaBalance(address, { rpcUrl: "https://example.invalid", fetcher });
  assert.deepEqual(result, { address, lamports: 1_500_000_000, sol: 1.5, slot: 42 });
  assert.deepEqual((observedBody as {params:unknown[]}).params, [address, {commitment:"confirmed"}]);
});

test("wallet checker rejects invalid address without network access", async () => {
  await assert.rejects(() => readSolanaBalance("not-a-key"), /Invalid Solana/);
});

test("wallet checker rejects RPC errors", async () => {
  const fetcher = (async () => new Response(JSON.stringify({error:{message:"unavailable"}}), {status:200})) as typeof fetch;
  await assert.rejects(() => readSolanaBalance(address,{fetcher}),/RPC returned an error/);
});
