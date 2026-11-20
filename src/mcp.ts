import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run } from "./result.js";
import { findAvailableSlots, getClinicInfo } from "./reads.js";

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

  server.registerTool(
    "find_available_slots",
    {
      title: "Find available slots",
      description:
        "Find free 30-minute Standard appointments. Dates are UK dates as YYYY-MM-DD, worked out from get_clinic_info's today. " +
        "For a single day set only date_from. Omit doctor for any doctor. Returns up to 3 slots (limit max 5) and a speakable summary. " +
        "If the requested days have nothing free, it says why and returns the next free slots instead (alternatives: true). " +
        "Only ever offer slots this tool returned; never invent times.",
      inputSchema: {
        doctor: z.string().optional().describe("Doctor as the caller said it (e.g. 'Patel', 'Dr Wilson') or a doctor id. Omit for any doctor."),
        date_from: z.string().optional().describe("First UK date to search, YYYY-MM-DD. Defaults to today."),
        date_to: z.string().optional().describe("Last UK date to search, YYYY-MM-DD. Defaults to date_from if given, otherwise the end of the 14-day window."),
        part_of_day: z.enum(["morning", "afternoon", "any"]).optional().describe("morning = starts 9:00 to 12:30; afternoon = starts 2:00 to 4:30."),
        limit: z.number().int().min(1).max(5).optional().describe("How many slots to return. Default 3."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => findAvailableSlots(args)),
  );

  return server;
}