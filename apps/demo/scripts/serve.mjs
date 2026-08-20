import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const demoRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const port = parsePort(process.env.PORT);
const host = process.env.HOST ?? '127.0.0.1';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
]);
const isolationHeaders = Object.freeze({
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const target = resolveRequest(pathname);
    if (target === null) {
      sendText(response, 404, 'Not found');
      return;
    }
    const file = await stat(target).catch(() => null);
    if (file === null || !file.isFile()) {
      sendText(response, 404, 'Not found');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': file.size,
      'Content-Type': contentTypes.get(extname(target)) ?? 'application/octet-stream',
      ...isolationHeaders,
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(target).pipe(response);
  } catch {
    sendText(response, 500, 'Internal server error');
  }
});

server.listen(port, host, () => {
  process.stdout.write(`BOM editor demo: http://${host}:${port}\n`);
});

function resolveRequest(pathname) {
  if (pathname === '/' || pathname === '/index.html') {
    return resolveInside(demoRoot, 'index.html');
  }
  if (
    pathname === '/acceptance.html' ||
    pathname === '/acceptance.js' ||
    pathname === '/acceptance.js.map' ||
    pathname === '/examples.html' ||
    pathname === '/examples.js' ||
    pathname === '/examples.js.map' ||
    pathname === '/guide.css' ||
    pathname === '/help.html' ||
    pathname === '/help.js' ||
    pathname === '/help.js.map' ||
    pathname === '/main.js' ||
    pathname === '/main.js.map' ||
    pathname === '/styles.css'
  ) {
    return resolveInside(demoRoot, pathname.slice(1));
  }
  if (pathname.startsWith('/packages/') && pathname.includes('/dist/')) {
    return resolveInside(workspaceRoot, pathname.slice(1));
  }
  if (pathname.startsWith('/benchmarks/fixtures/dist/')) {
    return resolveInside(workspaceRoot, pathname.slice(1));
  }
  return null;
}

function resolveInside(root, relativePath) {
  const target = resolve(root, relativePath);
  const prefix = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(prefix) ? target : null;
}

function parsePort(value) {
  const parsed = value === undefined ? 4173 : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new RangeError('PORT must be an integer from 1 through 65535.');
  }
  return parsed;
}

function sendText(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    ...isolationHeaders,
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}
