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
  if (message.id === undefined) {
    return;
  }
  const request = pending.get(message.id);
  if (request === undefined) {
    return;
  }
  pending.delete(message.id);
  if (message.error !== undefined) {
    request.reject(new Error(message.error.message));
  } else {
    request.resolve(message.result);
  }
});

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.reload', { ignoreCache: true });
await delay(250);
await waitFor(
  "document.querySelector('#session-status')?.textContent.includes('就绪') === true",
  20_000,
);
await evaluate(resetInteractionSurface);
await waitFor(
  "document.querySelector('[role=treegrid]')?.scrollTop === 0",
  2_000,
);

const initial = await evaluate(inspectPage);
const interactionPoint = initial.interactionPoint;

await dispatchClick(interactionPoint, 1);
await delay(100);
const afterClick = await evaluate(inspectInteractionState);

await dispatchKey('ArrowDown', 'ArrowDown', 40);
await delay(100);
const afterArrowDown = await evaluate(inspectInteractionState);

await dispatchKey('Enter', 'Enter', 13);
const keyboardPortalOpened = await waitUntil(
  "document.querySelector('[data-bom-editor-portal]')?.hidden === false",
  2_000,
);
const afterEnter = await evaluate(inspectInteractionState);

await dispatchKey('Escape', 'Escape', 27);
const keyboardPortalClosed = await waitUntil(
  "document.querySelector('[data-bom-editor-portal]')?.hidden === true",
  2_000,
);
const afterKeyboardEscape = await evaluate(inspectInteractionState);

await dispatchDoubleClick(interactionPoint);
const pointerPortalOpened = await waitUntil(
  "document.querySelector('[data-bom-editor-portal]')?.hidden === false",
  2_000,
);
const afterDoubleClick = await evaluate(inspectInteractionState);

await dispatchKey('Escape', 'Escape', 27);
const pointerPortalClosed = await waitUntil(
  "document.querySelector('[data-bom-editor-portal]')?.hidden === true",
  2_000,
);
const afterPointerEscape = await evaluate(inspectInteractionState);

const scrollTopBeforeWheel = afterPointerEscape.scrollTop;
await send('Input.dispatchMouseEvent', {
  type: 'mouseWheel',
  x: interactionPoint.x,
  y: interactionPoint.y,
  deltaX: 0,
  deltaY: 560,
});
const wheelScrolled = await waitUntil(
  "document.querySelector('[role=treegrid]')?.scrollTop > " +
    String(scrollTopBeforeWheel),
  2_000,
);
const afterWheel = await evaluate(inspectInteractionState);

await evaluate(() => document.querySelector('#find-button')?.click());
await waitFor("document.querySelector('#find-panel')?.hidden === false", 2_000);
await evaluate(() => {
  const input = document.querySelector('#find-input');
  const mode = document.querySelector('#find-mode');
  input.value = '^MAT-';
  mode.value = 'regex';
  input.form.requestSubmit();
});
await waitFor("document.querySelector('#find-counter')?.textContent !== '0 / 0'", 5_000);
const findSmoke = await evaluate(() => ({
  panelOpen: document.querySelector('#find-panel')?.hidden === false,
  status: document.querySelector('#find-status')?.textContent,
  counter: document.querySelector('#find-counter')?.textContent,
  mode: document.querySelector('#find-mode')?.value,
  activeDescendant: document.querySelector('[role=treegrid]')?.getAttribute('aria-activedescendant'),
}));
await evaluate(() => document.querySelector('#find-next-button')?.click());
await delay(100);
const findAfterNext = await evaluate(() => ({
  counter: document.querySelector('#find-counter')?.textContent,
  activeDescendant: document.querySelector('[role=treegrid]')?.getAttribute('aria-activedescendant'),
}));
await evaluate(() => {
  const input = document.querySelector('#find-input');
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await delay(100);
const findAfterEnter = await evaluate(() => ({
  counter: document.querySelector('#find-counter')?.textContent,
  activeElement: document.activeElement?.id,
}));
await evaluate(() => document.querySelector('#find-previous-button')?.click());
await delay(50);
await evaluate(() => document.querySelector('#find-previous-button')?.click());
await delay(100);
const findAfterPrevious = await evaluate(() => ({
  counter: document.querySelector('#find-counter')?.textContent,
  activeDescendant: document.querySelector('[role=treegrid]')?.getAttribute('aria-activedescendant'),
}));
await evaluate(() => document.querySelector('#find-close-button')?.click());

await evaluate(clickScenario);
await waitFor(
  "document.querySelector('#session-status')?.textContent.includes('完成') === true",
  10_000,
);
const afterScenario = await evaluate(inspectPage);

const columnInteraction = await exerciseColumnInteractions();

await evaluate(() => document.querySelector('#freeze-end-button')?.click());
await waitFor(
  "document.querySelector('#session-status')?.textContent.includes('右侧') === true",
  2_000,
);
const frozenColumnSmoke = await evaluate(() => ({
  status: document.querySelector('#session-status')?.textContent,
  scrollWidth: document.querySelector('[role=treegrid]')?.scrollWidth,
}));

await evaluate(() => document.querySelector('#column-settings-button')?.click());
await waitFor(
  "document.querySelector('#column-settings-panel')?.hidden === false",
  2_000,
);
await evaluate(() => {
  const format = document.querySelector('#column-format-select');
  const wrap = document.querySelector('#column-wrap-checkbox');
  format.value = 'datetime';
  format.dispatchEvent(new Event('change', { bubbles: true }));
  window.__columnDateOptionsVisible = document.querySelector('#column-date-options')?.hidden === false;
  window.__columnTimeStyleVisible = document.querySelector('#column-time-style-control')?.hidden === false;
  window.__columnDateStyleDefault = document.querySelector('#column-date-style-select')?.value;
  window.__columnTimeStyleDefault = document.querySelector('#column-time-style-select')?.value;
  format.value = 'accounting';
  format.dispatchEvent(new Event('change', { bubbles: true }));
  window.__columnAccountingCurrencyVisible = document.querySelector('#column-currency-options')?.hidden === false;
  window.__columnAccountingPreview = document.querySelector('#column-format-preview')?.textContent;
  format.value = 'scientific';
  format.dispatchEvent(new Event('change', { bubbles: true }));
  window.__columnScientificCurrencyVisible = document.querySelector('#column-currency-options')?.hidden === false;
  window.__columnScientificPreview = document.querySelector('#column-format-preview')?.textContent;
  format.value = 'fraction';
  format.dispatchEvent(new Event('change', { bubbles: true }));
  window.__columnFractionOptionsVisible = document.querySelector('#column-fraction-options')?.hidden === false;
  window.__columnFractionPreview = document.querySelector('#column-format-preview')?.textContent;
  format.value = 'decimal';
  format.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#column-minimum-fraction').value = '1';
  document.querySelector('#column-maximum-fraction').value = '3';
  document.querySelector('#column-grouping-checkbox').checked = false;
  document.querySelector('#column-unit-display').value = 'hidden';
  document.querySelector('[data-column-alignment="end"]')?.click();
  wrap.checked = true;
  document.querySelector('#column-settings-apply')?.click();
});
await waitFor(
  "document.querySelector('#session-status')?.textContent.includes('列格式已应用') === true",
  2_000,
);
const columnSettingsSmoke = await evaluate(() => ({
  panelOpen: document.querySelector('#column-settings-panel')?.hidden === false,
  columnLabel: document.querySelector('#column-settings-column')?.textContent,
  format: document.querySelector('#column-format-select')?.value,
  alignment: document.querySelector('[data-column-alignment][aria-pressed="true"]')?.dataset.columnAlignment,
  wrap: document.querySelector('#column-wrap-checkbox')?.checked,
  numberOptionsVisible: document.querySelector('#column-number-options')?.hidden === false,
  minimumFractionDigits: document.querySelector('#column-minimum-fraction')?.value,
  maximumFractionDigits: document.querySelector('#column-maximum-fraction')?.value,
  grouping: document.querySelector('#column-grouping-checkbox')?.checked,
  unit: document.querySelector('#column-unit-display')?.value,
  preview: document.querySelector('#column-format-preview')?.textContent,
  previewState: document.querySelector('.column-format-preview')?.dataset.state,
  status: document.querySelector('#session-status')?.textContent,
  dateOptionsVisible: window.__columnDateOptionsVisible,
  timeStyleVisible: window.__columnTimeStyleVisible,
  dateStyleDefault: window.__columnDateStyleDefault,
  timeStyleDefault: window.__columnTimeStyleDefault,
  accountingCurrencyVisible: window.__columnAccountingCurrencyVisible,
  accountingPreview: window.__columnAccountingPreview,
  scientificCurrencyVisible: window.__columnScientificCurrencyVisible,
  scientificPreview: window.__columnScientificPreview,
  fractionOptionsVisible: window.__columnFractionOptionsVisible,
  fractionPreview: window.__columnFractionPreview,
}));
await evaluate(() => document.querySelector('#column-settings-close-button')?.click());

await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: false,
});
await delay(250);
const mobile = await evaluate(inspectPage);

// Leave the shared interactive browser in its normal desktop state so a
// smoke run never changes the page a developer is inspecting afterward.
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await delay(250);
const restoredDesktop = await evaluate(inspectPage);

const report = Object.freeze({
  pageUrl,
  initial,
  interaction: {
    afterClick,
    afterArrowDown,
    keyboardPortalOpened,
    afterEnter,
    keyboardPortalClosed,
    afterKeyboardEscape,
    pointerPortalOpened,
    afterDoubleClick,
    pointerPortalClosed,
    afterPointerEscape,
    wheelScrolled,
    afterWheel,
    findSmoke,
    findAfterNext,
    findAfterEnter,
    findAfterPrevious,
  },
  afterScenario: {
    revision: afterScenario.revision,
    sessionStatus: afterScenario.sessionStatus,
    timing: afterScenario.timing,
  },
  frozenColumnSmoke,
  columnSettingsSmoke,
  columnInteraction,
  mobile: {
    viewportWidth: mobile.viewportWidth,
    viewportHeight: mobile.viewportHeight,
    buttonsFit: mobile.buttonsFit,
    commandButtonsOverlap: mobile.commandButtonsOverlap,
    horizontalPageOverflow: mobile.horizontalPageOverflow,
    canvasCount: mobile.canvasCount,
    activeDescendantExists: mobile.activeDescendantExists,
  },
  restoredDesktop: {
    viewportWidth: restoredDesktop.viewportWidth,
    viewportHeight: restoredDesktop.viewportHeight,
    horizontalScrollbarGutter: restoredDesktop.treegrid.horizontalScrollbarGutter,
  },
});
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
socket.close();

assert.equal(initial.nodeCount, '10,000');
assert.equal(initial.visibleCount, '10,000');
assert.equal(initial.canvasCount, 3);
assert.ok(initial.canvasPixels.some((sample) => sample.nonWhite > 0));
assert.equal(initial.activeDescendantExists, true);
assert.equal(initial.portalCount, 1);
assert.equal(initial.buttonsFit, true);
assert.equal(initial.horizontalPageOverflow, false);

assert.equal(initial.treegrid.pointerEvents, 'auto');
assert.equal(initial.treegrid.zIndex, '3');
assert.equal(initial.treegrid.overflowX, 'auto');
assert.equal(initial.treegrid.overflowY, 'auto');
assert.equal(initial.spacer.pointerEvents, 'none');
assert.equal(initial.semantics.pointerEvents, 'none');
assert.equal(initial.portal.zIndex, '4');
assert.deepEqual(
  initial.canvases.map((canvas) => canvas.pointerEvents),
  ['none', 'none', 'none'],
);
assert.deepEqual(
  initial.canvases.map((canvas) => canvas.zIndex),
  ['0', '1', '2'],
);
assert.equal(initial.hitTarget.role, 'treegrid');
assert.equal(initial.hitTarget.canvasLayer, null);

assert.ok(initial.treegrid.scrollHeight > initial.treegrid.clientHeight);
assert.ok(initial.treegrid.scrollWidth > initial.treegrid.clientWidth);
assert.ok(initial.treegrid.verticalScrollbarGutter > 0);
assert.ok(initial.treegrid.horizontalScrollbarGutter > 0);
assert.equal(initial.treegrid.spacerHeight, '280036px');

assert.equal(initial.semantics.ariaColumnCount, 11);
assert.ok(initial.semantics.columnHeaderCount > 1);
assert.ok(
  initial.semantics.columnHeaderCount <=
    initial.semantics.ariaColumnCount,
);
assert.equal(
  initial.semantics.rowHeaderCount,
  initial.semantics.dataRowCount,
);
assert.ok(initial.semantics.columnHeaderCount > 0);
assert.ok(initial.semantics.rowHeaderCount > 0);

assert.notEqual(afterClick.activeDescendant, initial.activeDescendant);
assert.equal(afterClick.activeElementRole, 'treegrid');
assert.equal(afterClick.activeRowIndex, '2');
assert.equal(afterClick.activeColumnIndex, '3');

assert.notEqual(
  afterArrowDown.activeDescendant,
  afterClick.activeDescendant,
);
assert.equal(afterArrowDown.activeElementRole, 'treegrid');
assert.equal(afterArrowDown.activeRowIndex, '3');
assert.equal(afterArrowDown.activeColumnIndex, '3');

assert.equal(keyboardPortalOpened, true);
assert.equal(afterEnter.portalHidden, false);
assert.equal(afterEnter.portalDisplay, 'block');
assert.equal(afterEnter.portalDisabled, false);
assert.equal(afterEnter.portalReadOnly, false);
assert.equal(afterEnter.activeElementIsPortal, true);

assert.equal(keyboardPortalClosed, true);
assert.equal(afterKeyboardEscape.portalHidden, true);
assert.equal(afterKeyboardEscape.activeElementRole, 'treegrid');

assert.equal(pointerPortalOpened, true);
assert.equal(afterDoubleClick.portalHidden, false);
assert.equal(afterDoubleClick.activeElementIsPortal, true);
assert.equal(pointerPortalClosed, true);
assert.equal(afterPointerEscape.portalHidden, true);
assert.equal(afterPointerEscape.activeElementRole, 'treegrid');

assert.equal(wheelScrolled, true);
assert.ok(afterWheel.scrollTop > scrollTopBeforeWheel);
assert.equal(findSmoke.panelOpen, true);
assert.match(findSmoke.status, /找到/u);
assert.equal(findSmoke.mode, 'regex');
assert.match(findSmoke.counter, /^1 \/ [1-9]/u);
assert.notEqual(findAfterNext.activeDescendant, findSmoke.activeDescendant);
assert.match(findAfterNext.counter, /^2 \/ [1-9]/u);
assert.equal(findAfterEnter.counter, '3 / 10,000');
assert.equal(findAfterEnter.activeElement, 'find-input');
assert.equal(findAfterPrevious.activeDescendant, findSmoke.activeDescendant);
assert.equal(findAfterPrevious.counter, findSmoke.counter);

assert.notEqual(afterScenario.revision, initial.revision);
assert.match(afterScenario.sessionStatus, /完成/u);
assert.match(frozenColumnSmoke.status, /右侧/u);
assert.ok(frozenColumnSmoke.scrollWidth > 0);
assert.equal(columnSettingsSmoke.panelOpen, true);
assert.match(columnSettingsSmoke.columnLabel, /当前列/u);
assert.equal(columnSettingsSmoke.format, 'decimal');
assert.equal(columnSettingsSmoke.alignment, 'end');
assert.equal(columnSettingsSmoke.wrap, true);
assert.equal(columnSettingsSmoke.numberOptionsVisible, true);
assert.equal(columnSettingsSmoke.minimumFractionDigits, '1');
assert.equal(columnSettingsSmoke.maximumFractionDigits, '3');
assert.equal(columnSettingsSmoke.grouping, false);
assert.equal(columnSettingsSmoke.unit, 'hidden');
assert.equal(columnSettingsSmoke.previewState, 'ready');
assert.notEqual(columnSettingsSmoke.preview, '');
assert.notEqual(columnSettingsSmoke.preview, '--');
assert.equal(columnSettingsSmoke.dateOptionsVisible, true);
assert.equal(columnSettingsSmoke.timeStyleVisible, true);
assert.equal(columnSettingsSmoke.dateStyleDefault, 'short');
assert.equal(columnSettingsSmoke.timeStyleDefault, 'short');
assert.equal(columnSettingsSmoke.accountingCurrencyVisible, true);
assert.match(columnSettingsSmoke.accountingPreview, /[()（）]/u);
assert.equal(columnSettingsSmoke.scientificCurrencyVisible, false);
assert.match(columnSettingsSmoke.scientificPreview, /E/u);
assert.equal(columnSettingsSmoke.fractionOptionsVisible, true);
assert.match(columnSettingsSmoke.fractionPreview, /\//u);
assert.match(columnSettingsSmoke.status, /列格式已应用/u);
assert.ok(columnInteraction.horizontalScrollLeft > 0);
assert.equal(columnInteraction.resizeCursor, 'col-resize');
assert.ok(columnInteraction.resizedScrollWidth > columnInteraction.initialScrollWidth);
assert.ok(columnInteraction.dragPreview.headerOpaquePixels > 500);
assert.notDeepEqual(columnInteraction.headerOrderAfter, columnInteraction.headerOrderBefore);

assert.equal(mobile.viewportWidth, 390);
assert.equal(mobile.horizontalPageOverflow, false);
assert.equal(mobile.buttonsFit, true);
assert.equal(mobile.commandButtonsOverlap, false);
assert.equal(mobile.canvasCount, 3);
assert.equal(mobile.activeDescendantExists, true);
assert.equal(restoredDesktop.viewportWidth, 1280);
assert.equal(restoredDesktop.viewportHeight, 800);
assert.ok(restoredDesktop.treegrid.horizontalScrollbarGutter > 0);

function send(method, params = {}) {
  sequence += 1;
  const id = sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expressionOrFunction) {
  const expression =
    typeof expressionOrFunction === 'function'
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
  const matched = await waitUntil(expression, timeoutMs);
  if (!matched) {
    throw new Error('Timed out waiting for: ' + expression);
  }
}

async function waitUntil(expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(expression)) {
        return true;
      }
    } catch {
      // Reload temporarily destroys the Runtime execution context.
    }
    await delay(50);
  }
  return false;
}

async function waitForColumnOrderChange(previousOrder, timeoutMs) {
  const expected = JSON.stringify(previousOrder);
  const matched = await waitUntil(
    'JSON.stringify([...document.querySelectorAll(\'[role=columnheader]\')].map((header) => header.textContent)) !== ' +
      JSON.stringify(expected),
    timeoutMs,
  );
  if (!matched) {
    throw new Error('Timed out waiting for column order change');
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function dispatchClick(point, clickCount) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount,
  });
}

async function dispatchDoubleClick(point) {
  await dispatchClick(point, 1);
  await dispatchClick(point, 2);
}

async function exerciseColumnInteractions() {
  const geometry = await evaluate(() => {
    const grid = document.querySelector('[role=treegrid]');
    const rect = grid.getBoundingClientRect();
    const headerY = rect.top + 18;
    return {
      headerY,
      nameBoundaryX: rect.left + 48 + 300 + 220,
      quantityCenterX: rect.left + 48 + 300 + 220 + 60,
      categoryCenterX: rect.left + 48 + 300 + 220 + 120 + 60,
    };
  });
  const initial = await evaluate(() => {
    const grid = document.querySelector('[role=treegrid]');
    grid.scrollLeft = Math.min(180, Math.max(0, grid.scrollWidth - grid.clientWidth));
    grid.dispatchEvent(new Event('scroll'));
    return {
      horizontalScrollLeft: grid.scrollLeft,
      initialScrollWidth: grid.scrollWidth,
    };
  });
  await evaluate(() => {
    const grid = document.querySelector('[role=treegrid]');
    grid.scrollLeft = 0;
    grid.dispatchEvent(new Event('scroll'));
  });
  await delay(100);
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: geometry.nameBoundaryX - 1,
    y: geometry.headerY,
  });
  const resizeCursor = await evaluate(() =>
    document.querySelector('[role=treegrid]').style.cursor,
  );
  await dispatchDrag(
    { x: geometry.nameBoundaryX - 1, y: geometry.headerY },
    { x: geometry.nameBoundaryX + 79, y: geometry.headerY },
  );
  await delay(100);
  const resizedScrollWidth = await evaluate(() =>
    document.querySelector('[role=treegrid]').scrollWidth,
  );
  const headerOrderBefore = await evaluate(() =>
    [...document.querySelectorAll('[role=columnheader]')].map((header) => header.textContent),
  );
  const dragPreview = await dispatchDragWithPreview(
    { x: geometry.quantityCenterX + 80, y: geometry.headerY },
    { x: geometry.categoryCenterX + 100, y: geometry.headerY },
  );
  await waitForColumnOrderChange(headerOrderBefore, 2_000);
  const headerOrderAfter = await evaluate(() =>
    [...document.querySelectorAll('[role=columnheader]')].map((header) => header.textContent),
  );
  return {
    ...initial,
    resizeCursor,
    resizedScrollWidth,
    dragPreview,
    headerOrderBefore,
    headerOrderAfter,
  };
}

async function dispatchDrag(start, end) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: end.x, y: end.y, button: 'left', buttons: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1,
  });
}

async function dispatchDragWithPreview(start, end) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1,
  });
  try {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: end.x, y: end.y, button: 'left', buttons: 1,
    });
    await delay(100);
    return await evaluate(inspectColumnDragPreview);
  } finally {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1,
    });
  }
}

async function dispatchKey(key, code, virtualKeyCode) {
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
}

function clickScenario() {
  document.querySelector('#scenario-button').click();
}

function resetInteractionSurface() {
  const treegrid = document.querySelector('[role="treegrid"]');
  treegrid.scrollTop = 0;
  treegrid.scrollLeft = 0;
  treegrid.dispatchEvent(new Event('scroll'));
}

function inspectColumnDragPreview() {
  const grid = document.querySelector('[role="treegrid"]');
  const canvas = document.querySelector(
    'canvas[data-bom-canvas-layer="interaction"]',
  );
  if (grid === null || canvas === null) {
    return { headerOpaquePixels: 0 };
  }
  const context = canvas.getContext('2d');
  const gridRect = grid.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  if (context === null || canvasRect.width <= 0 || canvasRect.height <= 0) {
    return { headerOpaquePixels: 0 };
  }
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  const left = Math.max(0, Math.floor((gridRect.left - canvasRect.left) * scaleX));
  const top = Math.max(0, Math.floor((gridRect.top - canvasRect.top) * scaleY));
  const right = Math.min(canvas.width, Math.ceil((gridRect.right - canvasRect.left) * scaleX));
  const bottom = Math.min(canvas.height, Math.ceil((gridRect.top + 36 - canvasRect.top) * scaleY));
  if (right <= left || bottom <= top) {
    return { headerOpaquePixels: 0 };
  }
  const pixels = context.getImageData(left, top, right - left, bottom - top).data;
  let headerOpaquePixels = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 0) {
      headerOpaquePixels += 1;
    }
  }
  return { headerOpaquePixels };
}

function inspectInteractionState() {
  const treegrid = document.querySelector('[role="treegrid"]');
  const activeDescendant = treegrid?.getAttribute('aria-activedescendant');
  const activeCell =
    typeof activeDescendant === 'string'
      ? document.getElementById(activeDescendant)
      : null;
  const activeRow = activeCell?.closest('[role="row"]');
  const portal = document.querySelector('[data-bom-editor-portal]');
  return {
    activeDescendant,
    activeRowIndex: activeRow?.getAttribute('aria-rowindex'),
    activeColumnIndex: activeCell?.getAttribute('aria-colindex'),
    activeElementRole: document.activeElement?.getAttribute('role'),
    activeElementIsPortal: document.activeElement === portal,
    portalHidden: portal?.hidden,
    portalDisplay:
      portal === null ? undefined : getComputedStyle(portal).display,
    portalDisabled: portal?.disabled,
    portalReadOnly: portal?.readOnly,
    portalValue: portal?.value,
    scrollTop: treegrid?.scrollTop ?? 0,
  };
}

function inspectPage() {
  const canvases = [
    ...document.querySelectorAll('[data-bom-canvas-renderer] canvas'),
  ];
  const canvasPixels = canvases.map((canvas) => {
    const context = canvas.getContext('2d');
    if (context === null || canvas.width === 0 || canvas.height === 0) {
      return { width: canvas.width, height: canvas.height, nonWhite: 0 };
    }
    const pixels = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    ).data;
    const pixelCount = canvas.width * canvas.height;
    const stride = Math.max(1, Math.floor(pixelCount / 20_000));
    let nonWhite = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += stride) {
      const offset = pixel * 4;
      if (
        pixels[offset + 3] > 0 &&
        (pixels[offset] < 248 ||
          pixels[offset + 1] < 248 ||
          pixels[offset + 2] < 248)
      ) {
        nonWhite += 1;
      }
    }
    return {
      width: canvas.width,
      height: canvas.height,
      nonWhite,
      pointerEvents: getComputedStyle(canvas).pointerEvents,
      zIndex: getComputedStyle(canvas).zIndex,
    };
  });
  const treegrid = document.querySelector('[role="treegrid"]');
  const spacer = document.querySelector('[data-bom-scroll-spacer]');
  const semantics = document.querySelector('[data-bom-semantic-window]');
  const portal = document.querySelector('[data-bom-editor-portal]');
  const activeDescendant = treegrid?.getAttribute('aria-activedescendant');
  const treegridRect = treegrid.getBoundingClientRect();
  const rowHeaderWidth = 48;
  const materialCodeWidth = 300;
  const nameColumnMidpoint = 110;
  const columnHeaderHeight = 36;
  const rowMidpoint = 14;
  const interactionPoint = {
    x:
      treegridRect.left +
      rowHeaderWidth +
      materialCodeWidth +
      nameColumnMidpoint,
    y: treegridRect.top + columnHeaderHeight + rowMidpoint,
  };
  const hitElement = document.elementFromPoint(
    interactionPoint.x,
    interactionPoint.y,
  );
  const buttons = [
    ...document.querySelectorAll('.command-button'),
  ];
  const buttonRects = buttons.map((button) => button.getBoundingClientRect());
  let commandButtonsOverlap = false;
  for (let left = 0; left < buttonRects.length; left += 1) {
    for (let right = left + 1; right < buttonRects.length; right += 1) {
      const a = buttonRects[left];
      const b = buttonRects[right];
      if (
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top
      ) {
        commandButtonsOverlap = true;
      }
    }
  }
  const semanticRows = [
    ...semantics.querySelectorAll(':scope > [role="row"]'),
  ];
  const dataRows = semanticRows.filter(
    (row) =>
      row.querySelector('[role="gridcell"], [role="rowheader"]') !== null,
  );
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    nodeCount: document.querySelector('#node-count-value')?.textContent,
    visibleCount: document.querySelector('#visible-count-value')?.textContent,
    revision: document.querySelector('#revision-value')?.getAttribute('title'),
    timing: document.querySelector('#timing-value')?.textContent,
    sessionStatus: document.querySelector('#session-status')?.textContent,
    canvasCount: canvases.length,
    canvasPixels,
    canvases: canvases.map((canvas) => ({
      layer: canvas.getAttribute('data-bom-canvas-layer'),
      pointerEvents: getComputedStyle(canvas).pointerEvents,
      zIndex: getComputedStyle(canvas).zIndex,
    })),
    activeDescendant,
    activeDescendantExists:
      typeof activeDescendant === 'string' &&
      document.getElementById(activeDescendant) !== null,
    portalCount: document.querySelectorAll(
      '[data-bom-canvas-renderer] input',
    ).length,
    interactionPoint,
    hitTarget: {
      tagName: hitElement?.tagName,
      role: hitElement?.getAttribute('role'),
      canvasLayer: hitElement?.getAttribute('data-bom-canvas-layer'),
    },
    treegrid: {
      pointerEvents: getComputedStyle(treegrid).pointerEvents,
      zIndex: getComputedStyle(treegrid).zIndex,
      overflowX: getComputedStyle(treegrid).overflowX,
      overflowY: getComputedStyle(treegrid).overflowY,
      clientWidth: treegrid.clientWidth,
      clientHeight: treegrid.clientHeight,
      scrollWidth: treegrid.scrollWidth,
      scrollHeight: treegrid.scrollHeight,
      scrollTop: treegrid.scrollTop,
      verticalScrollbarGutter: treegrid.offsetWidth - treegrid.clientWidth,
      horizontalScrollbarGutter: treegrid.offsetHeight - treegrid.clientHeight,
      spacerHeight: spacer.style.height,
    },
    spacer: {
      pointerEvents: getComputedStyle(spacer).pointerEvents,
    },
    semantics: {
      pointerEvents: getComputedStyle(semantics).pointerEvents,
      ariaColumnCount: Number(treegrid.getAttribute('aria-colcount')),
      columnHeaderCount:
        semantics.querySelectorAll('[role="columnheader"]').length,
      rowHeaderCount:
        semantics.querySelectorAll('[role="rowheader"]').length,
      dataRowCount: dataRows.length,
    },
    portal: {
      zIndex: getComputedStyle(portal).zIndex,
    },
    buttonsFit: buttons.every(
      (button) =>
        button.scrollWidth <= button.clientWidth &&
        button.scrollHeight <= button.clientHeight,
    ),
    commandButtonsOverlap,
    horizontalPageOverflow:
      document.documentElement.scrollWidth > window.innerWidth,
  };
}
