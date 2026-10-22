export type LaunchConcept = {
  name: string;
  ticker: string;
  description: string;
  artworkSeed: string;
};

export type LaunchResult = {
  contractAddress: null;
  transactionSignature: null;
  status: "demo_only";
};

export type SafetySettings = {
  maxPerLaunchSol: number;
  dailyLimitSol: number;
  dailyLaunchLimit: number;
  emergencyStop: boolean;
};

export interface LaunchAdapter {
  readonly status: "demo" | "not_configured";
  launch(concept: LaunchConcept): Promise<LaunchResult>;
}

export class DemoLaunchAdapter implements LaunchAdapter {
  readonly status = "demo" as const;

  async launch(_concept: LaunchConcept): Promise<LaunchResult> {
    return {
      contractAddress: null,
      transactionSignature: null,
      status: "demo_only",
    };
  }
}

export class UnconfiguredPumpFunAdapter implements LaunchAdapter {
  readonly status = "not_configured" as const;

  async launch(): Promise<LaunchResult> {
    throw new Error("Pump.fun launch integration is not configured.");
  }
}

export function assertDemoLaunchAllowed(
  settings: SafetySettings,
  launchesToday: number,
): void {
  if (settings.emergencyStop) {
    throw new Error("Emergency stop is enabled.");
  }
  if (
    settings.dailyLaunchLimit === 0 ||
    launchesToday >= settings.dailyLaunchLimit
  ) {
    throw new Error("The configured daily launch limit has been reached.");
  }

  // Demo mode has no wallet, signer, or on-chain cost. Its spend is always zero.
  const demoSpendSol = 0;
  if (
    demoSpendSol > settings.maxPerLaunchSol ||
    demoSpendSol > settings.dailyLimitSol
  ) {
    throw new Error("The configured spending limits block this action.");
  }
}

export const demoLaunchAdapter: LaunchAdapter = new DemoLaunchAdapter();
export const pumpFunLaunchAdapter: LaunchAdapter =
  new UnconfiguredPumpFunAdapter();
