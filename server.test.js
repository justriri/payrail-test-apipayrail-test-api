"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer, verificationValue } = require("./server.js");

const NO_FILE = require("node:path").join(__dirname, "does-not-exist", "proof.txt"); // the repository commits the real proof, so "not configured" tests point away from it
const TOKEN = "0123456789abcdef".repeat(3); // 48 hex characters, the shape Payrail issues

function start(env = {}) {
  return new Promise((resolve) => {
    const server = createServer(env);
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
const stop = (s) => new Promise((r) => s.server.close(r));

test("GET /health returns JSON saying the API is online", async () => {
  const s = await start();
  try {
    const r = await fetch(`${s.base}/health`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /application\/json/);
    const b = await r.json();
    assert.equal(b.status, "ok");
    assert.equal(b.service, "payrail-test-api");
    assert.ok(!Number.isNaN(Date.parse(b.timestamp)));
  } finally { await stop(s); }
});

test("GET /api/hello returns the sample JSON with a fresh asOf timestamp", async () => {
  const s = await start();
  try {
    const r = await fetch(`${s.base}/api/hello`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /application\/json/);
    const b = await r.json();
    assert.equal(b.message, "Hello from my Payrail test API!");
    assert.equal(b.service, "payrail-test-api");
    assert.equal(typeof b.version, "number");
    assert.ok(Math.abs(Date.now() - Date.parse(b.asOf)) < 5000, "asOf is current");
  } finally { await stop(s); }
});

test("routes answer directly: a trailing slash or a query string never redirects", async () => {
  const s = await start();
  try {
    for (const p of ["/health/", "/api/hello/", "/api/hello?x=1"]) {
      const r = await fetch(`${s.base}${p}`, { redirect: "manual" });
      assert.equal(r.status, 200, p);
    }
  } finally { await stop(s); }
});

test("unknown paths are 404 JSON; other methods are 405", async () => {
  const s = await start();
  try {
    const nf = await fetch(`${s.base}/nope`);
    assert.equal(nf.status, 404);
    assert.deepEqual(await nf.json(), { error: "Endpoint not found" });
    const post = await fetch(`${s.base}/api/hello`, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
    const head = await fetch(`${s.base}/health`, { method: "HEAD" });
    assert.equal(head.status, 200);
  } finally { await stop(s); }
});

test("Payrail verification file: served exactly as payrail-verify=<token> when configured (token only or full value)", async () => {
  for (const env of [TOKEN, `payrail-verify=${TOKEN}`, `  ${TOKEN}\n`]) {
    const s = await start({ PAYRAIL_VERIFICATION: env });
    try {
      const r = await fetch(`${s.base}/.well-known/payrail-verification.txt`, { redirect: "manual" });
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type"), /^text\/plain/);
      assert.equal((await r.text()).trim(), `payrail-verify=${TOKEN}`);
    } finally { await stop(s); }
  }
});

test("verification is never faked: not configured or malformed means 404", async () => {
  for (const env of [undefined, "", "not-a-token", "payrail-verify=short", `${TOKEN}zz`]) {
    const s = await start(env === undefined ? { PAYRAIL_PROOF_FILE: NO_FILE } : { PAYRAIL_VERIFICATION: env, PAYRAIL_PROOF_FILE: NO_FILE });
    try {
      const r = await fetch(`${s.base}/.well-known/payrail-verification.txt`);
      assert.equal(r.status, 404, String(env));
    } finally { await stop(s); }
  }
  assert.equal(verificationValue(TOKEN), `payrail-verify=${TOKEN}`);
  assert.equal(verificationValue("x"), null);
});

test("the 404 says WHY (not set vs malformed) and never echoes the configured value", async () => {
  const unset = await start({ PAYRAIL_PROOF_FILE: NO_FILE });
  try {
    const b = await (await fetch(`${unset.base}/.well-known/payrail-verification.txt`)).json();
    assert.equal(b.configured, false);
    assert.match(b.error, /No proof is configured/);
  } finally { await stop(unset); }
  const secretish = "payrail-verify=SHOULD-NOT-LEAK";
  const bad = await start({ PAYRAIL_VERIFICATION: secretish, PAYRAIL_PROOF_FILE: NO_FILE });
  try {
    const r = await fetch(`${bad.base}/.well-known/payrail-verification.txt`);
    assert.equal(r.status, 404);
    const text = await r.text();
    assert.match(text, /malformed/);
    assert.ok(!text.includes("SHOULD-NOT-LEAK"));
  } finally { await stop(bad); }
});

test("the exact bytes served are payrail-verify=<token>: no JSON, no newline, no extra text", async () => {
  const s = await start({ PAYRAIL_VERIFICATION: TOKEN });
  try {
    const r = await fetch(`${s.base}/.well-known/payrail-verification.txt`);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.toString("utf8"), `payrail-verify=${TOKEN}`);
    assert.equal(buf.length, "payrail-verify=".length + 48);
    assert.match(r.headers.get("content-type"), /^text\/plain/);
  } finally { await stop(s); }
});

test("GitHub flow: a committed .well-known/payrail-verification.txt is served when the env var is not set (and the env var wins when both exist)", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const nodePath = require("node:path");
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "proof-"));
  const file = nodePath.join(dir, "payrail-verification.txt");
  const OTHER = "fedcba9876543210".repeat(3);
  try {
    fs.writeFileSync(file, `payrail-verify=${TOKEN}\n`);
    const s = await start({ PAYRAIL_PROOF_FILE: file });
    try {
      const r = await fetch(`${s.base}/.well-known/payrail-verification.txt`);
      assert.equal(r.status, 200);
      assert.equal(await r.text(), `payrail-verify=${TOKEN}`);
    } finally { await stop(s); }
    const both = await start({ PAYRAIL_PROOF_FILE: file, PAYRAIL_VERIFICATION: OTHER });
    try {
      assert.equal(await (await fetch(`${both.base}/.well-known/payrail-verification.txt`)).text(), `payrail-verify=${OTHER}`);
    } finally { await stop(both); }
    fs.writeFileSync(file, "garbage");
    const bad = await start({ PAYRAIL_PROOF_FILE: file });
    try {
      assert.equal((await fetch(`${bad.base}/.well-known/payrail-verification.txt`)).status, 404);
    } finally { await stop(bad); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
