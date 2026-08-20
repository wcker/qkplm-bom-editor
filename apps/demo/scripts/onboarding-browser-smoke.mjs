import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const pageUrl = process.env.DEMO_URL ?? 'http://127.0.0.1:4173/examples.html';
const executablePath = await resolveChromeExecutable();
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 980 },
  deviceScaleFactor: 1,
});
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-example-target="frameworks"]');
  await page.locator('[data-example-target="frameworks"]').click();
  await page.waitForSelector('[data-example-editor-host="frameworks"] [role="treegrid"]');

  for (const adapter of ['native', 'react', 'vue', 'umd']) {
    await runAdapter(adapter);
  }

  await page.locator('[data-tab-target="frameworks-overview"]').click();
  await page.waitForSelector('[data-example-editor-host="frameworks"] [role="treegrid"]');
  const mounted = await page.evaluate(() => {
    const host = document.querySelector('[data-example-editor-host="frameworks"]');
    const treegrid = host?.querySelector('[role="treegrid"]');
    const canvas = host?.querySelector('canvas');
    return {
      canvasVisible: canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0,
      treegridVisible: treegrid instanceof HTMLElement && treegrid.getBoundingClientRect().height > 0,
    };
  });

  assert.equal(mounted.canvasVisible, true, 'The public onboarding canvas did not mount.');
  assert.equal(mounted.treegridVisible, true, 'The public onboarding treegrid did not mount.');
  assert.deepEqual(pageErrors, [], 'The onboarding page reported browser errors.');
  process.stdout.write(JSON.stringify({
    pageUrl,
    executablePath,
    adapters: ['native', 'react', 'vue', 'umd'],
    mounted,
  }, null, 2) + '\n');
} finally {
  await browser.close();
}

async function runAdapter(adapter) {
  await page.evaluate((kind) => {
    const input = document.querySelector('[data-example-input="frameworks"]');
    const runButton = document.querySelector(
      '[data-example-view="frameworks"] [data-run-example="frameworks"]',
    );
    if (!(input instanceof HTMLTextAreaElement) || !(runButton instanceof HTMLButtonElement)) {
      throw new Error('BOM_ONBOARDING_CONTROLS_UNAVAILABLE');
    }
    input.value = JSON.stringify({
      adapter: kind,
      instanceId: `onboarding-${kind}`,
      recoveryRevision: '2',
      lifecycle: { unmountRemount: true, destroyRecreate: true },
    }, null, 2);
    runButton.click();
  }, adapter);

  await page.waitForFunction((kind) => {
    const output = document.querySelector('[data-example-output="frameworks"]')?.textContent ?? '';
    return output.includes(`"adapter": "${kind}"`) &&
      output.includes('publicSdkLifecycle') &&
      output.includes('"active": true');
  }, adapter, { timeout: 15_000 });
}

async function resolveChromeExecutable() {
  const candidates = [
    process.env.BOM_EDITOR_CHROME_EXECUTABLE,
    process.env.CHROME_PATH,
    process.platform === 'win32'
      ? join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
    process.platform === 'win32'
      ? join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : null,
    process.platform === 'linux' ? '/usr/bin/google-chrome' : null,
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known Chrome location.
    }
  }
  assert.fail('Chrome was not found. Set BOM_EDITOR_CHROME_EXECUTABLE to the current machine executable.');
}
