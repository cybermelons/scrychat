#!/usr/bin/env node
// Serves the board at docs/progress/ so it can be opened from another machine
// on the tailnet. Binds 0.0.0.0 on purpose — the whole point is that the board
// is reachable from the phone and from ina, not only from this host.
//
// Read-only and static: it serves files under docs/progress and nothing else.
// A request path is resolved and then checked against the root, so `..` cannot
// escape the directory.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "progress");
const PORT = Number(process.env.PORT || 8130);
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json" };

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel === "/" || rel === "/progress.html") rel = "/index.html";
    const file = path.resolve(ROOT, "." + rel);
    if (!file.startsWith(path.resolve(ROOT) + path.sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(buf);
    });
  })
  .listen(PORT, "0.0.0.0", () => console.log(`board on http://0.0.0.0:${PORT}/`));
