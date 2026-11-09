import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublicTokenMetadata, publishTokenMetadata } from "../src/lib/launcher/public-metadata.ts";
const cid = "bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m";
const input = { name: "Moon Cat", symbol: "MCAT", description: "A fictional cat concept." };
test("metadata uses public IPFS image URI not private storage path", () => {
  const json = buildPublicTokenMetadata(input, cid);
  assert.equal(json.image, "https://ipfs.io/ipfs/" + cid);
  assert.equal(json.createdOn, "https://pump.fun");
  assert.equal(json.showName, true);
});
test("metadata rejects invalid fields and unsafe CIDs", () => {
  assert.throws(() => buildPublicTokenMetadata({ ...input, name: "x".repeat(33) }, cid));
  assert.throws(() => buildPublicTokenMetadata(input, "https://unsafe.test/x"));
});
test("no PINATA_JWT means publisher cannot upload", async () => {
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from([1,2,3])]);
  await assert.rejects(() => publishTokenMetadata(input, png, { jwt: "" }), /not configured/);
});
test("publisher uploads public PNG then JSON, without ever publishing private object path", async () => {
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from([1,2,3])]);
  const calls: { network: string | null; name: string | null; type: string | undefined; body: string }[] = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const form = init?.body as FormData;
    const file = form.get("file") as File;
    calls.push({ network: String(form.get("network")), name: String(form.get("name")),
      type: file.type, body: await file.text() });
    return Response.json({ data: { cid } });
  }) as typeof fetch;
  const result = await publishTokenMetadata(input, png, { jwt: "unit-test-only", fetcher });
  assert.equal(result.imageCid, cid);
  assert.equal(result.metadataUri, "https://ipfs.io/ipfs/" + cid);
  assert.deepEqual(calls.map(x => x.network), ["public", "public"]);
  assert.deepEqual(calls.map(x => x.type), ["image/png", "application/json"]);
  const metadata = JSON.parse(calls[1]!.body);
  assert.equal(metadata.image, result.imageUri);
  assert.equal(calls[1]!.body.includes("launcher-artwork/"), false);
});
