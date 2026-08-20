import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright-core';

const FIXED_DEMO_PORT = 4173;

export const CHROME_LAUNCH_ARGS = Object.freeze([
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-default-browser-check',
  '--no-first-run',
]);

export async function startDemoServer(workspaceRoot) {
  const port = FIXED_DEMO_PORT;
  const baseUrl = `http://127.0.0.1:${port}`;
  const existing = await inspectFixedDemoServer(baseUrl);
  if (existing === 'bom-demo') {
    return Object.freeze({
      baseUrl,
      output: Object.freeze(['reused existing BOM demo on port 4173']),
      async close() {
        // The runner does not own a server that was already listening.
      },
    });
  }
  if (existing === 'occupied') {
    throw new Error(
      'BOM_F3_FIXED_PORT_OCCUPIED: port 4173 is already in use by a non-BOM server',
    );
  }
  const child = spawn(
    process.execPath,
    [resolve(workspaceRoot, 'apps', 'demo', 'scripts', 'serve.mjs')],
    {
      cwd: workspaceRoot,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const output = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  let exited = false;
  let exitCode = null;
  child.once('exit', (code) => {
    exited = true;
    exitCode = code;
  });
  try {
    await waitForServer(baseUrl, () => ({ exited, exitCode, output }));
  } catch (error) {
    child.kill();
    throw error;
  }
  return Object.freeze({
    baseUrl,
    output,
    async close() {
      if (exited) return;
      child.kill();
      await Promise.race([
        new Promise((resolveExit) => child.once('exit', resolveExit)),
        delay(3_000),
      ]);
      if (!exited) {
        child.kill('SIGKILL');
        await Promise.race([
          new Promise((resolveExit) => child.once('exit', resolveExit)),
          delay(3_000),
        ]);
      }
    },
  });
}

/**
 * The benchmark is intentionally single-instance. Reusing the user's fixed
 * demo server keeps the evidence runner from opening an untracked port or a
 * second editor instance. A reachable non-demo service is a hard failure.
 */
async function inspectFixedDemoServer(baseUrl) {
  const root = await fetchFixedPort(baseUrl + '/');
  if (root === null) return null;
  const acceptance = await fetchFixedPort(baseUrl + '/acceptance.html');
  if (
    root.status === 200 &&
    acceptance?.status === 200 &&
    root.body.includes('BOM 编辑器') &&
    acceptance.body.includes('BOM Editor F3 Acceptance')
  ) {
    return 'bom-demo';
  }
  return 'occupied';
}

async function fetchFixedPort(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1_000),
    });
    return Object.freeze({
      status: response.status,
      body: await response.text(),
    });
  } catch {
    return null;
  }
}

export async function launchChrome({ chromePath, headless, viewport }) {
  const profileRoot = await mkdtemp(join(tmpdir(), 'bom-f3-chrome-profile-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profileRoot, {
      executablePath: chromePath,
      headless,
      args: [...CHROME_LAUNCH_ARGS],
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.devicePixelRatio,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      serviceWorkers: 'block',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
  } catch (error) {
    await removeOwnedProfile(profileRoot);
    throw error;
  }
  const browser = context.browser();
  if (browser === null) {
    await context.close();
    await removeOwnedProfile(profileRoot);
    throw new Error('BOM_F3_PLAYWRIGHT_BROWSER_MISSING');
  }
  const browserSession = await browser.newBrowserCDPSession();
  return Object.freeze({
    browser,
    browserSession,
    context,
    profileRoot,
    async close() {
      await browserSession.detach().catch(() => undefined);
      await context.close().catch(() => undefined);
      await removeOwnedProfile(profileRoot).catch(() => undefined);
    },
  });
}

async function waitForServer(baseUrl, state) {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const current = state();
    if (current.exited) {
      throw new Error(`Demo server exited (${current.exitCode}): ${current.output.join('').trim()}`);
    }
    try {
      const response = await fetch(baseUrl + '/');
      if (response.ok) return;
    } catch {
      // The process may still be binding its listener.
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for Demo server: ${state().output.join('').trim()}`);
}

async function removeOwnedProfile(profileRoot) {
  const expectedPrefix = join(tmpdir(), 'bom-f3-chrome-profile-');
  if (!profileRoot.startsWith(expectedPrefix)) {
    throw new Error('Refusing to remove a profile outside the owned temp prefix.');
  }
  await rm(profileRoot, { recursive: true, force: true, maxRetries: 3 });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
