// ─── Test Runner ──────────────────────────────────────────────────
// Runs all test files and prints a pass/fail summary.
//
// Run: npx tsx tests/run-all.ts

import { execSync } from "node:child_process";
import path from "node:path";

const TEST_FILES = [
  "response-parser.test.ts",
  "policy-engine.test.ts",
  "sandbox-executor.test.ts",
  "action-registry.test.ts",
  "web-search-smoke.test.ts",
];

const __dirname = path.dirname(new URL(import.meta.url).pathname);

interface TestResult {
  file: string;
  passed: boolean;
  durationMs: number;
  output: string;
}

function runTestFile(file: string): TestResult {
  const fullPath = path.join(__dirname, file);
  const start = Date.now();

  try {
    const output = execSync(`npx tsx "${fullPath}"`, {
      cwd: path.join(__dirname, ".."),
      timeout: 180_000, // 3 minute timeout per file (ActionRegistry is slow to transpile)
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const duration = Date.now() - start;
    return {
      file,
      passed: true,
      durationMs: duration,
      output,
    };
  } catch (err) {
    const duration = Date.now() - start;
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      file,
      passed: false,
      durationMs: duration,
      output: (error.stdout || "") + (error.stderr || ""),
    };
  }
}

function parseTAP(output: string): { total: number; pass: number; fail: number } {
  let total = 0;
  let pass = 0;
  let fail = 0;

  for (const line of output.split("\n")) {
    if (line.startsWith("ℹ pass ")) {
      pass = parseInt(line.split(" ").pop() || "0", 10);
    } else if (line.startsWith("ℹ fail ")) {
      fail = parseInt(line.split(" ").pop() || "0", 10);
    } else if (line.startsWith("ℹ tests ")) {
      total = parseInt(line.split(" ").pop() || "0", 10);
    }
  }

  return { total, pass, fail };
}

// ── Main ──────────────────────────────────────────────────────────────────
console.log("=".repeat(60));
console.log("  M.A.I. Test Suite — Running all tests");
console.log("=".repeat(60));
console.log();

const results: TestResult[] = [];
let totalPassed = 0;
let totalFailed = 0;
let totalTests = 0;
let totalPass = 0;
let totalFail = 0;

for (const file of TEST_FILES) {
  const shortName = file.replace(".test.ts", "");
  process.stdout.write(`  Running ${shortName.padEnd(30)} ... `);

  const result = runTestFile(file);
  results.push(result);

  const tap = parseTAP(result.output);
  totalTests += tap.total;
  totalPass += tap.pass;
  totalFail += tap.fail;

  if (result.passed) {
    totalPassed++;
    console.log(`✔ PASS  (${(result.durationMs / 1000).toFixed(1)}s, ${tap.pass} tests)`);
  } else {
    totalFailed++;
    console.log(`✖ FAIL  (${(result.durationMs / 1000).toFixed(1)}s, ${tap.pass}/${tap.total} passed)`);
    // Print first few lines of failure output
    const lines = result.output.trim().split("\n");
    const failLines = lines.filter(l => l.includes("✖") || l.includes("AssertionError"));
    for (const line of failLines.slice(0, 5)) {
      console.log(`    ${line.trim().substring(0, 120)}`);
    }
  }
}

console.log();
console.log("-".repeat(60));
console.log(`  Files:  ${totalPassed} passed, ${totalFailed} failed, ${TEST_FILES.length} total`);
console.log(`  Tests:  ${totalPass} passed, ${totalFail} failed, ${totalTests} total`);
console.log("-".repeat(60));

if (totalFailed > 0) {
  console.log();
  console.log("  Some tests failed. Check output above for details.");
  process.exit(1);
} else {
  console.log();
  console.log("  All tests passed! 🎉");
  process.exit(0);
}
