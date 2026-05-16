// Phase 2: poll the tasks created in diagnose-prefilter-off.mjs
// to see whether real-face references actually pass moderation
// at the processing stage (not just task creation).
//
// Run TWO probes in parallel:
//   - the BytePlus sample face (likely whitelisted)
//   - a Wikipedia public-figure photo (real PrivacyInformation case)
//   - a generic non-face photo (control)
//
// Run:  node scripts/diagnose-prefilter-poll.mjs

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

const TESTS = [
  {
    label: "1. BytePlus official sample face (whitelisted?)",
    text: "The woman in image 1 smiles softly at the camera.",
    url: "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg",
  },
  {
    label: "2. Public figure (Elon Musk, Wikipedia)",
    text: "The man in image 1 turns his head and smiles at the camera.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Elon_Musk_Royal_Society_%28crop2%29.jpg/640px-Elon_Musk_Royal_Society_%28crop2%29.jpg",
  },
  {
    label: "3. Generic random portrait (Unsplash, non-celeb)",
    text: "The person in image 1 turns their head and smiles softly.",
    url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=640&q=80",
  },
  {
    label: "4. Non-face control (cup of tea)",
    text: "The cup of tea in image 1 sits on a wooden table, steam rising.",
    url: "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic2.jpg",
  },
];

async function createTask(t) {
  const body = {
    model: MODEL,
    content: [
      { type: "text", text: t.text },
      { type: "image_url", image_url: { url: t.url }, role: "reference_image" },
    ],
    generate_audio: false, ratio: "16:9", duration: 4, watermark: true,
  };
  const res = await fetch(`${BASE}/contents/generations/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: res.status, body: j };
}

async function getTask(id) {
  const res = await fetch(`${BASE}/contents/generations/tasks/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: res.status, body: j };
}

async function cancel(id) {
  try {
    await fetch(`${BASE}/contents/generations/tasks/${id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {}
}

console.log(`Endpoint: ${BASE}\nModel: ${MODEL}\n`);

const tasks = [];
for (const t of TESTS) {
  console.log(`─── ${t.label} ───`);
  const r = await createTask(t);
  if (r.status === 200 && r.body?.id) {
    console.log(`  ✓ task created: ${r.body.id}`);
    tasks.push({ ...t, id: r.body.id });
  } else {
    console.log(`  ✗ creation FAILED: ${r.status}`);
    console.log(`    ${JSON.stringify(r.body)}`);
    tasks.push({ ...t, id: null, createError: r });
  }
}

console.log(`\nWaiting for processing... (poll every 5s, max 90s each)\n`);

const results = {};
const deadline = Date.now() + 90_000;
const pending = new Set(tasks.filter((t) => t.id).map((t) => t.id));

while (pending.size > 0 && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  for (const id of [...pending]) {
    const r = await getTask(id);
    const status = r.body?.status;
    const t = tasks.find((x) => x.id === id);
    process.stdout.write(`  [${id.slice(-6)}] ${status ?? "?"} `);
    if (["succeeded", "failed", "cancelled"].includes(status)) {
      results[id] = r.body;
      pending.delete(id);
      console.log(`← done`);
      if (status === "failed") {
        console.log(`     error: ${JSON.stringify(r.body?.error || r.body)}`);
      }
    } else {
      console.log("");
    }
  }
}

// Cancel still-pending tasks to save credit
for (const id of pending) await cancel(id);

console.log(`\n══════════════════════════════════════════`);
console.log(`SUMMARY`);
console.log(`══════════════════════════════════════════`);
for (const t of tasks) {
  if (!t.id) {
    console.log(`\n${t.label}\n  ✗ creation rejected: ${t.createError?.body?.error?.code || t.createError?.status}`);
    console.log(`    msg: ${t.createError?.body?.error?.message || JSON.stringify(t.createError?.body)}`);
    continue;
  }
  const r = results[t.id];
  if (!r) { console.log(`\n${t.label}\n  ⏱ still pending after 90s (cancelled)`); continue; }
  console.log(`\n${t.label}`);
  console.log(`  status: ${r.status}`);
  if (r.error) console.log(`  error:  [${r.error.code}] ${r.error.message}`);
  if (r.content?.video_url) console.log(`  video:  ${r.content.video_url.slice(0, 80)}…`);
}
