import { parseSpec } from "./spec";
import { runSpec, type AssertionResult, type SuiteResult } from "./runner";

const quiet = process.argv.includes("--quiet") || process.argv.includes("-q");
const debug = process.argv.includes("--debug");
const jsonOutput = process.argv.includes("--json");
const showCost = process.argv.includes("--cost");

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;
let spinnerMsg = "";

function startSpinner() {
  if (quiet || spinnerInterval) return;
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER.length;
    process.stderr.write(`\r\x1b[K  \x1b[36m${SPINNER[spinnerFrame]}\x1b[0m  ${spinnerMsg}`);
  }, 120);
}

function status(msg: string) {
  if (quiet || jsonOutput) return;
  if (debug) {
    // In debug mode, print the header as a permanent line
    process.stderr.write(`\r\x1b[K  \x1b[36m~\x1b[0m  ${msg}\n`);
    spinnerMsg = "";
    startSpinner();
  } else {
    spinnerMsg = msg;
    startSpinner();
    process.stderr.write(`\r\x1b[K  \x1b[36m${SPINNER[spinnerFrame]}\x1b[0m  ${spinnerMsg}`);
  }
}

function clearStatus() {
  if (quiet || jsonOutput) return;
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
  process.stderr.write(`\r\x1b[K`);
}

function debugLine(msg: string) {
  if (!debug) return;
  // Clear spinner, print debug line in red, re-render spinner below
  process.stderr.write(`\r\x1b[K`);
  process.stderr.write(`        \x1b[31m${msg}\x1b[0m\n`);
  process.stderr.write(`  \x1b[36m${SPINNER[spinnerFrame]}\x1b[0m  ${spinnerMsg}`);
}

function formatToolCall(name: string, args: any): string {
  const short = name.replace("browser_", "");
  const parts: string[] = [];
  if (args?.url) parts.push(args.url);
  if (args?.target) parts.push(args.target);
  if (args?.value) parts.push(`"${args.value}"`);
  if (args?.status) parts.push(args.status);
  if (args?.reasoning) parts.push(args.reasoning);
  return parts.length > 0 ? `${short}(${parts.join(", ")})` : short;
}

function printResults(results: SuiteResult[]) {
  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of results) {
    const url = new URL(suite.target);
    console.log(`\n> ${suite.suite} (${url.host}${url.pathname})`);

    for (const a of suite.assertions) {
      const duration = (a.durationMs / 1000).toFixed(1);
      const tag = a.status === "passed" ? "pass" : "fail";
      const padding = " ".repeat(Math.max(0, 55 - a.text.length));
      console.log(`  ${tag}  ${a.text}${padding}${duration}s`);

      if (a.status === "failed") {
        console.log(`        ${a.reasoning}`);
        totalFailed++;
      } else {
        totalPassed++;
      }
    }
  }

  const total = totalPassed + totalFailed;
  console.log(
    `\n${totalFailed > 0 ? totalFailed + " failed, " : ""}${totalPassed} passed (${total} total)`
  );
}

function printQuietResults(results: SuiteResult[]) {
  let passed = 0;
  let failed = 0;
  const failures: AssertionResult[] = [];

  for (const suite of results) {
    for (const a of suite.assertions) {
      if (a.status === "passed") passed++;
      else {
        failed++;
        failures.push(a);
      }
    }
  }

  for (const f of failures) {
    console.log(`FAIL  ${f.text}`);
    console.log(`      ${f.reasoning}`);
  }

  const total = passed + failed;
  const s = failed > 0 ? "FAIL" : "PASS";
  console.log(`${s} ${passed}/${total} passed`);
}

async function main() {
  const flags = ["--quiet", "-q", "--debug", "--json", "--cost"];
  const args = process.argv.slice(2).filter((a) => !flags.includes(a));

  if (args.length === 0 || args[0] === "--help") {
    console.log("Usage: spectral run <spec.yml> [spec2.yml ...] [--quiet] [--debug] [--json] [--cost]");
    process.exit(0);
  }

  if (args[0] !== "run") {
    console.error(`Unknown command: ${args[0]}`);
    process.exit(1);
  }

  const specPaths = args.slice(1);
  if (specPaths.length === 0) {
    console.error("No spec files provided");
    process.exit(1);
  }

  if (!quiet && !jsonOutput) console.log("spectral v0.1.0\n");

  const results: SuiteResult[] = [];

  for (const path of specPaths) {
    const spec = parseSpec(path);

    const result = await runSpec(spec, {
      onAssertionStart: (assertion, i, total) => {
        status(`[${i + 1}/${total}] ${spec.suite}: ${assertion.text}`);
      },
      onAssertionEnd: () => {
        clearStatus();
      },
      onToolCall: (name, args) => {
        debugLine(formatToolCall(name, args));
      },
    });

    results.push(result);
  }

  const anyFailed = results.some((r) =>
    r.assertions.some((a) => a.status === "failed")
  );

  if (jsonOutput) {
    const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
    let passed = 0, failed = 0;
    for (const r of results) for (const a of r.assertions) a.status === "passed" ? passed++ : failed++;
    console.log(JSON.stringify({
      version: "0.1.0",
      summary: { passed, failed, total: passed + failed, costUsd: totalCost },
      suites: results,
    }, null, 2));
  } else if (quiet) {
    printQuietResults(results);
  } else {
    printResults(results);
  }

  if (showCost && !jsonOutput) {
    const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
    console.log(`\ncost: $${totalCost.toFixed(4)}`);
  }

  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
