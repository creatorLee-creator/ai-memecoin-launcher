import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertDemoLaunchAllowed,
  demoLaunchAdapter,
  type SafetySettings,
} from "../src/lib/launcher/launch-engine.ts";

const defaults: SafetySettings = {
  emergencyStop: false,
  dailyLaunchLimit: 5,
  maxPerLaunchSol: 0.25,
  dailyLimitSol: 1,
};

test("demo launch allowed below daily limit", () => {
  assert.doesNotThrow(() => assertDemoLaunchAllowed(defaults, 4));
});

test("emergency stop blocks demo launches", () => {
  assert.throws(
    () => assertDemoLaunchAllowed({ ...defaults, emergencyStop: true }, 0),
    /Emergency stop/,
  );
});

test("daily limit blocks at boundary", () => {
  assert.throws(() => assertDemoLaunchAllowed(defaults, 5), /daily launch limit/);
});

test("zero daily launch limit blocks every launch", () => {
  assert.throws(
    () => assertDemoLaunchAllowed({ ...defaults, dailyLaunchLimit: 0 }, 0),
    /daily launch limit/,
  );
});

test("demo adapter never broadcasts a transaction", async () => {
  const result = await demoLaunchAdapter.launch({
    name: "Example",
    ticker: "EX",
    description: "Demo only",
    artworkSeed: "test",
  });
  assert.deepEqual(result, {
    contractAddress: null,
    transactionSignature: null,
    status: "demo_only",
  });
});
