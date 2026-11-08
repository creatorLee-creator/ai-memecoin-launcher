import assert from "node:assert/strict";
import test from "node:test";
import { preparePumpLaunch, type PumpLaunchInput, type PumpLaunchPolicy } from "../src/lib/launcher/pump-launch-preflight.ts";
const input: PumpLaunchInput = {
  name: "Test Cat", ticker: "TCAT", description: "Original fictional cat concept.",
  artworkSeed: "generated-seed", creatorAddress: "11111111111111111111111111111111",
  initialBuySol: 0,
};
const policy: PumpLaunchPolicy = {
  emergencyStop: false, maxPerLaunchSol: 0.25, dailyLimitSol: 1, dailyLaunchLimit: 5, launchesToday: 1,
};
test("preflight is never an executable transaction or a simulated launch", () => {
  const p = preparePumpLaunch(input, policy, true);
  assert.equal(p.blocked, false);
  assert.equal(p.transactionBuilt, false);
  assert.equal(p.transactionSimulated, false);
  assert.equal(p.broadcast, false);
  assert.equal(p.estimatedNetworkFeeSol, null);
  assert.equal(p.estimatedAccountRentSol, null);
  assert.equal(p.platformCreationFeeSol, 0);
  assert.equal(p.nextAction, "prepare_metadata");
});
test("preflight enforces emergency stop", () => {
  const p = preparePumpLaunch(input, { ...policy, emergencyStop: true }, true);
  assert.equal(p.blocked, true);
  assert.equal(p.checks.find(c => c.id === "emergency_stop")?.status, "blocked");
});
test("preflight rejects invalid creator addresses and absent artwork", () => {
  const p = preparePumpLaunch({ ...input, creatorAddress: "bad" }, policy, false);
  assert.equal(p.blocked, true);
  assert.equal(p.checks.find(c => c.id === "creator")?.status, "blocked");
  assert.equal(p.checks.find(c => c.id === "artwork")?.status, "blocked");
});
test("preflight enforces optional self-buy ceiling", () => {
  const p = preparePumpLaunch({ ...input, initialBuySol: 0.26 }, policy, true);
  assert.equal(p.blocked, true);
  assert.equal(p.checks.find(c => c.id === "initial_buy")?.status, "blocked");
});
test("preflight requires eventual metadata publication and simulation", () => {
  const p = preparePumpLaunch(input, policy, true);
  assert.equal(p.checks.find(c => c.id === "metadata_uri")?.status, "pending");
  assert.equal(p.checks.find(c => c.id === "transaction_simulation")?.status, "pending");
});
