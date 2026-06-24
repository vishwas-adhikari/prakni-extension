// Precision corpus harness. Runs the engine over the labelled legit + phish sets
// and prints the two numbers that matter (docs/detection.md "Measuring precision"):
//
//   false-positive % on legit  → target < 2%
//   catch % on phish           → target ≥ 90%
//
// Phish samples may be tagged "expectSafe": true — deliberate precision proofs
// (e.g. weak-only lures that MUST stay Safe). These are excluded from Catch %,
// reported separately, and fail the run if the engine warns on them.
//
// Run with: npm run harness
import * as fs from "fs";
import * as path from "path";
import { analyzeEmail, EmailData, Verdict } from "../../src/index";

// P0 exit criterion (docs/roadmap.md).
const MAX_FP_PERCENT = 2;
const MIN_CATCH_PERCENT = 90;

interface Case {
  file: string;
  data: EmailData;
  expectSafe: boolean;
}

function loadDir(dir: string): Case[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      return { file: f, data: raw as EmailData, expectSafe: raw.expectSafe === true };
    });
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function verdictLabel(v: Verdict): string {
  return `${v.riskLevel} (${v.score})`;
}

const corpusRoot = __dirname;
const legit = loadDir(path.join(corpusRoot, "legit"));
const phishAll = loadDir(path.join(corpusRoot, "phish"));
const phish = phishAll.filter((c) => !c.expectSafe);
const proofs = phishAll.filter((c) => c.expectSafe);

console.log("\n=== Cred Mail — precision corpus ===\n");

// Legit set: anything not Safe is a false positive.
console.log("LEGIT  (want: Safe / silent)");
let falsePositives = 0;
for (const c of legit) {
  const v = analyzeEmail(c.data);
  const fp = v.riskLevel !== "Safe";
  if (fp) falsePositives++;
  console.log(`  ${fp ? "FP " : "ok "} ${pad(c.file, 38)} ${verdictLabel(v)}`);
}

// Phish set: anything not Safe is a catch.
console.log("\nPHISH  (want: Suspicious / High Risk)");
let catches = 0;
for (const c of phish) {
  const v = analyzeEmail(c.data);
  const caught = v.riskLevel !== "Safe";
  if (caught) catches++;
  console.log(`  ${caught ? "hit " : "MISS"} ${pad(c.file, 38)} ${verdictLabel(v)}`);
}

// Precision proofs: phish-shaped mail that MUST stay Safe (weak-only lures).
console.log("\nPRECISION PROOFS  (tagged expectSafe — want: Safe)");
let proofFailures = 0;
for (const c of proofs) {
  const v = analyzeEmail(c.data);
  const ok = v.riskLevel === "Safe";
  if (!ok) proofFailures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${pad(c.file, 38)} ${verdictLabel(v)}`);
}

const fpPercent = legit.length ? (falsePositives / legit.length) * 100 : 0;
const catchPercent = phish.length ? (catches / phish.length) * 100 : 0;

console.log("\n--- results ---");
console.log(
  `false positives : ${falsePositives}/${legit.length}  (${fpPercent.toFixed(1)}%)  target < ${MAX_FP_PERCENT}%`,
);
console.log(
  `catches         : ${catches}/${phish.length}  (${catchPercent.toFixed(1)}%)  target >= ${MIN_CATCH_PERCENT}%`,
);
console.log(
  `precision proofs: ${proofs.length - proofFailures}/${proofs.length} stayed Safe`,
);

const pass =
  fpPercent < MAX_FP_PERCENT &&
  catchPercent >= MIN_CATCH_PERCENT &&
  proofFailures === 0;
console.log(`\nP0 exit criterion: ${pass ? "PASS" : "FAIL"}\n`);

process.exit(pass ? 0 : 1);
