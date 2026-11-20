import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SalesforceError } from "./salesforce.js";

export class ToolError extends Error {
  constructor(
    public code: string,
    public say: string,
    public details: Record<string, unknown> = {},
  ) {
    super(say);
    this.name = "ToolError";
  }
}

function text(data: unknown): CallToolResult["content"] {
  return [{ type: "text", text: JSON.stringify(data) }];
}

export async function run(fn: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    return { content: text(await fn()) };
  } catch (err) {
    if (err instanceof ToolError) {
      return { isError: true, content: text({ code: err.code, say: err.say, ...err.details }) };
    }
    console.error("Tool failed", err);
    if (err instanceof SalesforceError && (err.retryable || err.status >= 500)) {
      return {
        isError: true,
        content: text({ code: "SALESFORCE_UNAVAILABLE", say: "I can't reach the booking system right now. Please try again in a moment." }),
      };
    }
    return {
      isError: true,
      content: text({ code: "INTERNAL_ERROR", say: "Sorry, something went wrong on my side. Please try again." }),
    };
  }
}