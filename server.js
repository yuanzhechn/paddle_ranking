import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

async function serveStatic(res, pathname) {
  const file = pathname === "/" ? "public/index.html" : `public${pathname}`;
  const safePath = path.normalize(path.join(__dirname, file));
  if (!safePath.startsWith(path.join(__dirname, "public"))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const ext = path.extname(safePath);
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
  const content = await readFile(safePath);
  res.writeHead(200, { "content-type": `${types[ext] || "text/plain"}; charset=utf-8` });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    await serveStatic(res, url.pathname);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500);
    res.end(error.code === "ENOENT" ? "Not found" : error.message);
  }
});

server.listen(PORT, () => {
  console.log(`Static dashboard: http://localhost:${PORT}`);
});
