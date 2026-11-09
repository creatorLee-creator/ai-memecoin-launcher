/**
 * Typed, signing-disabled Pump.fun create_v2 instruction adapter.
 *
 * The official @pump-fun/pump-sdk implementation will be wired through the
 * injected adapter once dependency versions and a transaction serializer are
 * locked and tested. This module does not claim to serialize a transaction.
 */
import { isSolanaPublicKey } from "./solana-wallet.ts";

export type CreateV2Params = {
  mint: string;
  user: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  mayhemMode: false;
  cashback: false;
  holderReward: false;
};

export type InstructionDescriptor = {
  programId: string;
  accounts: ReadonlyArray<{ address: string; isSigner: boolean; isWritable: boolean }>;
  data: Uint8Array;
};
export type PumpCreateV2SdkAdapter = {
  createV2Instruction(params: CreateV2Params): Promise<InstructionDescriptor>;
};
export type PreparedCreateV2 = {
  mode: "unsigned_only";
  instructionName: "create_v2";
  metadataUri: string;
  mintAddress: string;
  payerAddress: string;
  signingRequired: true;
  serialized: false;
  broadcast: false;
  instruction: InstructionDescriptor;
};

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export function validateCreateV2Request(params: CreateV2Params): void {
  if (!isSolanaPublicKey(params.mint) || !isSolanaPublicKey(params.user) ||
      !isSolanaPublicKey(params.creator) ||
      params.creator === "11111111111111111111111111111111" ||
      typeof params.name !== "string" || params.name.trim().length < 1 ||
      params.name.length > 32 ||
      typeof params.symbol !== "string" || !/^[A-Za-z0-9]{2,13}$/.test(params.symbol) ||
      typeof params.uri !== "string" || params.uri.length > 200 ||
      !/^https:\/\/[a-z0-9.-]+\/[a-zA-Z0-9/_?=.-]+$/.test(params.uri) ||
      params.mayhemMode !== false || params.cashback !== false || params.holderReward !== false ||
      params.mint === params.user || params.mint === params.creator) {
    throw new Error("Invalid or unsupported Pump.fun create_v2 parameters.");
  }
}
export async function prepareCreateV2Instruction(
  sdk: PumpCreateV2SdkAdapter,
  params: CreateV2Params,
): Promise<PreparedCreateV2> {
  validateCreateV2Request(params);
  const instruction = await sdk.createV2Instruction(params);
  if (instruction.programId !== PUMP_PROGRAM_ID ||
      !Array.isArray(instruction.accounts) || instruction.accounts.length < 16 ||
      !(instruction.data instanceof Uint8Array) || instruction.data.length === 0 ||
      !instruction.accounts.some(a => a.address === params.mint && a.isSigner) ||
      !instruction.accounts.some(a => a.address === params.user && a.isSigner)) {
    throw new Error("Unexpected create_v2 instruction from SDK.");
  }
  return {
    mode: "unsigned_only", instructionName: "create_v2",
    metadataUri: params.uri, mintAddress: params.mint, payerAddress: params.user,
    signingRequired: true, serialized: false, broadcast: false, instruction,
  };
}
