/**
 * Real installed SDK binding, deliberately limited to instruction creation.
 * Does not generate or store private keys, serialize, sign, simulate or send.
 */
import { PUMP_SDK } from "@pump-fun/pump-sdk";
import { PublicKey } from "@solana/web3.js";
import {
  prepareCreateV2Instruction,
  type CreateV2Params,
  type PreparedCreateV2,
} from "./pump-create-v2-adapter.ts";
import { createOfficialPumpSdkBridge } from "./pump-sdk-bridge.ts";

/** Builds and validates one SOL-paired Pump.fun create_v2 instruction, offline. */
export async function buildOfficialCreateV2Instruction(
  request: CreateV2Params,
): Promise<PreparedCreateV2> {
  return prepareCreateV2Instruction(
    createOfficialPumpSdkBridge({
      createV2Instruction: async input => PUMP_SDK.createV2Instruction({
        mint: new PublicKey(input.mint.toBase58()),
        user: new PublicKey(input.user.toBase58()),
        creator: new PublicKey(input.creator.toBase58()),
        name: input.name,
        symbol: input.symbol,
        uri: input.uri,
        mayhemMode: input.mayhemMode,
        cashback: input.cashback,
        holderReward: input.holderReward,
      }),
    }, PublicKey),
    request,
  );
}
