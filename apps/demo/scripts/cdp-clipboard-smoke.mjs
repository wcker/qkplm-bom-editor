import assert from 'node:assert/strict';

const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222';
const pageUrl = process.env.DEMO_URL ?? 'http://127.0.0.1:4173/';
const targetsResponse = await fetch(endpoint + '/json/list');
assert.equal(targetsResponse.ok, true, 'CDP target discovery failed.');
const targets = await targetsResponse.json();
const target = targets.find((candidate) => candidate.url === pageUrl);
assert.notEqual(target, undefined, 'Demo page is not open in the CDP browser.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let sequence = 0;
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id === undefined) return;
  const request = pending.get(message.id);
  if (request === undefined) return;
  pending.delete(message.id);
  if (message.error !== undefined) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Browser.grantPermissions', {
  origin: pageUrl,
  permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
});
await send('Page.reload', { ignoreCache: true });
await waitFor("document.querySelector('#session-status')?.textContent.includes('就绪') === true", 20_000);
await evaluate(() => {
  const grid = document.querySelector('[role=treegrid]');
  window.__bomClipboardProbe = [];
  for (const type of ['copy', 'paste']) {
    grid.addEventListener(type, (event) => {
      window.__bomClipboardProbe.push({
        type,
        trusted: event.isTrusted,
        prevented: event.defaultPrevented,
        types: [...(event.clipboardData?.types ?? [])],
      });
    });
  }
});

const point = await evaluate(() => {
  const rect = document.querySelector('[role=treegrid]').getBoundingClientRect();
  return { x: rect.left + 458, y: rect.top + 50 };
});
await click(point);
const focusAfterClick = await evaluate(() => ({
  activeTag: document.activeElement?.tagName,
  activeRole: document.activeElement?.getAttribute('role'),
  gridIsActive: document.activeElement === document.querySelector('[role=treegrid]'),
}));
await shortcut('c');
await delay(150);
const copiedText = await evaluate(() => navigator.clipboard.readText());
const revisionBeforePaste = await evaluate(() =>
  document.querySelector('#revision-value')?.getAttribute('title'),
);
await key('ArrowDown', 'ArrowDown', 40);
await shortcut('v');
await waitFor(
  "document.querySelector('#revision-value')?.getAttribute('title') !== " +
    JSON.stringify(revisionBeforePaste),
  2_000,
);
const revisionAfterPaste = await evaluate(() =>
  document.querySelector('#revision-value')?.getAttribute('title'),
);
const probe = await evaluate(() => window.__bomClipboardProbe);
socket.close();

process.stdout.write(JSON.stringify({
  copiedText, focusAfterClick, revisionBeforePaste, revisionAfterPaste, probe,
}, null, 2) + '\n');
assert.match(copiedText, /\S/u, 'Clipboard text is empty after Ctrl/Cmd+C.');
assert.deepEqual(probe.map((entry) => entry.type), ['copy', 'paste']);
assert.equal(probe[0].trusted, true);
assert.equal(probe[0].prevented, true);
assert.ok(probe[0].types.includes('text/plain'));
assert.equal(probe[1].trusted, true);
assert.equal(probe[1].prevented, true);
assert.notEqual(revisionAfterPaste, revisionBeforePaste);

function send(method, params = {}) {
  sequence += 1;
  const id = sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expressionOrFunction) {
  const expression = typeof expressionOrFunction === 'function'
    ? '(' + expressionOrFunction.toString() + ')()'
    : expressionOrFunction;
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await delay(50);
  }
  throw new Error('Timed out waiting for: ' + expression);
}

async function click(point) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1,
  });
}

async function shortcut(character) {
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: character, code: 'Key' + character.toUpperCase(),
    windowsVirtualKeyCode: character.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: character.toUpperCase().charCodeAt(0), modifiers: 2,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: character, code: 'Key' + character.toUpperCase(),
    windowsVirtualKeyCode: character.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: character.toUpperCase().charCodeAt(0), modifiers: 2,
  });
}

async function key(keyValue, code, keyCode) {
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: keyValue, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: keyValue, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
