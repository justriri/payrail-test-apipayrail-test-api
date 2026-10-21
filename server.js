"use strict";
// Payrail test API: a tiny, dependency-free JSON API for the Payrail seller-listing flow.
//
//   GET /health                                online check
//   GET /api/hello                             sample JSON (list THIS URL in Payrail)
//   GET /.well-known/payrail-verification.txt  Payrail domain-ownership proof (see README)
//
// Payrail calls https on port 443 only, never follows redirects, and rejects listed URLs that carry a query
// string, so every route answers directly (no redirects) and the listed endpoint is the bare path.
const http = require("node:http");
const fs = require("node:fs");
const nodePath = require("node:path");

const SERVICE = "payrail-test-api";
const VERIFY_PATH = "/.well-known/payrail-verification.txt";

/** The proof value Payrail expects is exactly `payrail-verify=<token>`. The env var may hold the whole value or just the token. */
function verificationValue(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  const full = v.startsWith("payrail-verify=") ? v : `payrail-verify=${v}`;
  return /^payrail-verify=[0-9a-f]{48}$/.test(full) ? full : null;
}

/**
 * The proof comes from the PAYRAIL_VERIFICATION environment variable if set, otherwise from the committed file
 * .well-known/payrail-verification.txt in this repository (the GitHub verification flow: commit one file, let the host redeploy).
 */
function readCommittedProof(file) {
  try {
    return verificationValue(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function createServer(env = process.env) {
  const startedAt = Date.now();
  const proofFile = env.PAYRAIL_PROOF_FILE || nodePath.join(__dirname, ".well-known", "payrail-verification.txt");
  const currentProof = () => verificationValue(env.PAYRAIL_VERIFICATION) || readCommittedProof(proofFile);

  return http.createServer((req, res) => {
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, {
        "Content-Type": type,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : typeof body === "string" ? body : JSON.stringify(body));
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return send(405, { error: "Method not allowed" });
    }

    let path;
    try {
      path = new URL(req.url, "http://localhost").pathname;
    } catch {
      return send(400, { error: "Bad request" });
    }
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

    if (path === "/health") {
      return send(200, { status: "ok", service: SERVICE, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), timestamp: new Date().toISOString() });
    }
    if (path === "/api/hello") {
      // asOf is a fresh ISO timestamp: Payrail can use it as the freshness field of the response contract
      return send(200, { message: "Hello from my Payrail test API!", service: SERVICE, version: 1, asOf: new Date().toISOString() });
    }
    if (path === VERIFY_PATH) {
      const proof = currentProof();
      if (!proof) {
        // never echo the configured value; only say WHY nothing is served
        const set = String(env.PAYRAIL_VERIFICATION || "").trim() !== "";
        return send(404, {
          error: set
            ? "PAYRAIL_VERIFICATION is set but malformed: it must be the 48 lowercase hex characters Payrail shows, or the whole payrail-verify=<48 hex> value (check for quotes, spaces or a truncated paste)"
            : "No proof is configured: commit .well-known/payrail-verification.txt to the repository (GitHub verification) or set PAYRAIL_VERIFICATION, then let the service redeploy",
          configured: set,
        });
      }
      return send(200, proof, "text/plain; charset=utf-8");
    }
    return send(404, { error: "Endpoint not found" });
  });
}

module.exports = { createServer, verificationValue, VERIFY_PATH };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "0.0.0.0", () => {
    console.log(`${SERVICE} listening on port ${port}`);
  });
}
