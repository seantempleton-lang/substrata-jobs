// Local integration fixture, never included in the production image.
import http from "node:http";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") { res.end("ok"); return; }
  if (req.headers["x-jobs-key"] !== "local-jobs-field-key") { res.writeHead(403); res.end(); return; }
  const points = url.searchParams.get("proj_id") === "302684" ? ["WB-03"] : ["BH5049", "BH5050"];
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(points.map(POINT_ID => ({ POINT_ID, Type: "Borehole", HoleDepth: 0, Location: "Local test point" }))));
});
server.listen(18081, "0.0.0.0", () => console.log("Local Field fixture listening on 18081"));
