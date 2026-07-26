import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4321);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    let file = path.resolve(OUT, `.${pathname}`);
    if (!file.startsWith(OUT)) throw new Error('Invalid path');
    try {
      const stat = await fs.stat(file);
      if (stat.isDirectory()) file = path.join(file, 'index.html');
    } catch {
      if (!path.extname(file)) file = path.join(file, 'index.html');
    }
    const data = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    response.end(data);
  } catch {
    try {
      const notFound = await fs.readFile(path.join(OUT, '404.html'));
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(notFound);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Preview server: http://127.0.0.1:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
