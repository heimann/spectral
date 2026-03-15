import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { allBrowserTools } from "./browser";
import type { Spec, Assertion } from "./spec";

export interface AssertionResult {
  text: string;
  status: "passed" | "failed";
  reasoning: string;
  durationMs: number;
  costUsd: number;
}

export interface SuiteResult {
  suite: string;
  target: string;
  assertions: AssertionResult[];
  costUsd: number;
}

export interface RunOptions {
  onAssertionStart?: (assertion: Assertion, index: number, total: number) => void;
  onAssertionEnd?: (result: AssertionResult, index: number, total: number) => void;
  onToolCall?: (toolName: string, args: any) => void;
}

export async function runSpec(spec: Spec, opts?: RunOptions): Promise<SuiteResult> {
  const results: AssertionResult[] = [];
  const model = (getModel as Function)("anthropic", "claude-haiku-4-5-20251001");

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

  for (let i = 0; i < spec.assertions.length; i++) {
    const assertion = spec.assertions[i];
    opts?.onAssertionStart?.(assertion, i, spec.assertions.length);
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

    let assertionCost = 0;
    agent.subscribe((e) => {
      if (e.type === "tool_execution_start") {
        opts?.onToolCall?.(e.toolName, e.args);
      }
      if (e.type === "message_end" && e.message && "usage" in e.message) {
        assertionCost += (e.message as any).usage?.cost?.total ?? 0;
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Assertion timed out (30s)")), 30000);
    });

    await agent.prompt(
      `Target URL: ${spec.target}\n\nAssertion: "${assertion.text}"${withContext}\n\nEvaluate this assertion now.`
    );

    let verdict: { status: string; reasoning: string };
    try {
      verdict = await Promise.race([verdictPromise, timeoutPromise]);
    } catch {
      verdict = { status: "failed", reasoning: "Agent did not call report_verdict" };
    }
    const durationMs = Date.now() - start;

    const result: AssertionResult = {
      text: assertion.text,
      status: verdict.status as "passed" | "failed",
      reasoning: verdict.reasoning,
      durationMs,
      costUsd: assertionCost,
    };
    results.push(result);
    opts?.onAssertionEnd?.(result, i, spec.assertions.length);
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
    costUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
  };
}
