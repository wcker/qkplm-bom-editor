export const BROWSER_TARGET_LIFECYCLE_PROTOCOL =
  'bom-f3-browser-target-lifecycle/v1';

export class BrowserTargetLostError extends Error {
  constructor(stage, lifecycle, cause = undefined) {
    super('BOM_F3_ACCEPTANCE_TARGET_LOST:' + stage, { cause });
    this.name = 'BrowserTargetLostError';
    this.code = 'BOM_F3_ACCEPTANCE_TARGET_LOST';
    this.stage = stage;
    this.lifecycle = lifecycle;
  }
}

export function createBrowserTargetLifecycleTracker({
  page,
  context,
  browser,
  now = () => Date.now(),
}) {
  if (page === null || typeof page !== 'object') {
    throw new TypeError('A page is required to track browser target lifecycle.');
  }

  const events = [];
  const disposers = [];
  let lastSuccessfulStage = null;
  let sequence = 0;

  const record = (type, details = {}) => {
    events.push(Object.freeze({
      sequence: ++sequence,
      type,
      timestampMs: now(),
      ...details,
    }));
  };

  listen(page, 'framenavigated', (frame) => {
    if (!isMainFrame(page, frame)) return;
    record('main-frame-navigation', { url: readFrameUrl(frame) });
  });
  listen(page, 'close', () => record('page-close', { url: readPageUrl(page) }));
  listen(page, 'crash', () => record('page-crash', { url: readPageUrl(page) }));
  listen(context, 'close', () => record('context-close'));
  listen(browser, 'disconnected', () => record('browser-disconnected'));

  return Object.freeze({
    assertActive(stage, cause = undefined) {
      validateStage(stage);
      if (!isTerminal(page, browser, events)) return;
      record('target-lost-observed', { stage, url: readPageUrl(page) });
      throw new BrowserTargetLostError(stage, snapshot(), cause);
    },
    markStage(stage) {
      validateStage(stage);
      this.assertActive(stage);
      lastSuccessfulStage = stage;
    },
    snapshot,
    dispose() {
      while (disposers.length > 0) {
        disposers.pop()();
      }
    },
  });

  function listen(target, event, listener) {
    if (target === null || typeof target !== 'object' ||
      typeof target.on !== 'function') {
      return;
    }
    target.on(event, listener);
    disposers.push(() => {
      if (typeof target.off === 'function') {
        target.off(event, listener);
      } else if (typeof target.removeListener === 'function') {
        target.removeListener(event, listener);
      }
    });
  }

  function snapshot() {
    return Object.freeze({
      protocol: BROWSER_TARGET_LIFECYCLE_PROTOCOL,
      lastSuccessfulStage,
      pageClosed: readPageClosed(page),
      browserConnected: readBrowserConnected(browser),
      events: Object.freeze([...events]),
    });
  }
}

function isTerminal(page, browser, events) {
  if (readPageClosed(page) || readBrowserConnected(browser) === false) {
    return true;
  }
  return events.some((event) =>
    event.type === 'page-close' ||
    event.type === 'page-crash' ||
    event.type === 'context-close' ||
    event.type === 'browser-disconnected',
  );
}

function isMainFrame(page, frame) {
  try {
    return typeof page.mainFrame !== 'function' || frame === page.mainFrame();
  } catch {
    return false;
  }
}

function readPageClosed(page) {
  try {
    return typeof page.isClosed === 'function' && page.isClosed() === true;
  } catch {
    return true;
  }
}

function readBrowserConnected(browser) {
  if (browser === null || typeof browser !== 'object' ||
    typeof browser.isConnected !== 'function') {
    return null;
  }
  try {
    return browser.isConnected() === true;
  } catch {
    return false;
  }
}

function readPageUrl(page) {
  try {
    return typeof page.url === 'function' ? page.url() : null;
  } catch {
    return null;
  }
}

function readFrameUrl(frame) {
  try {
    return frame !== null && typeof frame === 'object' &&
      typeof frame.url === 'function'
      ? frame.url()
      : null;
  } catch {
    return null;
  }
}

function validateStage(stage) {
  if (typeof stage !== 'string' || stage.length === 0) {
    throw new TypeError('A non-empty target lifecycle stage is required.');
  }
}
