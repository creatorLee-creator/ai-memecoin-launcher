import assert from "node:assert/strict";
import { test } from "node:test";
import { artworkStorageKey } from "../src/lib/launcher/artwork-storage.ts";

test("artwork paths are deterministic for one user's concept", () => {
  assert.equal(artworkStorageKey("owner-one", "cat-token"), artworkStorageKey("owner-one", "cat-token"));
});

test("artwork paths isolate owners and concepts", () => {
  const key = artworkStorageKey("owner-one", "cat-token");
  assert.notEqual(key, artworkStorageKey("owner-two", "cat-token"));
  assert.notEqual(key, artworkStorageKey("owner-one", "dog-token"));
  assert.match(key, /^launcher-artwork\/[a-f0-9]{64}\/[a-f0-9]{64}\.png$/);
  assert.equal(key.includes("owner-one"), false);
});
