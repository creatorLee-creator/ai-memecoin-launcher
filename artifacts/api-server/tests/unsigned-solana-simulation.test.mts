import assert from "node:assert/strict";
import test from "node:test";
import { simulateUnsignedTransaction } from "../src/lib/launcher/unsigned-solana-simulation.ts";
const encodedTx = Buffer.from([0, 1, 2, 3]).toString("base64");
const encodedMessage = Buffer.from([4, 5, 6]).toString("base64");

test("simulation only requests simulateTransaction and getFeeForMessage, not sendTransaction", async () => {
  const methods: string[] = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const data = JSON.parse(String(init?.body));
    methods.push(data.method);
    if (data.method === "simulateTransaction") {
      assert.equal(data.params[1].sigVerify, false);
      assert.equal(data.params[1].replaceRecentBlockhash, true);
      return Response.json({ result: { value: { err: null, unitsConsumed: 12345, logs: ["ok"] } } });
    }
    return Response.json({ result: { value: 5000 } });
  }) as typeof fetch;
  const result = await simulateUnsignedTransaction(encodedTx, encodedMessage, { fetcher });
  assert.deepEqual(methods, ["simulateTransaction", "getFeeForMessage"]);
  assert.equal(result.broadcast, false);
  assert.equal(result.executed, false);
  assert.equal(result.simulationOk, true);
  assert.equal(result.baseFeeLamports, 5000);
  assert.equal(result.baseFeeSol, 0.000005);
});
test("failed program simulation does not masquerade as success", async () => {
  const fetcher = (async () => Response.json({ result: { value: { err: { InstructionError: [0, "Custom"] } } } })) as typeof fetch;
  const result = await simulateUnsignedTransaction(encodedTx, encodedMessage, { fetcher });
  assert.equal(result.simulationOk, false);
  assert.equal(result.baseFeeLamports, null);
});
test("fee lookup failure reports unknown, not zero", async () => {
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.method === "getFeeForMessage") return Response.json({ error: { message: "busy" } });
    return Response.json({ result: { value: { err: null } } });
  }) as typeof fetch;
  const result = await simulateUnsignedTransaction(encodedTx, encodedMessage, { fetcher });
  assert.equal(result.baseFeeSol, null);
  assert.equal(result.feeAvailability, "unavailable");
});
test("malformed or oversized transactions never reach RPC", async () => {
  await assert.rejects(() => simulateUnsignedTransaction("not-base64!", encodedMessage), /Malformed/);
  await assert.rejects(() => simulateUnsignedTransaction(Buffer.alloc(1233).toString("base64"), encodedMessage), /Malformed/);
});
