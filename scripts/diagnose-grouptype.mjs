// Probe: enumerate possible GroupType values + check if there's a non-LivenessFace
// generic asset group path that might bypass PrivacyInformation gate.
//
// Run: node scripts/diagnose-grouptype.mjs

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const AK = process.env.BYTEPLUS_AK;
const SK = process.env.BYTEPLUS_SK;
if (!AK || !SK) { console.error("Missing AK/SK"); process.exit(1); }

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
  const canonicalHeaders = `content-type:application/json\nhost:${GATEWAY_HOST}\nx-content-sha256:${payloadHash}\nx-date:${dateStr}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = ["POST", "/", queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateShort}/${REGION}/${SERVICE}/request`;
  const stringToSign = ["HMAC-SHA256", dateStr, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(SK, dateShort);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const auth = `HMAC-SHA256 Credential=${AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    url: `https://${GATEWAY_HOST}/?${queryString}`,
    headers: {
      "Content-Type": "application/json", Host: GATEWAY_HOST,
      "X-Content-Sha256": payloadHash, "X-Date": dateStr, Authorization: auth,
    },
    body: bodyStr,
  };
}

async function call(label, action, body) {
  const s = sign(action, body);
  console.log(`\n──────────────────────────────────`);
  console.log(`▶ ${label}`);
  console.log(`  ${action} ${s.body.slice(0, 200)}${s.body.length > 200 ? "…" : ""}`);
  try {
    const res = await fetch(s.url, { method: "POST", headers: s.headers, body: s.body, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    const err = parsed?.ResponseMetadata?.Error;
    if (err) {
      console.log(`  ✗ ${res.status} [${err.Code}] ${err.Message}`);
    } else {
      console.log(`  ✓ ${res.status} OK  Result keys: ${Object.keys(parsed?.Result || {}).join(", ")}`);
      if (parsed?.Result?.Items) console.log(`     Items: ${parsed.Result.Items.length} (TotalCount=${parsed.Result.TotalCount})`);
    }
    return parsed;
  } catch (e) { console.log(`  ERROR ${e.message}`); }
}

// 1) Probe all possible GroupType values
const GROUP_TYPES = [
  "LivenessFace", "Face", "Image", "Video", "Audio", "Generic",
  "Custom", "DigitalCharacter", "Public", "Private", "Default",
  "RealHuman", "Portrait", "Material", "Trusted",
];
console.log("═══ Phase 1: Enumerate GroupType values ═══");
for (const t of GROUP_TYPES) {
  await call(`GroupType="${t}"`, "ListAssetGroups", {
    Filter: { GroupType: t }, PageNumber: 1, PageSize: 5,
  });
}

// 2) Probe CreateAssetGroup with explicit GroupType
console.log("\n\n═══ Phase 2: CreateAssetGroup with various GroupType ═══");
for (const t of ["AIGC", "AIGCImage", "AIGCVideo", "Generic", "Image", "LivenessFace"]) {
  await call(`Create with GroupType="${t}"`, "CreateAssetGroup", {
    Name: `probe-${t}-${Date.now()}`, GroupType: t,
  });
}

// 2b) ListAssetGroups with AIGC
console.log("\n── List AIGC groups ──");
await call(`List GroupType="AIGC"`, "ListAssetGroups", {
  Filter: { GroupType: "AIGC" }, PageNumber: 1, PageSize: 20,
});

// 3) Try ListAuthorizationAssetGroup with different ownership values
console.log("\n\n═══ Phase 3: AssetOwnership values ═══");
for (const o of ["AuthorizedToMe", "SelfUploaded", "AuthorizedByMe", "Public", "All"]) {
  await call(`Ownership="${o}"`, "ListAuthorizationAssetGroup", {
    Filter: { AssetOwnership: o }, Page: { PageSize: 10, PageNumber: 1 },
  });
}

// 4) Try ListAssets without GroupType to see all asset types in account
console.log("\n\n═══ Phase 4: ListAssets across types ═══");
for (const t of ["LivenessFace", "DigitalCharacter", "Public", "Generic"]) {
  await call(`ListAssets GroupType="${t}"`, "ListAssets", {
    Filter: { GroupType: t, Statuses: ["Active"] },
    PageNumber: 1, PageSize: 50,
  });
}

console.log("\n══════════════════════════════════");
console.log("Done.");
