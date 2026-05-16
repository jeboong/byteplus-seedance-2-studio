// Validate fanchai.app claim:
// "First Frame slot is significantly looser than Reference Image slot"
//
// Same Unsplash portrait, three submissions:
//   A) role: reference_image
//   B) role: first_frame
//   C) role: last_frame
//
// Run: node scripts/diagnose-slot-difference.mjs

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
const API_KEY = process.env.ARK_API_KEY;
if (!API_KEY) { console.error("Missing ARK_API_KEY"); process.exit(1); }

const BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";
const MODEL = "dreamina-seedance-2-0-260128";
const FACE_URL = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=640&q=80";

async function tryRole(role, prompt) {
  const body = {
    model: MODEL,
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: FACE_URL }, role },
    ],
    generate_audio: false, ratio: "16:9", duration: 4, watermark: true,
  };
  try {
    const res = await fetch(`${BASE}/contents/generations/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { j = text; }
    const ok = res.status === 200 && j?.id;
    if (ok) {
      console.log(`  ✅ role="${role}" → 200 OK, task ${j.id}`);
      // Cancel right away to save credit
      await fetch(`${BASE}/contents/generations/tasks/${j.id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).catch(() => {});
    } else {
      console.log(`  ❌ role="${role}" → ${res.status} [${j?.error?.code}]`);
      console.log(`     ${j?.error?.message}`);
    }
  } catch (e) {
    console.log(`  ⚠ role="${role}" → ${e.message}`);
  }
}

console.log(`Testing whether slot role affects PrivacyInformation moderation`);
console.log(`Image: ${FACE_URL}`);
console.log(`──────────────────────────────────────────────`);

// Test all known role values
const ROLES = [
  ["reference_image", "The woman in image 1 turns and smiles."],
  ["first_frame",     "The woman smiles softly, then turns her head."],
  ["last_frame",      "Camera reveals the woman smiling softly at the end."],
];

for (const [role, prompt] of ROLES) {
  await tryRole(role, prompt);
}

// Also try with NO role specified (default)
console.log("\n  (no role specified — defaults to ?)");
const body = {
  model: MODEL,
  content: [
    { type: "text", text: "The woman smiles." },
    { type: "image_url", image_url: { url: FACE_URL } },
  ],
  generate_audio: false, ratio: "16:9", duration: 4,
};
const res = await fetch(`${BASE}/contents/generations/tasks`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify(body),
});
const text = await res.text();
let j; try { j = JSON.parse(text); } catch { j = text; }
if (res.status === 200) {
  console.log(`  ✅ no role → 200 OK, task ${j.id}`);
  await fetch(`${BASE}/contents/generations/tasks/${j.id}/cancel`, {
    method: "POST", headers: { Authorization: `Bearer ${API_KEY}` },
  }).catch(() => {});
} else {
  console.log(`  ❌ no role → ${res.status} [${j?.error?.code}] ${j?.error?.message}`);
}
