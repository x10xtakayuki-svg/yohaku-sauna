import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Only these public assets can be served; configuration and source stay private.
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const files = new Map();
for (const [pathname, [name, type]] of routes) {
  files.set(pathname, { type, body: await readFile(new URL(`./public/${name}`, import.meta.url)) });
}
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
const server = createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); res.end(); return; }
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'ok'); return;
  }
  const file = files.get(path);
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {
    'Content-Type': file.type,
    'Content-Length': file.body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : file.body);
});
server.listen(port, '0.0.0.0', () => console.log(`YOHAKU listening on ${server.address().port}`));
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
