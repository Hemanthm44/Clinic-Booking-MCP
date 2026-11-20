import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 8080);

app.get("/", (_req, res) => {
  res.json({ service: "clinic-booking-mcp", status: "ok", phase: 0 });
});

app.get("/health", (_req, res) => {
  res.send("ok");
});

app.listen(port, () => {
  console.log(`clinic-booking-mcp listening on ${port}`);
});