const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const port = 4173;
const pythonPath=path.join(projectRoot,'backend','.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const assistantProcess=spawn(fs.existsSync(pythonPath)?pythonPath:'python',['-m','voice_assistant.http_server'],{cwd:path.join(projectRoot,'backend'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
assistantProcess.stdout.on('data',chunk=>process.stdout.write(chunk));
assistantProcess.stderr.on('data',()=>{});
assistantProcess.on('error',()=>console.log('Motor Python indisponível; assistente continua com fallback local.'));
process.on('exit',()=>assistantProcess.kill());
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
  if(new URL(request.url,`http://${host}:${port}`).pathname==='/api/assistant/resolve'){
    if(request.method!=='POST')return response.writeHead(405,{Allow:'POST'}).end();
    if(request.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(request.headers.origin))return response.writeHead(403).end();
    let size=0;const chunks=[];
    request.on('data',chunk=>{size+=chunk.length;if(size<=32000)chunks.push(chunk);});
    request.on('end',()=>{
      if(size>32000)return response.writeHead(413).end();
      const body=Buffer.concat(chunks),upstream=http.request({hostname:host,port:5010,path:'/api/assistant/resolve',method:'POST',headers:{'Content-Type':'application/json','Content-Length':body.length},timeout:1800},result=>{response.writeHead(result.statusCode,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});result.pipe(response);});
      upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!response.headersSent)response.writeHead(503,{'Content-Type':'application/json'});response.end('{"error":"assistant_unavailable"}');});upstream.end(body);
    });return;
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
