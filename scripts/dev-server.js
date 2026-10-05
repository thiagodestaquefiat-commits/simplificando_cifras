const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const host = "0.0.0.0";
const port = 4173;
const apiOrigin = new URL(process.env.ROUDY_API_ORIGIN || "https://simplificandocifras-production.up.railway.app");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(projectRoot, relativePath);
  const relativeToRoot = path.relative(projectRoot, filePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;
  return filePath;
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);
  if (requestUrl.pathname.startsWith("/api/")) {
    const proxy = https.request({
      protocol: apiOrigin.protocol,
      hostname: apiOrigin.hostname,
      port: apiOrigin.port || 443,
      method: request.method,
      path: requestUrl.pathname + requestUrl.search,
      headers: { Accept: request.headers.accept || "application/json", "User-Agent": "ROUDY-Local-Preview" }
    }, upstream => {
      response.writeHead(upstream.statusCode || 502, {
        "Content-Type": upstream.headers["content-type"] || "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      upstream.pipe(response);
    });
    proxy.on("error", () => response.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ erro: { codigo: "backend_indisponivel", mensagem: "A busca do YouTube está temporariamente indisponível." } })));
    request.pipe(proxy);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  const filePath = resolveRequestPath(request.url);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Simplificando Cifras disponível em http://${host}:${port}/`);
});
