import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoTokenGenerator } from "../src/lib/launcher/token-generator.ts";

test("demo mode produces valid bounded token metadata", async () => {
  const token = await new DemoTokenGenerator().generate({ name: "Happy Dog" });
  assert.equal(token.generationMode, "demo");
  assert.match(token.ticker, /^[A-Z0-9]{2,10}$/);
  assert.ok(token.name.length <= 32);
  assert.ok(token.description.length <= 280);
  assert.ok(token.artworkSeed.length <= 64);
});

test("demo generation preserves a provided description", async () => {
  const token = await new DemoTokenGenerator().generate({
    name: "Happy Dog",
    description: "Community concept only",
  });
  assert.equal(token.description, "Community concept only");
});
