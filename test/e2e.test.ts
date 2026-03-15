import { describe, test, expect, beforeAll } from "bun:test";
import { parseSpec } from "../src/spec";
import { runSpec, type SuiteResult } from "../src/runner";

// These tests hit the Claude API and agent-browser - they're slow and cost money.
// Run with: bun test test/e2e.test.ts --timeout 120000

describe("e2e: example.com", () => {
  let result: SuiteResult;
  const events: string[] = [];

  // Run the full spec once, reuse results across tests
  beforeAll(async () => {
    const spec = parseSpec("specs/example.yml");
    result = await runSpec(spec, {
      onAssertionStart: (a, i, total) => {
        events.push(`start:${i}/${total}:${a.text}`);
      },
      onAssertionEnd: (r, i, total) => {
        events.push(`end:${i}/${total}:${r.status}`);
      },
      onToolCall: (name) => {
        events.push(`tool:${name}`);
      },
    });
  }, 120000);

  test("heading assertion passes", () => {
    expect(result.assertions[0].status).toBe("passed");
    expect(result.assertions[0].reasoning).toBeTruthy();
    expect(result.assertions[0].durationMs).toBeGreaterThan(0);
  });

  test("link assertion passes", () => {
    expect(result.assertions[1].status).toBe("passed");
  });

  test("cost is tracked", () => {
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.assertions[0].costUsd).toBeGreaterThan(0);
  });

  test("callbacks fired correctly", () => {
    expect(events.some((e) => e.startsWith("start:"))).toBe(true);
    expect(events.some((e) => e.startsWith("end:"))).toBe(true);
    expect(events.some((e) => e === "tool:browser_open")).toBe(true);
    expect(events.some((e) => e === "tool:browser_snapshot")).toBe(true);
    expect(events.some((e) => e === "tool:report_verdict")).toBe(true);
  });
});

describe("e2e: failing assertion", () => {
  test("reports failure for wrong assertion", async () => {
    const spec = parseSpec("specs/example.yml");
    const badSpec = {
      ...spec,
      assertions: [{ text: "Page displays a login form with email and password fields" }],
    };
    const result = await runSpec(badSpec);
    expect(result.assertions[0].status).toBe("failed");
  }, 60000);
});

describe("e2e: CLI output", () => {
  test("--help prints usage", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "--help"], {
      stdout: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    expect(out).toContain("Usage: spectral run");
  });

  test("unknown command exits with error", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "bogus"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    expect(code).toBe(1);
  });

  test("--json outputs valid JSON", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "run", "specs/example.yml", "--json"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe("0.1.0");
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.total).toBeGreaterThan(0);
    expect(parsed.summary.costUsd).toBeGreaterThanOrEqual(0);
    expect(parsed.suites).toBeInstanceOf(Array);
    expect(parsed.suites[0].assertions).toBeInstanceOf(Array);
  }, 120000);

  test("--quiet outputs minimal format", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "run", "specs/example.yml", "--quiet"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    expect(out).toMatch(/PASS \d+\/\d+ passed/);
    expect(out).not.toContain("spectral v0.1.0");
  }, 120000);

  test("--cost shows cost line", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "run", "specs/example.yml", "--cost"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    expect(out).toMatch(/cost: \$\d+\.\d+/);
  }, 120000);
});
