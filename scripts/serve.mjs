#!/usr/bin/env node
/*
 * Serves the dashboard locally. No dependencies.
 *
 *   node scripts/serve.mjs          http://localhost:4173
 *   node scripts/serve.mjs 8080     http://localhost:8080
 *
 * Open http://localhost:4173/?data=samples to use the sample data instead of data/.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden') }
    fs.stat(file, (e, st) => {
        if (!e && st.isDirectory()) file = path.join(file, 'index.html');
        fs.readFile(file, (e2, buf) => {
            if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found') }
            res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(buf);
        });
    });
}).listen(port, () => console.log(`Dashboard at http://localhost:${port}  (sample data: http://localhost:${port}/?data=samples)`));
