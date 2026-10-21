const http = require("node:http");
const server = http.createServer((req, res) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Access-Control-Allow-Origin", "*");
if (req.url === "/health") { res.writeHead(200); return res.end(JSON.stringify({ status: "ok" })); }
if (req.url === "/api/hello") { res.writeHead(200); return res.end(JSON.stringify({ message: "Hello from my Payrail test API!", service: "payrail-test-api", timestamp: new Date().toISOString() })); }
res.writeHead(404); res.end(JSON.stringify({ error: "Endpoint not found" })); });
const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => { console.log(Test API listening on port ${port}); });
