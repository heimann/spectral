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
