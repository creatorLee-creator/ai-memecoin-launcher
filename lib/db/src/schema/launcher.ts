import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const launcherLaunchesTable = pgTable("launcher_launches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  description: text("description").notNull(),
  artworkSeed: text("artwork_seed").notNull(),
  contractAddress: text("contract_address"),
  transactionSignature: text("transaction_signature"),
  status: text("status").notNull().default("demo_only"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const launcherSafetySettingsTable = pgTable("launcher_safety_settings", {
  userId: text("user_id").primaryKey(),
  maxPerLaunchSol: numeric("max_per_launch_sol", {
    precision: 12,
    scale: 4,
    mode: "number",
  }).notNull().default(0.25),
  dailyLimitSol: numeric("daily_limit_sol", {
    precision: 12,
    scale: 4,
    mode: "number",
  }).notNull().default(1),
  dailyLaunchLimit: integer("daily_launch_limit").notNull().default(5),
  emergencyStop: boolean("emergency_stop").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const launcherAuditEventsTable = pgTable("launcher_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
