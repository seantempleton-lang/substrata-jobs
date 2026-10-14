import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { randomId, sha256Hex } from "../src/domain/crypto.js";

test("UUID fallback uses secure random bytes and preserves UUID v4 version and variant", () => {
  for (const fill of [0, 255]) {
    let called = false;
    const id = randomId({ getRandomValues(bytes) { called = true; assert.equal(bytes.length, 16); return bytes.fill(fill); } });
    assert.ok(called);
    assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.equal(id, fill === 0 ? "00000000-0000-4000-8000-000000000000" : "ffffffff-ffff-4fff-bfff-ffffffffffff");
  }
  const fallback = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  assert.equal(new Set(Array.from({ length: 1000 }, () => randomId(fallback))).size, 1000);
  const native = { randomUUID() { assert.equal(this, native); return "native UUID"; } };
  assert.equal(randomId(native), "native UUID");
  assert.throws(() => randomId({}), /secure record IDs/);
});

test("HTTP SHA-256 fallback matches Node and Web Crypto for empty, Unicode and multi-block input", async () => {
  for (const text of ["", "abc", "Bore BH5049: 12.5 m · m³ · 日報", "Daily bore record\n".repeat(1000)]) {
    const bytes = new TextEncoder().encode(text), expected = createHash("sha256").update(bytes).digest("hex");
    assert.equal(await sha256Hex(bytes, {}), expected);
    assert.equal(await sha256Hex(bytes, webcrypto), expected);
  }
});
