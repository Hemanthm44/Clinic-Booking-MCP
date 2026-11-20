import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./mcp.js";

if (existsSync(".env")) process.loadEnvFile();

const app = express();
app.use(express.json({ limit: "100kb" }));
const port = Number(process.env.PORT ?? 8080);

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = (process.env.MCP_API_KEY ?? "").trim();
  if (!expected) {
    res.status(503).json({ error: "Server has no MCP_API_KEY configured" });
    return;
  }
  const header = req.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.get("/", (_req, res) => {
  res.json({ service: "clinic-booking-mcp", status: "ok", phase: 6 });
});

app.get("/health", (_req, res) => {
  res.send("ok");
});

app.post("/mcp", requireApiKey, async (req: Request, res: Response) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

const methodNotAllowed = (_req: Request, res: Response) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.listen(port, () => {
  console.log(`clinic-booking-mcp listening on ${port}`);
});