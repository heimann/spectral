# Spectral v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A Bun CLI that parses YAML spec files with natural-language assertions and verifies them against a running web app using agent-browser + PI SDK.

**Architecture:** CLI entry point parses YAML specs, then for each suite creates a PI agent with agent-browser commands as tools. The agent navigates to the target URL, takes a snapshot, and judges each assertion as pass/fail. Results print to stdout.

**Tech Stack:** Bun, TypeScript, PI SDK (@mariozechner/pi-agent-core + @mariozechner/pi-ai), agent-browser (global npm install), js-yaml.

---

### Task 1: Project scaffold and dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts` (stub)

**Step 1: Initialize project**

```bash
cd ~/code/spectral
bun init -y
```

**Step 2: Install dependencies**

```bash
bun add @mariozechner/pi-agent-core @mariozechner/pi-ai js-yaml
bun add -d @types/js-yaml
```

**Step 3: Install agent-browser globally**

```bash
npm install -g agent-browser
agent-browser install
```

**Step 4: Verify agent-browser works**

```bash
agent-browser open https://example.com
agent-browser snapshot
agent-browser close
```

**Step 5: Create minimal entry point**

`src/index.ts`:
```typescript
console.log("spectral v0.1.0");
```

**Step 6: Verify it runs**

```bash
bun run src/index.ts
```

Expected: `spectral v0.1.0`

**Step 7: Commit**

```bash
git add package.json tsconfig.json bun.lock src/index.ts
git commit -m "scaffold: init project with PI SDK and agent-browser deps"
```

---

### Task 2: YAML spec parser

**Files:**
- Create: `src/spec.ts`
- Create: `specs/auth.yml` (example spec for radar)

**Step 1: Create example spec**

`specs/auth.yml`:
```yaml
suite: Authentication
target: http://localhost:4000/login

assertions:
  - Login page renders email and password fields
  - Page has a heading or title related to login
```

Keep assertions simple for now - things we can verify without credentials or form submission.

**Step 2: Write the spec parser**

`src/spec.ts`:
```typescript
import yaml from "js-yaml";
import { readFileSync } from "fs";

export interface Assertion {
  text: string;
  with?: Record<string, string>;
  deps?: string[];
}

export interface Spec {
  suite: string;
  target: string;
  assertions: Assertion[];
}

export function parseSpec(path: string): Spec {
  const raw = yaml.load(readFileSync(path, "utf8")) as any;

  if (!raw.suite || !raw.target || !raw.assertions) {
    throw new Error(`Invalid spec ${path}: needs suite, target, assertions`);
  }

  const assertions: Assertion[] = raw.assertions.map((a: any) => {
    if (typeof a === "string") {
      return { text: a };
    }
    // Object form: { "assertion text": { with: {...}, deps: [...] } }
    const [text, opts] = Object.entries(a)[0] as [string, any];
    return {
      text,
      with: opts?.with,
      deps: opts?.deps,
    };
  });

  return {
    suite: raw.suite,
    target: raw.target,
    assertions,
  };
}
```

**Step 3: Test the parser manually**

Update `src/index.ts` temporarily:
```typescript
import { parseSpec } from "./spec";
const spec = parseSpec(process.argv[2] || "specs/auth.yml");
console.log(JSON.stringify(spec, null, 2));
```

Run:
```bash
bun run src/index.ts specs/auth.yml
```

Expected: JSON output with suite, target, and parsed assertions.

**Step 4: Commit**

```bash
git add src/spec.ts specs/auth.yml src/index.ts
git commit -m "feat: YAML spec parser with example auth spec"
```

---

### Task 3: agent-browser tool wrappers

**Files:**
- Create: `src/browser.ts`

**Step 1: Write browser tools for PI agent**

`src/browser.ts` - wraps agent-browser CLI commands as PI AgentTool objects:

```typescript
import type { AgentTool } from "@mariozechner/pi-agent-core";

function exec(args: string[]): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const proc = Bun.spawn(["agent-browser", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code !== 0) {
      reject(new Error(`agent-browser ${args.join(" ")} failed: ${stderr}`));
    } else {
      resolve(stdout.trim());
    }
  });
}

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
  details: {},
});

export const openTool: AgentTool = {
  name: "browser_open",
  label: "Open URL",
  description: "Navigate the browser to a URL. Call this first.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to navigate to" },
    },
    required: ["url"],
  } as any,
  execute: async (_id, params: any) => {
    const out = await exec(["open", params.url]);
    return textResult(out || "Page opened.");
  },
};

export const snapshotTool: AgentTool = {
  name: "browser_snapshot",
  label: "Take Snapshot",
  description:
    "Get the accessibility tree of the current page. Returns element refs like @e1, @e2 that can be used with click/fill. Use -i flag to get only interactive elements.",
  parameters: {
    type: "object",
    properties: {
      interactive_only: {
        type: "boolean",
        description: "If true, only return interactive elements",
      },
    },
  } as any,
  execute: async (_id, params: any) => {
    const args = ["snapshot"];
    if (params?.interactive_only) args.push("-i");
    const out = await exec(args);
    return textResult(out);
  },
};

export const clickTool: AgentTool = {
  name: "browser_click",
  label: "Click Element",
  description: "Click an element by ref (e.g. @e1) or CSS selector.",
  parameters: {
    type: "object",
    properties: {
      target: { type: "string", description: "Element ref (@e1) or CSS selector" },
    },
    required: ["target"],
  } as any,
  execute: async (_id, params: any) => {
    const out = await exec(["click", params.target]);
    return textResult(out || "Clicked.");
  },
};

export const fillTool: AgentTool = {
  name: "browser_fill",
  label: "Fill Input",
  description: "Fill a text input with a value.",
  parameters: {
    type: "object",
    properties: {
      target: { type: "string", description: "Element ref (@e1) or CSS selector" },
      value: { type: "string", description: "Text to fill" },
    },
    required: ["target", "value"],
  } as any,
  execute: async (_id, params: any) => {
    const out = await exec(["fill", params.target, params.value]);
    return textResult(out || "Filled.");
  },
};

export const getTextTool: AgentTool = {
  name: "browser_get_text",
  label: "Get Text",
  description: "Get the text content of an element.",
  parameters: {
    type: "object",
    properties: {
      target: { type: "string", description: "Element ref (@e1) or CSS selector" },
    },
    required: ["target"],
  } as any,
  execute: async (_id, params: any) => {
    const out = await exec(["get", "text", params.target]);
    return textResult(out);
  },
};

export const closeTool: AgentTool = {
  name: "browser_close",
  label: "Close Browser",
  description: "Close the browser session.",
  parameters: {
    type: "object",
    properties: {},
  } as any,
  execute: async () => {
    const out = await exec(["close"]);
    return textResult(out || "Browser closed.");
  },
};

export const allBrowserTools = [
  openTool,
  snapshotTool,
  clickTool,
  fillTool,
  getTextTool,
  closeTool,
];
```

**Step 2: Quick smoke test**

Write a tiny script to test one tool:
```bash
bun -e "
import { openTool, snapshotTool, closeTool } from './src/browser';
await openTool.execute('t1', { url: 'https://example.com' });
const snap = await snapshotTool.execute('t2', {});
console.log(snap.content[0].text.slice(0, 200));
await closeTool.execute('t3', {});
"
```

Expected: Some accessibility tree output from example.com.

**Step 3: Commit**

```bash
git add src/browser.ts
git commit -m "feat: agent-browser CLI tool wrappers for PI agent"
```

---

### Task 4: Runner - PI agent that judges assertions

**Files:**
- Create: `src/runner.ts`

**Step 1: Write the runner**

`src/runner.ts`:
```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { allBrowserTools } from "./browser";
import type { Spec, Assertion } from "./spec";

export interface AssertionResult {
  text: string;
  status: "passed" | "failed";
  reasoning: string;
  durationMs: number;
}

export interface SuiteResult {
  suite: string;
  target: string;
  assertions: AssertionResult[];
}

export async function runSpec(spec: Spec): Promise<SuiteResult> {
  const results: AssertionResult[] = [];
  const model = (getModel as Function)("anthropic", "claude-sonnet-4-20250514");

  // Declare the verdict tool that the agent calls to report pass/fail
  const verdictRef: { resolve?: (v: any) => void } = {};

  const verdictTool = {
    name: "report_verdict",
    label: "Report Verdict",
    description:
      "Report whether the assertion passes or fails. You MUST call this exactly once per assertion.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["passed", "failed"],
          description: "Whether the assertion passes or fails",
        },
        reasoning: {
          type: "string",
          description: "Brief explanation of why (1-2 sentences)",
        },
      },
      required: ["status", "reasoning"],
    } as any,
    execute: async (_id: string, params: any) => {
      verdictRef.resolve?.(params);
      return {
        content: [{ type: "text" as const, text: "Verdict recorded." }],
        details: {},
      };
    },
  };

  for (const assertion of spec.assertions) {
    const start = Date.now();

    const verdictPromise = new Promise<{ status: string; reasoning: string }>(
      (resolve) => {
        verdictRef.resolve = resolve;
      }
    );

    const withContext = assertion.with
      ? `\nContext: ${JSON.stringify(assertion.with)}`
      : "";

    const agent = new Agent({
      initialState: {
        systemPrompt: `You are an e2e test judge. You have browser tools to inspect a web page.

Your task:
1. The browser is not yet open. First call browser_open with the target URL.
2. Take a snapshot to see the page content.
3. Evaluate whether the following assertion is true about the page.
4. If you need to interact with the page (click, fill forms) to evaluate the assertion, do so.
5. Call report_verdict with "passed" or "failed" and a brief reasoning.

Be strict: the assertion must clearly be true based on what you observe. If ambiguous, fail it.`,
        model,
        tools: [...allBrowserTools, verdictTool],
      },
    });

    await agent.prompt(
      `Target URL: ${spec.target}\n\nAssertion: "${assertion.text}"${withContext}\n\nEvaluate this assertion now.`
    );

    const verdict = await verdictPromise;
    const durationMs = Date.now() - start;

    results.push({
      text: assertion.text,
      status: verdict.status as "passed" | "failed",
      reasoning: verdict.reasoning,
      durationMs,
    });
  }

  // Close browser after suite
  try {
    const { closeTool } = await import("./browser");
    await closeTool.execute("cleanup", {});
  } catch {}

  return {
    suite: spec.suite,
    target: spec.target,
    assertions: results,
  };
}
```

**Step 2: Commit**

```bash
git add src/runner.ts
git commit -m "feat: PI agent runner that judges assertions via agent-browser"
```

---

### Task 5: CLI entry point with formatted output

**Files:**
- Modify: `src/index.ts`

**Step 1: Write the CLI**

`src/index.ts`:
```typescript
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
```

**Step 2: Verify it runs (dry, no server needed)**

```bash
bun run src/index.ts --help
```

Expected: `Usage: spectral run <spec.yml> [spec2.yml ...]`

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: CLI entry point with formatted output"
```

---

### Task 6: End-to-end test against radar

**Requires:** Radar app running on localhost:4000.

**Step 1: Start radar in another terminal**

```bash
cd ~/code/radar && mix phx.server
```

**Step 2: Run spectral against the auth spec**

```bash
cd ~/code/spectral
bun run src/index.ts run specs/auth.yml
```

Expected output:
```
spectral v0.1.0

> Authentication (localhost:4000/login)
  pass  Login page renders email and password fields     X.Xs
  pass  Page has a heading or title related to login     X.Xs

2 passed (2 total)
```

**Step 3: If anything fails, debug and fix**

Common issues:
- agent-browser not installed: `npm install -g agent-browser && agent-browser install`
- ANTHROPIC_API_KEY not set: `set -x ANTHROPIC_API_KEY <key>`
- Browser not found: `agent-browser install` downloads Chromium
- Radar not running: start it first

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: adjustments from e2e validation"
```

---

### Summary

| Task | What | Est. |
|------|------|------|
| 1 | Project scaffold + deps | 3 min |
| 2 | YAML spec parser | 5 min |
| 3 | agent-browser tool wrappers | 5 min |
| 4 | PI agent runner | 5 min |
| 5 | CLI entry point | 5 min |
| 6 | E2E validation against radar | 5 min |

Total: 6 tasks, ~4 files of real code, one example spec.
