import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareCreateV2Instruction, validateCreateV2Request,
  type CreateV2Params, type PumpCreateV2SdkAdapter,
} from "../src/lib/launcher/pump-create-v2-adapter.ts";
const mint = "So11111111111111111111111111111111111111112";
const payer = "Vote111111111111111111111111111111111111111";
const creator = "Stake11111111111111111111111111111111111111";
const params: CreateV2Params = {
  mint, user: payer, creator, name: "Moon Cat", symbol: "MCAT",
  uri: "https://ipfs.io/ipfs/bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m",
  mayhemMode: false, cashback: false, holderReward: false,
};
const sdk: PumpCreateV2SdkAdapter = {
  async createV2Instruction(p) {
    return { programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      accounts: [
        { address: p.mint, isSigner: true, isWritable: true },
        { address: p.user, isSigner: true, isWritable: true },
        ...Array.from({ length: 14 }, () => ({ address: p.creator, isSigner: false, isWritable: false })),
      ],
      data: new Uint8Array([1,2,3]),
    };
  },
};
test("create_v2 adapter produces instruction only; never serializes or broadcasts", async () => {
  const p = await prepareCreateV2Instruction(sdk, params);
  assert.equal(p.mode, "unsigned_only");
  assert.equal(p.serialized, false);
  assert.equal(p.broadcast, false);
  assert.equal(p.signingRequired, true);
});
test("invalid creator, network URI or unsupported launch flags are rejected", () => {
  assert.throws(() => validateCreateV2Request({ ...params, creator: "bad" }), /Invalid/);
  assert.throws(() => validateCreateV2Request({ ...params, uri: "http://bad" }), /Invalid/);
  assert.throws(() => validateCreateV2Request({ ...params, mayhemMode: true as false }), /Invalid/);
});
test("rejects a wrong program or missing required signer", async () => {
  await assert.rejects(
    () => prepareCreateV2Instruction({ createV2Instruction: async () => ({
      programId: "11111111111111111111111111111111", accounts: [], data: new Uint8Array([1]),
    }) }, params), /Unexpected/,
  );
});
