// Diagnostic script: probe BytePlus Asset Library control-plane API
// to find out exactly which calls are blocked and why.
//
// Run:   node scripts/diagnose-asset-api.mjs
// Reads BYTEPLUS_AK / BYTEPLUS_SK from .env.local

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── load .env.local ─────────────────────────────────────────────────────────
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const AK = process.env.BYTEPLUS_AK;
const SK = process.env.BYTEPLUS_SK;
if (!AK || !SK) {
  console.error("Missing BYTEPLUS_AK / BYTEPLUS_SK in .env.local");
  process.exit(1);
}

// ── BytePlus SignV4 (mirror of src/lib/byteplus-sign.ts) ────────────────────
const GATEWAY_HOST = "open.byteplusapi.com";
const REGION = "ap-southeast-1";
const SERVICE = "ark";
const API_VERSION = "2024-01-01";

const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
const sha256Hex = (d) => crypto.createHash("sha256").update(d).digest("hex");

function sign(action, body) {
  const bodyStr = JSON.stringify(body);
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const dateShort = dateStr.substring(0, 8);
  const payloadHash = sha256Hex(bodyStr);
  const queryString = `Action=${action}&Version=${API_VERSION}`;
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${GATEWAY_HOST}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${dateStr}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = [
    "POST", "/", queryString, canonicalHeaders, signedHeaders, payloadHash,
  ].join("\n");
  const credentialScope = `${dateShort}/${REGION}/${SERVICE}/request`;
  const stringToSign = [
    "HMAC-SHA256", dateStr, credentialScope, sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmac(SK, dateShort);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `HMAC-SHA256 Credential=${AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    url: `https://${GATEWAY_HOST}/?${queryString}`,
    headers: {
      "Content-Type": "application/json",
      Host: GATEWAY_HOST,
      "X-Content-Sha256": payloadHash,
      "X-Date": dateStr,
      Authorization: authorization,
    },
    body: bodyStr,
  };
}

async function call(label, action, body) {
  const s = sign(action, body);
  console.log(`\n──────────────────────────────────────────────`);
  console.log(`▶ ${label}`);
  console.log(`  Action: ${action}`);
  console.log(`  Body:   ${s.body}`);
  try {
    const res = await fetch(s.url, {
      method: "POST",
      headers: s.headers,
      body: s.body,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log(`  HTTP:   ${res.status} ${res.statusText}`);
    console.log(`  Body:   ${JSON.stringify(parsed, null, 2)}`);
    return parsed;
  } catch (e) {
    console.log(`  ERROR:  ${e.message}`);
    return null;
  }
}

// ── PROBES ──────────────────────────────────────────────────────────────────
console.log(`Using AK = ${AK.slice(0, 12)}…  region=${REGION}  service=${SERVICE}`);

// 1) Read APIs (cheapest, see if AK/SK is even valid)
await call(
  "1. ListAssetGroups (read, LivenessFace)",
  "ListAssetGroups",
  {
    Filter: { GroupType: "LivenessFace" },
    PageNumber: 1,
    PageSize: 10,
  }
);

await call(
  "2. ListAssetGroups (read, no filter)",
  "ListAssetGroups",
  { PageNumber: 1, PageSize: 10 }
);

await call(
  "3. ListAuthorizationAssetGroup (read, AuthorizedToMe)",
  "ListAuthorizationAssetGroup",
  {
    Filter: { AssetOwnership: "AuthorizedToMe" },
    Page: { PageSize: 10, PageNumber: 1 },
  }
);

// 2) Write API — basic CreateAssetGroup
await call(
  "4. CreateAssetGroup (write, plain)",
  "CreateAssetGroup",
  {
    Name: "diag-test-group",
    Description: "diagnostic test",
  }
);

// 3) Write API — CreateAsset with public URL + Moderation Skip
await call(
  "5. CreateAsset (Moderation Skip, fake group)",
  "CreateAsset",
  {
    GroupId: "group-fake-for-error-probe",
    URL: "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_edit_pic1.jpg",
    AssetType: "Image",
    Moderation: { Strategy: "Skip" },
  }
);

// 4) Write API — CreateAsset without Moderation Skip (default)
await call(
  "6. CreateAsset (default Moderation, fake group)",
  "CreateAsset",
  {
    GroupId: "group-fake-for-error-probe",
    URL: "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_edit_pic1.jpg",
    AssetType: "Image",
  }
);

// ── PHASE 2 — use the REAL existing LivenessFace group ─────────────────────
const REAL_GROUP_ID = "group-20260415133052-l746n";

await call(
  "7. ListAssets in real group (read)",
  "ListAssets",
  {
    Filter: {
      GroupIds: [REAL_GROUP_ID],
      GroupType: "LivenessFace",
      Statuses: ["Active", "Processing", "Failed"],
    },
    PageNumber: 1,
    PageSize: 50,
  }
);

await call(
  "8. GetAssetGroup (real group)",
  "GetAssetGroup",
  { Id: REAL_GROUP_ID }
);

// THE BIG TEST: actually try to create an asset in the real group.
// (Will fail face-match because it's not your face, but we just want to see
//  whether the call passes the subscription gate.)
await call(
  "9. CreateAsset in real group (default Moderation, public sample image)",
  "CreateAsset",
  {
    GroupId: REAL_GROUP_ID,
    URL: "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg",
    AssetType: "Image",
    Name: "diag-probe-default",
  }
);

await call(
  "10. CreateAsset in real group (Moderation Skip)",
  "CreateAsset",
  {
    GroupId: REAL_GROUP_ID,
    URL: "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg",
    AssetType: "Image",
    Name: "diag-probe-skip",
    Moderation: { Strategy: "Skip" },
  }
);

console.log(`\n──────────────────────────────────────────────`);
console.log("Done.");
