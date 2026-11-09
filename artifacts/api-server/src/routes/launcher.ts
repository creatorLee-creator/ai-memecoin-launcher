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
import { generateTokenArtwork } from "../lib/launcher/artwork-generator";
import { loadArtwork, persistArtwork } from "../lib/launcher/artwork-storage";
import { isSolanaPublicKey, readSolanaBalance } from "../lib/launcher/solana-wallet";
import { preparePumpLaunch } from "../lib/launcher/pump-launch-preflight";
import { simulatePumpCreateV2 } from "../lib/launcher/pump-create-v2-simulation";
import { authenticatedRateLimit } from "../middlewares/authenticatedRateLimit";

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


// Watch-only wallet checks: no keys, signing, wallet creation, or broadcast.
router.get("/launcher/wallet-balance/:address", authenticatedRateLimit("wallet-balance", 12), async (req, res): Promise<void> => {
  const address = req.params.address;
  if (typeof address !== "string" || !isSolanaPublicKey(address)) {
    res.status(400).json({ error: "Enter a valid Solana public wallet address." });
    return;
  }
  try {
    const balance = await readSolanaBalance(address);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ...balance, mode: "watch_only" });
  } catch {
    res.status(502).json({ error: "Unable to retrieve the Solana balance right now." });
  }
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

router.post("/launcher/generate", authenticatedRateLimit("generate", 10), async (req, res): Promise<void> => {
  const parsed = GenerateDemoTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const generated = await tokenGenerator.generate(parsed.data);
    await addAuditEvent(
      userIdFor(req),
      "token_concept_generated",
      `Generated a ${generated.generationMode} concept for ${generated.name}.`,
    );
    res.json(GenerateDemoTokenResponse.parse(generated));
  } catch {
    // Do not expose provider responses, API keys, or internal error details.
    res.status(502).json({ error: "Token generation is temporarily unavailable." });
  }
});

// Generated artwork is saved to private, user-scoped Object Storage.
// No artwork is ever sent to a blockchain adapter.
router.post("/launcher/artwork", authenticatedRateLimit("artwork", 3), async (req, res): Promise<void> => {
  const body: unknown = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Invalid artwork request." });
    return;
  }
  const input = body as Record<string, unknown>;
  if (
    typeof input.name !== "string" || input.name.length < 1 || input.name.length > 32 ||
    typeof input.ticker !== "string" || !/^[A-Za-z0-9]{2,10}$/.test(input.ticker) ||
    typeof input.description !== "string" || input.description.length > 280 ||
    typeof input.artworkSeed !== "string" || input.artworkSeed.length < 1 || input.artworkSeed.length > 64
  ) {
    res.status(400).json({ error: "Invalid artwork request." });
    return;
  }
  try {
    const artwork = await generateTokenArtwork({
      name: input.name, ticker: input.ticker, description: input.description,
    });
    await persistArtwork(userIdFor(req), input.artworkSeed as string, artwork.base64);
    res.setHeader("Cache-Control", "no-store");
    res.json(artwork);
  } catch {
    res.status(502).json({ error: "Artwork generation is temporarily unavailable." });
  }
});

// Existing records without generated artwork receive 404 and retain their placeholder.
// Ownership is checked before reading bytes; never expose the bucket itself.
router.get("/launcher/launches/:id/artwork", async (req, res): Promise<void> => {
  const id = req.params.id;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    res.status(404).end();
    return;
  }
  const userId = userIdFor(req);
  const [record] = await db.select({ artworkSeed: launcherLaunchesTable.artworkSeed })
    .from(launcherLaunchesTable)
    .where(and(eq(launcherLaunchesTable.id, id), eq(launcherLaunchesTable.userId, userId)))
    .limit(1);
  if (!record) { res.status(404).end(); return; }
  try {
    const bytes = await loadArtwork(userId, record.artworkSeed);
    if (!bytes) { res.status(404).end(); return; }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(bytes);
  } catch {
    res.status(502).json({ error: "Artwork is temporarily unavailable." });
  }
});

// Review-only Pump.fun launch preflight. Does not construct, simulate, sign or broadcast.
// Simulation-only: never accepts private keys, transaction bytes, arbitrary RPC URLs
// or spending commands. No signing or broadcast method is available.
router.post("/launcher/pump-simulate", authenticatedRateLimit("pump-simulate", 3), async (req, res): Promise<void> => {
  const body: unknown = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Invalid simulation request." });
    return;
  }
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some(key =>
      !["name", "symbol", "creatorAddress", "payerAddress", "metadataUri"].includes(key)) ||
      typeof fields.name !== "string" || fields.name.length < 1 || fields.name.length > 32 ||
      typeof fields.symbol !== "string" || !/^[A-Za-z0-9]{2,10}$/.test(fields.symbol) ||
      typeof fields.creatorAddress !== "string" || !isSolanaPublicKey(fields.creatorAddress) ||
      typeof fields.payerAddress !== "string" || !isSolanaPublicKey(fields.payerAddress) ||
      typeof fields.metadataUri !== "string" || fields.metadataUri.length > 200 ||
      !/^https:\/\/ipfs\.io\/ipfs\/[a-zA-Z0-9]+$/.test(fields.metadataUri)) {
    res.status(400).json({ error: "Invalid public simulation fields. Use a public IPFS metadata URL." });
    return;
  }
  try {
    const settings = await getOrCreateSafetySettings(userIdFor(req));
    if (settings.emergencyStop) {
      res.status(403).json({ error: "Emergency stop is active." });
      return;
    }
    // Confirm that the supplied address is a watch-only account. Checking
    // its balance costs no SOL and does not authorize any future spending.
    const payer = await readSolanaBalance(fields.payerAddress);
    const result = await simulatePumpCreateV2({
      name: fields.name, symbol: fields.symbol,
      creator: fields.creatorAddress, user: fields.payerAddress,
      metadataUri: fields.metadataUri,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ...result,
      payerBalanceSol: payer.sol,
      payerBalanceLamports: payer.lamports,
      feePayerFunded: payer.lamports > 0,
      feePayerNote: payer.lamports === 0
        ? "Fee payer is unfunded; InvalidAccountForFee may occur."
        : "Nonzero balance does not guarantee transaction fee or rent affordability.",
      // Self-buy remains excluded from this create_v2-only simulation.
      initialSelfBuyIncluded: false,
    });
  } catch {
    res.status(502).json({ error: "Unable to check wallet and simulate the unsigned launch." });
  }
});

router.post("/launcher/pump-preflight", authenticatedRateLimit("pump-preflight", 10), async (req, res): Promise<void> => {
  const body: unknown = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Invalid preflight request." });
    return;
  }
  const input = body as Record<string, unknown>;
  if (typeof input.name !== "string" || input.name.length < 1 || input.name.length > 32 ||
      typeof input.ticker !== "string" || input.ticker.length < 2 || input.ticker.length > 10 ||
      typeof input.description !== "string" || input.description.length > 280 ||
      typeof input.artworkSeed !== "string" || input.artworkSeed.length < 1 || input.artworkSeed.length > 64 ||
      typeof input.creatorAddress !== "string" || input.creatorAddress.length > 44 ||
      typeof input.initialBuySol !== "number" || !Number.isFinite(input.initialBuySol)) {
    res.status(400).json({ error: "Invalid preflight request." });
    return;
  }
  const userId = userIdFor(req);
  try {
    const [settings, todayCount, artwork] = await Promise.all([
      getOrCreateSafetySettings(userId),
      db.select({ value: count() }).from(launcherLaunchesTable).where(and(
        eq(launcherLaunchesTable.userId, userId),
        gte(launcherLaunchesTable.createdAt, utcStartOfToday()),
      )),
      loadArtwork(userId, input.artworkSeed),
    ]);
    const preview = preparePumpLaunch({
      name: input.name, ticker: input.ticker, description: input.description,
      artworkSeed: input.artworkSeed, creatorAddress: input.creatorAddress,
      initialBuySol: input.initialBuySol,
    }, {
      emergencyStop: settings.emergencyStop,
      maxPerLaunchSol: settings.maxPerLaunchSol,
      dailyLimitSol: settings.dailyLimitSol,
      dailyLaunchLimit: settings.dailyLaunchLimit,
      launchesToday: todayCount[0]?.value ?? 0,
    }, artwork !== null);
    res.setHeader("Cache-Control", "no-store");
    res.json(preview);
  } catch {
    res.status(502).json({ error: "Launch preflight is temporarily unavailable." });
  }
});

router.post("/launcher/launches", authenticatedRateLimit("launch", 5), async (req, res): Promise<void> => {
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
