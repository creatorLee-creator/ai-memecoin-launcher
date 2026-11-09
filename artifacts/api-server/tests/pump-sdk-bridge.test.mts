import assert from "node:assert/strict";
import { test } from "node:test";
import { createOfficialPumpSdkBridge } from "../src/lib/launcher/pump-sdk-bridge.ts";
import { prepareCreateV2Instruction, type CreateV2Params } from "../src/lib/launcher/pump-create-v2-adapter.ts";
const mint = "So11111111111111111111111111111111111111112";
const user = "Vote111111111111111111111111111111111111111";
const creator = "Stake11111111111111111111111111111111111111";
const p: CreateV2Params = { mint, user, creator, name: "Moon Cat", symbol: "MCAT",
 uri: "https://ipfs.io/ipfs/bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m",
 mayhemMode: false, cashback: false, holderReward: false };
class FakePublicKey { value: string; constructor(value: string) { this.value = value; } toBase58() { return this.value; } }
test("bridges public key objects, preserves 16 ordered SDK keys and rejects sign/broadcast paths", async () => {
  let input: unknown;
  const sdk = {
    async createV2Instruction(args: Record<string, unknown>) {
      input = args;
      return { programId: new FakePublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
        keys: [
          { pubkey: args.mint, isSigner: true, isWritable: true },
          { pubkey: args.user, isSigner: true, isWritable: true },
          ...Array.from({ length: 14 }, () => ({ pubkey: args.creator, isSigner: false, isWritable: false })),
        ], data: Uint8Array.from([1,2,3]) };
    },
  };
  const bridge = createOfficialPumpSdkBridge(sdk as never, FakePublicKey);
  const instruction = await prepareCreateV2Instruction(bridge, p);
  assert.equal((input as { mint: FakePublicKey }).mint.toBase58(), mint);
  assert.equal((input as { mayhemMode: boolean }).mayhemMode, false);
  assert.equal((input as { cashback: boolean }).cashback, false);
  assert.equal((input as { holderReward: boolean }).holderReward, false);
  assert.equal(instruction.instruction.accounts.length, 16);
  assert.equal(instruction.serialized, false);
  assert.equal(instruction.broadcast, false);
});
test("reject malformed SDK replies", async () => {
 const bridge = createOfficialPumpSdkBridge({createV2Instruction: async () => ({keys: [], data: new Uint8Array()})} as never, FakePublicKey);
 await assert.rejects(() => prepareCreateV2Instruction(bridge, p), /malformed/);
});
