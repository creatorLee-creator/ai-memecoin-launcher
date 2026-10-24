import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenAiTokenGenerator } from "../src/lib/launcher/token-generator.ts";

const valid = { name: "Happy Dog", ticker: "HDOG", description: "A fictional community concept." };

async function withMockedProvider(
  response: () => Promise<Response>,
  run: () => Promise<void>,
) {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-key";
  globalThis.fetch = async () => response();
  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
}

test("OpenAI mode accepts valid generated metadata", async () => {
  await withMockedProvider(
    async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 }),
    async () => {
      const token = await new OpenAiTokenGenerator().generate({ name: "dog theme" });
      assert.equal(token.generationMode, "openai");
      assert.equal(token.ticker, "HDOG");
      assert.equal(token.name, "Happy Dog");
    },
  );
});

test("OpenAI mode rejects malformed token metadata", async () => {
  await withMockedProvider(
    async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...valid, ticker: "bad!" }) } }] }), { status: 200 }),
    async () => {
      await assert.rejects(new OpenAiTokenGenerator().generate({ name: "dog theme" }), /invalid token metadata/);
    },
  );
});

test("OpenAI mode rejects provider errors without switching to demo", async () => {
  await withMockedProvider(
    async () => new Response(JSON.stringify({ error: { message: "quota exhausted" } }), { status: 429 }),
    async () => {
      await assert.rejects(new OpenAiTokenGenerator().generate({ name: "dog theme" }), /provider request failed/);
    },
  );
});

test("OpenAI mode rejects invalid JSON in provider content", async () => {
  await withMockedProvider(
    async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }),
    async () => {
      await assert.rejects(new OpenAiTokenGenerator().generate({ name: "dog theme" }), SyntaxError);
    },
  );
});
