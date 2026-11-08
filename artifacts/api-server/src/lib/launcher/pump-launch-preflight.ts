/**
 * Pump.fun SOL-paired launch preflight only.
 * Does NOT build, simulate, sign or broadcast a transaction.
 * Fee amounts cannot be trusted without a constructed transaction and RPC.
 */
import { isSolanaPublicKey } from "./solana-wallet.ts";

export type PumpLaunchInput = {
  name: string;
  ticker: string;
  description: string;
  creatorAddress: string;
  artworkSeed: string;
  initialBuySol: number;
};

export type PumpLaunchPolicy = {
  emergencyStop: boolean;
  maxPerLaunchSol: number;
  dailyLimitSol: number;
  dailyLaunchLimit: number;
  launchesToday: number;
};

export type PreflightCheck = {
  id: string;
  status: "pass" | "blocked" | "pending";
  detail: string;
};

export type PumpLaunchPreflight = {
  mode: "preview_only";
  protocol: "pump.fun";
  network: "solana-mainnet";
  pairing: "SOL";
  instruction: "create_v2";
  sdkHint: "@pump-fun/pump-sdk";
  checks: PreflightCheck[];
  blocked: boolean;
  nextAction: "resolve_blockers" | "prepare_metadata";
  estimatedNetworkFeeSol: null;
  estimatedAccountRentSol: null;
  platformCreationFeeSol: 0;
  initialBuySol: number;
  note: string;
  transactionBuilt: false;
  transactionSimulated: false;
  broadcast: false;
};

export function preparePumpLaunch(
  input: PumpLaunchInput,
  policy: PumpLaunchPolicy,
  artworkPresent: boolean,
): PumpLaunchPreflight {
  const checks: PreflightCheck[] = [];
  const add = (id: string, status: PreflightCheck["status"], detail: string) => checks.push({ id, status, detail });
  const name = input.name?.trim() ?? "";
  const ticker = input.ticker?.trim() ?? "";
  add("metadata", name.length >= 1 && name.length <= 32 &&
    /^[A-Za-z0-9]{2,10}$/.test(ticker) && typeof input.description === "string" &&
    input.description.length <= 280 && typeof input.artworkSeed === "string" &&
    input.artworkSeed.length >= 1 && input.artworkSeed.length <= 64 ? "pass" : "blocked",
    "Name (1–32), ticker (2–10 alphanumeric), description (max 280) and artwork seed required.");
  add("creator", isSolanaPublicKey(input.creatorAddress) ? "pass" : "blocked",
    "A valid public Solana creator address is required; do not provide a private key.");
  add("artwork", artworkPresent ? "pass" : "blocked",
    artworkPresent ? "Generated artwork is stored for this user." : "Generate and store artwork before metadata publishing.");
  add("emergency_stop", policy.emergencyStop ? "blocked" : "pass",
    policy.emergencyStop ? "Emergency stop is enabled." : "Emergency stop is not enabled.");
  add("initial_buy", Number.isFinite(input.initialBuySol) && input.initialBuySol >= 0 &&
    input.initialBuySol <= policy.maxPerLaunchSol &&
    input.initialBuySol <= policy.dailyLimitSol ? "pass" : "blocked",
    "Optional self-buy must be nonnegative and within the configured per-launch and daily SOL policy ceilings.");
  add("daily_count", Number.isInteger(policy.dailyLaunchLimit) &&
    policy.launchesToday < policy.dailyLaunchLimit ? "pass" : "blocked",
    "Demo record count must be below the configured daily launch limit.");
  add("metadata_uri", "pending",
    "Token metadata must be published to a durable public HTTPS/IPFS URI before create_v2.");
  add("network_costs", "pending",
    "Actual network fee, priority fee and rent must be obtained from a constructed transaction and current RPC.");
  add("transaction_simulation", "pending",
    "A transaction must be built and simulated with RPC before any signature or broadcast.");

  const blocked = checks.some(c => c.status === "blocked");
  return {
    mode: "preview_only", protocol: "pump.fun", network: "solana-mainnet",
    pairing: "SOL", instruction: "create_v2", sdkHint: "@pump-fun/pump-sdk",
    checks, blocked, nextAction: blocked ? "resolve_blockers" : "prepare_metadata",
    estimatedNetworkFeeSol: null, estimatedAccountRentSol: null,
    platformCreationFeeSol: 0, initialBuySol: input.initialBuySol,
    note: "A planning checklist, not an executable or simulated launch. Zero platform creation fee does not mean zero network or rent costs.",
    transactionBuilt: false, transactionSimulated: false, broadcast: false,
  };
}
