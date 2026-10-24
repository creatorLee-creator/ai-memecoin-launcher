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

import { OpenAiTokenGenerator } from "../src/lib/launcher/token-generator.ts";

async function withMockProvider(
  mock: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  globalThis.fetch = mock;
  process.env.OPENAI_API_KEY = "test-key-not-real";
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
}

test("OpenAI mode accepts valid generated metadata", async () => {
  await withMockProvider(async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-key-not-real");
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        name: "Moon Dog", ticker: "MDOG", description: "A fictional dog-themed community concept.",
      }) } }],
    }), { status: 200 });
  }, async () => {
    const token = await new OpenAiTokenGenerator().generate({ name: "dog meme" });
    assert.equal(token.generationMode, "openai");
    assert.equal(token.name, "Moon Dog");
    assert.equal(token.ticker, "MDOG");
    assert.ok(token.id);
  });
});

test("OpenAI mode rejects malformed token metadata", async () => {
  await withMockProvider(async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      name: "Moon Dog", ticker: "invalid!", description: "A fictional token.",
    }) } }],
  }), { status: 200 }), async () => {
    await assert.rejects(
      new OpenAiTokenGenerator().generate({ name: "dog" }),
      /invalid token metadata/,
    );
  });
});

test("OpenAI mode rejects provider errors without switching to demo", async () => {
  await withMockProvider(async () => new Response("insufficient_quota", { status: 429 }), async () => {
    await assert.rejects(
      new OpenAiTokenGenerator().generate({ name: "dog" }),
      /AI provider request failed/,
    );
  });
});

test("OpenAI mode rejects invalid JSON in provider content", async () => {
  await withMockProvider(async () => new Response(JSON.stringify({
    choices: [{ message: { content: "not json" } }],
  }), { status: 200 }), async () => {
    await assert.rejects(new OpenAiTokenGenerator().generate({ name: "dog" }), SyntaxError);
  });
});
