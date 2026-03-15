import { parseSpec } from "./spec";
import { runSpec, type SuiteResult } from "./runner";

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

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log("Usage: spectral run <spec.yml> [spec2.yml ...]");
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

  console.log("spectral v0.1.0\n");

  const results: SuiteResult[] = [];
  for (const path of specPaths) {
    const spec = parseSpec(path);
    const result = await runSpec(spec);
    results.push(result);
  }

  printResults(results);

  const anyFailed = results.some((r) =>
    r.assertions.some((a) => a.status === "failed")
  );
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
