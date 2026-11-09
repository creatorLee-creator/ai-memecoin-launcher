/**
 * Live mainnet RPC smoke check. Never signs/sends a transaction.
 * Uses two fixed public addresses with no key material and a disposable mint
 * address that has no matching private key. Program failure from an unfunded
 * payer is expected and is NOT a successful token launch.
 *
 * Run via: RUN_LIVE_SOLANA_RPC=1 node --experimental-strip-types tests/live-solana-rpc-smoke.mts
 */
import assert from "node:assert/strict";
import { simulatePumpCreateV2 } from "../src/lib/launcher/pump-create-v2-simulation.ts";

if (process.env.RUN_LIVE_SOLANA_RPC !== "1") {
  throw new Error("Explicit RUN_LIVE_SOLANA_RPC=1 flag is required.");
}
const payer = "Vote111111111111111111111111111111111111111";
const report = await simulatePumpCreateV2({
  user: payer,
  creator: "Stake11111111111111111111111111111111111111",
  name: "Simulation Only",
  symbol: "SIMTEST",
  metadataUri: "https://ipfs.io/ipfs/bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m",
}, { timeoutMs: 18_000 });

assert.equal(report.mode, "unsigned_simulation_only");
assert.equal(report.signed, false);
assert.equal(report.broadcast, false);
assert.equal(report.simulation.executed, false);
assert.equal(report.simulation.broadcast, false);
assert.ok(report.wireSizeBytes <= 1232);
assert.ok(report.requiredSignatures >= 2);

// We intentionally do not assert simulationOk=true. The unfunded test payer
// should fail on real mainnet. The goal is to confirm real RPC program response.
assert.equal(typeof report.simulation.simulationOk, "boolean");
assert.ok(report.simulation.unitsConsumed === null || report.simulation.unitsConsumed >= 0);
assert.ok(report.simulation.baseFeeLamports === null || report.simulation.baseFeeLamports >= 0);

// Output is a compact report; no transaction or signature data is logged.
console.log(JSON.stringify({
  rpc: process.env.SOLANA_RPC_URL ? "configured" : "public_mainnet_default",
  mode: report.mode,
  program: report.program,
  network: report.network,
  transactionSizeBytes: report.wireSizeBytes,
  requiredSignatures: report.requiredSignatures,
  simulationOk: report.simulation.simulationOk,
  simulationError: report.simulation.error,
  computeUnits: report.simulation.unitsConsumed,
  baseFeeLamports: report.simulation.baseFeeLamports,
  feeAvailability: report.simulation.feeAvailability,
  broadcast: report.broadcast,
}));
