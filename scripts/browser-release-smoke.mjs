import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright-core';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const umdRoot = resolve(workspaceRoot, 'packages/umd/dist');
const browserEngines = Object.freeze([
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const body = responseBody(pathname);
  if (body === null) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; connect-src 'none'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'self' 'unsafe-inline'",
    'Content-Type': contentType(pathname),
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});

try {
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  for (const [name, browserType] of browserEngines) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const cspErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') cspErrors.push(message.text());
      });
      await page.goto(`${origin}/csp.html`, { waitUntil: 'load' });
      await page.waitForFunction(() => globalThis.__qkplmReleaseSmoke !== undefined);
      const state = await page.evaluate(() => globalThis.__qkplmReleaseSmoke);
      assert.equal(state.protocol, 'bom-editor-umd/v1');
      assert.equal(state.createBomEditor, 'function');
      assert.equal(state.createBomEditorComponent, 'function');
      assert.deepEqual(cspErrors, [], `${name} reported a CSP or script error`);
    } finally {
      await browser.close();
    }
  }
  console.log('Cross-browser UMD strict-CSP smoke passed.');
} finally {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
  });
}

function responseBody(pathname) {
  if (pathname === '/csp.html') {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QKPLM BOM Editor CSP smoke</title><script src="/bom-editor.umd.js" defer></script><script src="/bootstrap.js" defer></script></head><body><div id="app"></div></body></html>';
  }
  if (pathname === '/bootstrap.js') {
    return "globalThis.__qkplmReleaseSmoke = Object.freeze({ protocol: globalThis.QkplmBomEditor?.protocol, createBomEditor: typeof globalThis.QkplmBomEditor?.createBomEditor, createBomEditorComponent: typeof globalThis.QkplmBomEditor?.createBomEditorComponent });";
  }
  if (pathname.startsWith('/') && !pathname.includes('..')) {
    const relativePath = pathname.slice(1);
    const file = resolve(umdRoot, relativePath);
    if (file.startsWith(`${umdRoot}${sep}`) && extname(file) !== '') {
      try {
        return readFileSync(file);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function contentType(pathname) {
  if (pathname.endsWith('.html')) return 'text/html; charset=utf-8';
  if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (pathname.endsWith('.map')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}
