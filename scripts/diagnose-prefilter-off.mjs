// Probe: with Content Pre-filter turned OFF on the preset endpoint,
// does Seedance 2.0 actually accept a reference image containing a real
// human face?  We test 3 scenarios in parallel:
//
//   A) BytePlus' own sample face image (r2v_tea_pic1)   — public URL
//   B) Same image as base64 data URI                    — inline payload
//   C) A non-human image (control)                      — should always pass
//
// Reads ARK_API_KEY from .env.local (NOT the AK/SK — this is a Bearer key).
// Run:  node scripts/diagnose-prefilter-off.mjs

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

const API_KEY =
  process.env.ARK_API_KEY ||
  process.env.BYTEPLUS_API_KEY ||
  process.env.NEXT_PUBLIC_ARK_API_KEY;
if (!API_KEY) {
  console.error("Missing ARK_API_KEY / BYTEPLUS_API_KEY in .env.local");
  console.error("(this is the Bearer api-key, NOT the AK/SK)");
  process.exit(1);
}

const BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";
const MODEL = "dreamina-seedance-2-0-260128";

const SAMPLE_FACE_URL =
  "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg";
const SAMPLE_PRODUCT_URL =
  "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic2.jpg";

async function fetchAsBase64(url) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "image/jpeg";
  return `data:${ct};base64,${buf.toString("base64")}`;
}

async function createTask(label, content) {
  console.log(`\n──────────────────────────────────────────────`);
  console.log(`▶ ${label}`);
  const body = {
    model: MODEL,
    content,
    generate_audio: false,
    ratio: "16:9",
    duration: 4,
    watermark: true,
  };
  try {
    const res = await fetch(`${BASE}/contents/generations/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log(`  HTTP:   ${res.status} ${res.statusText}`);
    console.log(`  Body:   ${JSON.stringify(parsed, null, 2)}`);
    return { ok: res.ok, status: res.status, parsed };
  } catch (e) {
    console.log(`  ERROR:  ${e.message}`);
    return { ok: false, status: 0, parsed: null };
  }
}

console.log(`Endpoint: ${BASE}`);
console.log(`Model:    ${MODEL}`);
console.log(`API key:  ${API_KEY.slice(0, 8)}…  (length=${API_KEY.length})`);

// A — public URL with face
const a = await createTask(
  "A. Reference image with face (public URL)",
  [
    { type: "text", text: "The woman in image 1 smiles softly at the camera." },
    {
      type: "image_url",
      image_url: { url: SAMPLE_FACE_URL },
      role: "reference_image",
    },
  ]
);

// B — same image inline as base64 (the path our app actually uses)
console.log("\n▷ Fetching face image to encode as base64…");
const faceB64 = await fetchAsBase64(SAMPLE_FACE_URL);
console.log(`  encoded size: ${(faceB64.length / 1024).toFixed(1)} KB`);
const b = await createTask(
  "B. Reference image with face (base64 data URI)",
  [
    { type: "text", text: "The woman in image 1 smiles softly at the camera." },
    {
      type: "image_url",
      image_url: { url: faceB64 },
      role: "reference_image",
    },
  ]
);

// C — control: product image, no human face
const c = await createTask(
  "C. Reference image WITHOUT face (control, public URL)",
  [
    { type: "text", text: "The bottle in image 1 sits on a wooden table." },
    {
      type: "image_url",
      image_url: { url: SAMPLE_PRODUCT_URL },
      role: "reference_image",
    },
  ]
);

console.log(`\n──────────────────────────────────────────────`);
console.log("Summary:");
console.log(`  A (face,  public URL): ${a.status} ${a.ok ? "PASS" : "FAIL"}`);
console.log(`  B (face,  base64):     ${b.status} ${b.ok ? "PASS" : "FAIL"}`);
console.log(`  C (no face, control):  ${c.status} ${c.ok ? "PASS" : "FAIL"}`);
console.log(`\nIf A and B PASS → Pre-filter off was sufficient. Person photos work.`);
console.log(`If A/B FAIL with face-related error → model-level "no real face"`);
console.log(`gate is also active and Pre-filter off alone is NOT enough.`);
