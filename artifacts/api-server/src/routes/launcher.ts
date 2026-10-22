import { getAuth } from "@clerk/express";
import {
  and,
  count,
  desc,
  eq,
  gte,
} from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  CreateDemoLaunchResponse,
  CreateDemoLaunchBody,
  GenerateDemoTokenBody,
  GenerateDemoTokenResponse,
  GetLauncherOverviewResponse,
  GetSafetySettingsResponse,
  ListLauncherAuditEventsResponse,
  ListLauncherLaunchesResponse,
  UpdateSafetySettingsBody,
  UpdateSafetySettingsResponse,
} from "@workspace/api-zod";
import {
  db,
  launcherAuditEventsTable,
  launcherLaunchesTable,
  launcherSafetySettingsTable,
} from "@workspace/db";
import {
  assertDemoLaunchAllowed,
  demoLaunchAdapter,
  pumpFunLaunchAdapter,
} from "../lib/launcher/launch-engine";
import { tokenGenerator } from "../lib/launcher/token-generator";

const router: IRouter = Router();

router.use((req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
});

function userIdFor(req: Request): string {
  return getAuth(req).userId!;
}

async function getOrCreateSafetySettings(userId: string) {
  const [existing] = await db
    .select()
    .from(launcherSafetySettingsTable)
    .where(eq(launcherSafetySettingsTable.userId, userId))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(launcherSafetySettingsTable)
    .values({ userId })
    .onConflictDoNothing({ target: launcherSafetySettingsTable.userId });

  const [created] = await db
    .select()
    .from(launcherSafetySettingsTable)
    .where(eq(launcherSafetySettingsTable.userId, userId))
    .limit(1);
  if (!created) throw new Error("Could not initialize safety settings.");
  return created;
}

async function addAuditEvent(
  userId: string,
  action: string,
  detail: string,
): Promise<void> {
  await db.insert(launcherAuditEventsTable).values({ userId, action, detail });
}

function utcStartOfToday(): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

router.get("/launcher/overview", async (req, res): Promise<void> => {
  const userId = userIdFor(req);
  const today = utcStartOfToday();
  const [totalResult, todayResult, settings] = await Promise.all([
    db
      .select({ value: count() })
      .from(launcherLaunchesTable)
      .where(eq(launcherLaunchesTable.userId, userId)),
    db
      .select({ value: count() })
      .from(launcherLaunchesTable)
      .where(
        and(
          eq(launcherLaunchesTable.userId, userId),
          gte(launcherLaunchesTable.createdAt, today),
        ),
      ),
    getOrCreateSafetySettings(userId),
  ]);

  res.json(
    GetLauncherOverviewResponse.parse({
      mode: "demo",
      totalLaunchRecords: totalResult[0]?.value ?? 0,
      launchesToday: todayResult[0]?.value ?? 0,
      walletStatus: "not_created",
      balanceSol: 0,
      emergencyStop: settings.emergencyStop,
      pumpFunStatus: pumpFunLaunchAdapter.status,
    }),
  );
});

router.get("/launcher/launches", async (req, res): Promise<void> => {
  const records = await db
    .select()
    .from(launcherLaunchesTable)
    .where(eq(launcherLaunchesTable.userId, userIdFor(req)))
    .orderBy(desc(launcherLaunchesTable.createdAt))
    .limit(100);

  res.json(
    ListLauncherLaunchesResponse.parse(
      records.map((record) => ({
        ...record,
        contractAddress: null,
        transactionSignature: null,
        status: "demo_only",
      })),
    ),
  );
});

router.post("/launcher/generate", async (req, res): Promise<void> => {
  const parsed = GenerateDemoTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const generated = await tokenGenerator.generate(parsed.data);
  await addAuditEvent(
    userIdFor(req),
    "demo_token_generated",
    `Generated a sample concept for ${generated.name}.`,
  );
  res.json(GenerateDemoTokenResponse.parse(generated));
});

router.post("/launcher/launches", async (req, res): Promise<void> => {
  const parsed = CreateDemoLaunchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = userIdFor(req);
  const settings = await getOrCreateSafetySettings(userId);
  const today = utcStartOfToday();
  const [todayResult] = await db
    .select({ value: count() })
    .from(launcherLaunchesTable)
    .where(
      and(
        eq(launcherLaunchesTable.userId, userId),
        gte(launcherLaunchesTable.createdAt, today),
      ),
    );

  try {
    assertDemoLaunchAllowed(settings, todayResult?.value ?? 0);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Launch blocked by safety policy.";
    await addAuditEvent(userId, "demo_launch_blocked", message);
    res.status(400).json({ error: message });
    return;
  }

  const launchResult = await demoLaunchAdapter.launch(parsed.data);
  const [record] = await db
    .insert(launcherLaunchesTable)
    .values({
      userId,
      ...parsed.data,
      contractAddress: launchResult.contractAddress,
      transactionSignature: launchResult.transactionSignature,
      status: launchResult.status,
    })
    .returning();

  await addAuditEvent(
    userId,
    "demo_launch_recorded",
    `Created a demo-only record for ${record.name} (${record.ticker}); no transaction was broadcast.`,
  );

  res.status(201).json(
    CreateDemoLaunchResponse.parse({
      ...record,
      contractAddress: null,
      transactionSignature: null,
      status: "demo_only",
    }),
  );
});

router.get("/launcher/safety-settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSafetySettings(userIdFor(req));
  res.json(
    GetSafetySettingsResponse.parse({
      ...settings,
      walletStatus: "not_created",
      balanceSol: 0,
      walletAddress: null,
    }),
  );
});

router.patch("/launcher/safety-settings", async (req, res): Promise<void> => {
  const parsed = UpdateSafetySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = userIdFor(req);
  const previous = await getOrCreateSafetySettings(userId);
  const updatedValues = {
    maxPerLaunchSol:
      parsed.data.maxPerLaunchSol ?? previous.maxPerLaunchSol,
    dailyLimitSol: parsed.data.dailyLimitSol ?? previous.dailyLimitSol,
    dailyLaunchLimit:
      parsed.data.dailyLaunchLimit ?? previous.dailyLaunchLimit,
    emergencyStop: parsed.data.emergencyStop ?? previous.emergencyStop,
    updatedAt: new Date(),
  };

  const [updated] = await db
    .insert(launcherSafetySettingsTable)
    .values({ userId, ...updatedValues })
    .onConflictDoUpdate({
      target: launcherSafetySettingsTable.userId,
      set: updatedValues,
    })
    .returning();

  const action =
    previous.emergencyStop !== updated.emergencyStop
      ? updated.emergencyStop
        ? "emergency_stop_enabled"
        : "emergency_stop_disabled"
      : "safety_settings_updated";
  await addAuditEvent(
    userId,
    action,
    previous.emergencyStop !== updated.emergencyStop
      ? `Emergency stop ${updated.emergencyStop ? "enabled" : "disabled"}.`
      : "Updated configured spending and launch limits.",
  );

  res.json(
    UpdateSafetySettingsResponse.parse({
      ...updated,
      walletStatus: "not_created",
      balanceSol: 0,
      walletAddress: null,
    }),
  );
});

router.get("/launcher/audit-log", async (req, res): Promise<void> => {
  const events = await db
    .select()
    .from(launcherAuditEventsTable)
    .where(eq(launcherAuditEventsTable.userId, userIdFor(req)))
    .orderBy(desc(launcherAuditEventsTable.createdAt))
    .limit(30);
  res.json(ListLauncherAuditEventsResponse.parse(events));
});

export default router;
