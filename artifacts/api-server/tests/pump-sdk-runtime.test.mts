import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOfficialCreateV2Instruction } from "../src/lib/launcher/pump-sdk-runtime.ts";

test("actual official Pump SDK builds a SOL-paired create_v2 instruction offline", async () => {
  const prepared = await buildOfficialCreateV2Instruction({
    mint: "So11111111111111111111111111111111111111112",
    user: "Vote111111111111111111111111111111111111111",
    creator: "Stake11111111111111111111111111111111111111",
    name: "Moon Cat",
    symbol: "MCAT",
    uri: "https://ipfs.io/ipfs/bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m",
    mayhemMode: false,
    cashback: false,
    holderReward: false,
  });
  assert.equal(prepared.instructionName, "create_v2");
  assert.equal(prepared.instruction.programId, "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  assert.ok(prepared.instruction.accounts.length >= 16);
  assert.ok(prepared.instruction.data.length > 8);
  assert.equal(prepared.serialized, false);
  assert.equal(prepared.broadcast, false);
});
