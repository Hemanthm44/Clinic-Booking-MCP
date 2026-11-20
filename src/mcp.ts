import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { run } from "./result.js";
import { getClinicInfo } from "./reads.js";

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "clinic-booking-mcp", version: "0.3.0" });

  server.registerTool(
    "get_clinic_info",
    {
      title: "Get clinic info",
      description:
        "Call once at the start of every call. Returns the clinic name, opening hours, today's date and weekday in the UK, " +
        "and the doctors with their working days and upcoming leave. Use today's date from here to work out dates such as " +
        "'tomorrow' or 'next Tuesday'. Speak the summary field.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(getClinicInfo),
  );

  return server;
}