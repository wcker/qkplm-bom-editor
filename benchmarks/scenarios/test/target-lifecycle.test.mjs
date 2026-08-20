import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  BROWSER_TARGET_LIFECYCLE_PROTOCOL,
  BrowserTargetLostError,
  createBrowserTargetLifecycleTracker,
} from '../scripts/lib/target-lifecycle.mjs';

test('target lifecycle records main-frame navigation and terminal page loss', () => {
  const page = new FakePage();
  const context = new EventEmitter();
  const browser = new FakeBrowser();
  let timestamp = 0;
  const tracker = createBrowserTargetLifecycleTracker({
    page,
    context,
    browser,
    now: () => ++timestamp,
  });

  tracker.markStage('acceptance-ready');
  page.emit('framenavigated', page.mainFrame());
  page.crashed = true;
  page.emit('crash');

  assert.throws(
    () => tracker.assertActive('realm-memory:idle-noise-3'),
    (error) => {
      assert.ok(error instanceof BrowserTargetLostError);
      assert.equal(error.code, 'BOM_F3_ACCEPTANCE_TARGET_LOST');
      assert.equal(error.stage, 'realm-memory:idle-noise-3');
      assert.equal(
        error.lifecycle.events.some((event) => event.type === 'main-frame-navigation'),
        true,
      );
      assert.equal(
        error.lifecycle.events.some((event) => event.type === 'page-crash'),
        true,
      );
      return true;
    },
  );

  const snapshot = tracker.snapshot();
  assert.equal(snapshot.protocol, BROWSER_TARGET_LIFECYCLE_PROTOCOL);
  assert.equal(snapshot.lastSuccessfulStage, 'acceptance-ready');
  assert.equal(snapshot.pageClosed, false);
  assert.equal(snapshot.browserConnected, true);
  tracker.dispose();
});

test('target lifecycle records browser disconnects without treating child navigation as parent navigation', () => {
  const page = new FakePage();
  const browser = new FakeBrowser();
  const tracker = createBrowserTargetLifecycleTracker({ page, browser });
  const child = { url: () => 'http://127.0.0.1/child' };

  page.emit('framenavigated', child);
  browser.connected = false;
  browser.emit('disconnected');

  assert.throws(() => tracker.assertActive('screenshot'), BrowserTargetLostError);
  assert.equal(
    tracker.snapshot().events.some((event) => event.type === 'main-frame-navigation'),
    false,
  );
  assert.equal(
    tracker.snapshot().events.some((event) => event.type === 'browser-disconnected'),
    true,
  );
  tracker.dispose();
});

class FakePage extends EventEmitter {
  constructor() {
    super();
    this.closed = false;
    this.crashed = false;
    this.frame = { url: () => 'http://127.0.0.1/acceptance.html' };
  }

  isClosed() {
    return this.closed;
  }

  mainFrame() {
    return this.frame;
  }

  url() {
    return this.frame.url();
  }
}

class FakeBrowser extends EventEmitter {
  constructor() {
    super();
    this.connected = true;
  }

  isConnected() {
    return this.connected;
  }
}
