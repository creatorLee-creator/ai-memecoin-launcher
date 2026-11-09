import assert from "node:assert/strict";
import { test } from "node:test";
import { VersionedTransaction } from "@solana/web3.js";
import { simulatePumpCreateV2 } from "../src/lib/launcher/pump-create-v2-simulation.ts";

const input = {
  user: "Vote111111111111111111111111111111111111111",
  creator: "Stake11111111111111111111111111111111111111",
  name: "Moon Cat", symbol: "MCAT",
  metadataUri: "https://ipfs.io/ipfs/bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m",
};
const blockhash = "11111111111111111111111111111111";
test("builds an actual unsigned Pump.fun transaction with SDK and runs RPC simulation, never broadcast", async () => {
  const methods: string[] = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
    methods.push(req.method);
    if (req.method === "getLatestBlockhash") {
      return Response.json({ result: { value: { blockhash, lastValidBlockHeight: 123 } } });
    }
    if (req.method === "simulateTransaction") {
      const tx = VersionedTransaction.deserialize(Buffer.from(req.params[0] as string, "base64"));
      assert.equal(tx.message.header.numRequiredSignatures, tx.signatures.length);
      assert.ok(tx.signatures.every(signature => signature.every(byte => byte === 0)));
      const config = req.params[1] as Record<string, unknown>;
      assert.equal(config.sigVerify, false);
      assert.equal(config.replaceRecentBlockhash, true);
      return Response.json({ result: { value: { err: null, logs: ["mock simulation"], unitsConsumed: 100_000 } } });
    }
    if (req.method === "getFeeForMessage") {
      return Response.json({ result: { value: 10_000 } });
    }
    throw new Error("Unexpected RPC method: " + req.method);
  }) as typeof fetch;
  const result = await simulatePumpCreateV2(input, { fetcher });
  assert.deepEqual(methods, ["getLatestBlockhash", "simulateTransaction", "getFeeForMessage"]);
  assert.equal(result.signed, false);
  assert.equal(result.broadcast, false);
  assert.equal(result.simulation.simulationOk, true);
  assert.equal(result.simulation.baseFeeLamports, 10_000);
  assert.equal(result.metadataPublished, "not_verified");
  assert.ok(result.requiredSignatures >= 2);
  assert.ok(result.wireSizeBytes <= 1232);
});
test("rejects bad public keys and URIs before any network call", async () => {
  await assert.rejects(() => simulatePumpCreateV2({ ...input, user: "invalid" }), /Invalid payer/);
  await assert.rejects(() => simulatePumpCreateV2({ ...input, metadataUri: "http://unsafe.example" }), /public HTTPS/);
});
test("program simulation error is reported without claiming deployment", async () => {
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const { method } = JSON.parse(String(init?.body)) as { method: string };
    if (method === "getLatestBlockhash") return Response.json({ result: { value: { blockhash } } });
    if (method === "simulateTransaction") return Response.json({ result: { value: { err: { InstructionError: [0, "InsufficientFunds"] } } } });
    return Response.json({ result: { value: null } });
  }) as typeof fetch;
  const report = await simulatePumpCreateV2(input, { fetcher });
  assert.equal(report.simulation.simulationOk, false);
  assert.equal(report.simulation.baseFeeSol, null);
  assert.equal(report.signed, false);
  assert.equal(report.broadcast, false);
});
