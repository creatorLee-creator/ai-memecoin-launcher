/**
 * Structural bridge to the official Pump SDK 4.1.0's PUMP_SDK.createV2Instruction().
 * Dependency-injected to prevent the dev/demo application from loading signing
 * or transaction broadcasting capabilities. The real SDK package is not yet
 * installed in the project; a runtime factory must supply it explicitly.
 *
 * Official API:
 * https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md
 */
import type {
  CreateV2Params, InstructionDescriptor, PumpCreateV2SdkAdapter,
} from "./pump-create-v2-adapter.ts";

export type SdkPublicKey = { toBase58(): string };
export type PublicKeyConstructor = new (value: string) => SdkPublicKey;
export type SdkInstruction = {
  programId: SdkPublicKey;
  keys: ReadonlyArray<{
    pubkey: SdkPublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: Uint8Array | Buffer;
};
export type OfficialPumpSdkSurface = {
  createV2Instruction(input: {
    mint: SdkPublicKey;
    user: SdkPublicKey;
    creator: SdkPublicKey;
    name: string;
    symbol: string;
    uri: string;
    mayhemMode: false;
    cashback: false;
    holderReward: false;
  }): Promise<SdkInstruction>;
};

/** Make an adapter around an actual SDK surface and web3 PublicKey class.
 * This bridge cannot generate a signer, sign, serialize or broadcast.
 */
export function createOfficialPumpSdkBridge(
  sdk: OfficialPumpSdkSurface,
  PublicKey: PublicKeyConstructor,
): PumpCreateV2SdkAdapter {
  return {
    async createV2Instruction(params: CreateV2Params): Promise<InstructionDescriptor> {
      const instruction = await sdk.createV2Instruction({
        mint: new PublicKey(params.mint),
        user: new PublicKey(params.user),
        creator: new PublicKey(params.creator),
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        mayhemMode: false,
        cashback: false,
        holderReward: false,
      });
      if (!instruction || !instruction.programId || !Array.isArray(instruction.keys) ||
          !(instruction.data instanceof Uint8Array)) {
        throw new Error("Official Pump SDK returned malformed instruction.");
      }
      return {
        programId: instruction.programId.toBase58(),
        accounts: instruction.keys.map(key => ({
          address: key.pubkey.toBase58(),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Uint8Array.from(instruction.data),
      };
    },
  };
}
