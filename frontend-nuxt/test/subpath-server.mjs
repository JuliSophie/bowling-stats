import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../.output/public/", import.meta.url));
const prefix = "/pilot/";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname); }
  catch { response.writeHead(400).end("Invalid URL"); return; }
  if (!pathname.startsWith(prefix)) {
    response.writeHead(404).end("Outside pilot mount");
    return;
  }
  let file = resolve(root, pathname.slice(prefix.length) || "index.html");
  const pathFromRoot = relative(root, file);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    let body;
    try { body = await readFile(file); }
    catch (error) {
      if (!["ENOENT", "EISDIR"].includes(error.code)) throw error;
      if (extname(file)) { response.writeHead(404).end("Missing asset"); return; }
      file = resolve(root, "index.html");
      body = await readFile(file);
    }
    response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    response.end(body);
  } catch (error) {
    console.error("Pilot static server:", error);
    response.writeHead(500).end("Static server error");
  }
}).listen(4318, "127.0.0.1");
