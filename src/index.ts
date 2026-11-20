import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./mcp.js";

if (existsSync(".env")) process.loadEnvFile();

const app = express();
app.use(express.json({ limit: "100kb" }));
const port = Number(process.env.PORT ?? 8080);

app.get("/", (_req, res) => {
  res.json({ service: "clinic-booking-mcp", status: "ok", phase: 3 });
});

app.get("/health", (_req, res) => {
  res.send("ok");
});

app.post("/mcp", async (req: Request, res: Response) => {
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