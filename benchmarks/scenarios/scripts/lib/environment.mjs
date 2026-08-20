import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { hashFile } from './hashes.mjs';

const require = createRequire(import.meta.url);

export async function findSystemChrome(explicitPath = process.env.CHROME_PATH) {
  const candidates = [];
  if (explicitPath !== undefined && explicitPath !== '') {
    candidates.push(explicitPath);
  }
  if (process.platform === 'win32') {
    for (const root of [
      process.env['PROGRAMFILES'],
      process.env['PROGRAMFILES(X86)'],
      process.env['LOCALAPPDATA'],
    ]) {
      if (root !== undefined) {
        candidates.push(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      }
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable');
    for (const directory of (process.env.PATH ?? '').split(delimiter)) {
      if (directory !== '') candidates.push(join(directory, 'google-chrome'));
    }
  }
  const selected = candidates.map((value) => resolve(value)).find(existsSync);
  if (selected === undefined) {
    throw new Error('BOM_F3_SYSTEM_CHROME_NOT_FOUND: set CHROME_PATH.');
  }
  return selected;
}

export async function collectEnvironment({
  browserSession,
  browser,
  chromePath,
  launchArgs,
  page,
  mode,
  headless,
  cacheState,
}) {
  const [
    browserVersion,
    commandLine,
    systemInfo,
    chromeDigest,
    fontEnvironment,
    pageEnvironment,
  ] =
    await Promise.all([
      browserSession.send('Browser.getVersion'),
      browserSession.send('Browser.getBrowserCommandLine').catch(() => null),
      browserSession.send('SystemInfo.getInfo').catch(() => null),
      hashFile(chromePath),
      collectFontEnvironment(),
      page.evaluate(() => ({
        crossOriginIsolated: globalThis.crossOriginIsolated === true,
        devicePixelRatio: Number.isFinite(globalThis.devicePixelRatio) &&
          globalThis.devicePixelRatio > 0
          ? Math.round(globalThis.devicePixelRatio * 1_000_000) / 1_000_000
          : globalThis.devicePixelRatio,
        locale: navigator.language,
        userAgent: navigator.userAgent,
        viewport: {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight,
        },
        screen: {
          width: globalThis.screen.width,
          height: globalThis.screen.height,
          colorDepth: globalThis.screen.colorDepth,
          pixelDepth: globalThis.screen.pixelDepth,
        },
      })),
    ]);
  const cpuModels = [...new Set(os.cpus().map((cpu) => cpu.model.trim()))];
  const playwrightPackage = require.resolve('playwright-core/package.json');
  const playwright = JSON.parse(await readFile(playwrightPackage, 'utf8'));

  return Object.freeze({
    schemaVersion: 'bom-f3-observed-environment/v1',
    collectedAt: new Date().toISOString(),
    mode,
    headless,
    cacheState,
    operatingSystem: {
      platform: os.platform(),
      release: os.release(),
      version: os.version(),
      architecture: os.arch(),
      hostname: os.hostname(),
      powerScheme: readPowerScheme(),
    },
    cpu: {
      models: cpuModels,
      logicalCoreCount: os.cpus().length,
    },
    memory: {
      totalBytes: os.totalmem(),
      freeBytesAtCollection: os.freemem(),
    },
    node: {
      version: process.version,
      executablePath: process.execPath,
    },
    playwright: {
      name: playwright.name,
      version: playwright.version,
    },
    chrome: {
      executablePath: chromePath,
      executableBytes: chromeDigest.bytes,
      executableSha256: chromeDigest.sha256,
      product: browserVersion.product,
      revision: browserVersion.revision,
      protocolVersion: browserVersion.protocolVersion,
      jsVersion: browserVersion.jsVersion,
      reportedBrowserVersion: browser.version(),
      commandLine: commandLine?.arguments ?? null,
      requestedLaunchArgs: launchArgs,
    },
    gpu: normalizeGpu(systemInfo?.gpu),
    font: fontEnvironment,
    page: pageEnvironment,
  });
}

export async function loadEnvironmentApproval(workspaceRoot, observed) {
  const filePath = resolve(workspaceRoot, 'benchmark', 'environment.json');
  const source = await readFile(filePath, 'utf8').catch(() => null);
  if (source === null) {
    return Object.freeze({
      approved: false,
      filePath,
      reasons: Object.freeze(['benchmark/environment.json is missing']),
      expected: null,
    });
  }
  let expected;
  try {
    expected = JSON.parse(source);
  } catch {
    return Object.freeze({
      approved: false,
      filePath,
      reasons: Object.freeze(['benchmark/environment.json is not valid JSON']),
      expected: null,
    });
  }
  const explicitlyApproved =
    expected.approved === true && expected.approval?.status === 'approved';
  const expectedValues = expected.expected ?? expected.environment ?? null;
  const requiredCategories = [
    'operatingSystem',
    'cpu',
    'memory',
    'node',
    'playwright',
    'chrome',
    'gpu',
    'page',
  ];
  const mismatches = [];
  if (expected.schemaVersion !== 'bom-f3-environment-approval/v1') {
    mismatches.push('environment approval schemaVersion is unsupported');
  }
  if (expectedValues === null || typeof expectedValues !== 'object') {
    mismatches.push('environment approval has no expected/environment object');
  } else {
    for (const category of requiredCategories) {
      if (!Object.hasOwn(expectedValues, category)) {
        mismatches.push(`environment approval does not lock ${category}`);
      } else if (
        expectedValues[category] !== null &&
        typeof expectedValues[category] === 'object' &&
        Object.keys(expectedValues[category]).length === 0
      ) {
        mismatches.push(`environment approval category ${category} is empty`);
      }
    }
    mismatches.push(...comparePartial(expectedValues, observed));
  }
  if (!explicitlyApproved) {
    mismatches.unshift(
      'environment approval requires approved=true and approval.status=approved',
    );
  }
  if (
    explicitlyApproved &&
    (typeof expected.approval?.approvedBy !== 'string' ||
      expected.approval.approvedBy.trim() === '' ||
      typeof expected.approval?.approvedAt !== 'string')
  ) {
    mismatches.push('approved environment requires approvedBy and approvedAt');
  }
  return Object.freeze({
    approved: explicitlyApproved && mismatches.length === 0,
    filePath,
    reasons: Object.freeze(mismatches),
    expected,
  });
}

/**
 * Formal evidence is meaningful only when every locked environment category
 * matches. Smoke runs intentionally continue after this check so they can
 * diagnose drift without being mistaken for release evidence.
 */
export function assertFormalEnvironmentApproved(approval) {
  if (approval?.approved === true) return;
  const error = new Error('BOM_F3_FORMAL_ENVIRONMENT_NOT_APPROVED');
  error.code = 'BOM_F3_FORMAL_ENVIRONMENT_NOT_APPROVED';
  error.reasons = Object.freeze(
    Array.isArray(approval?.reasons) && approval.reasons.length > 0
      ? [...approval.reasons]
      : ['formal environment approval is unavailable'],
  );
  throw error;
}

function comparePartial(expected, actual, path = 'environment') {
  const mismatches = [];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || JSON.stringify(expected) !== JSON.stringify(actual)) {
      mismatches.push(`${path} differs`);
    }
    return mismatches;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') {
      return [`${path} is missing`];
    }
    for (const key of Object.keys(expected)) {
      mismatches.push(...comparePartial(expected[key], actual[key], `${path}.${key}`));
    }
    return mismatches;
  }
  if (!Object.is(expected, actual)) mismatches.push(`${path}: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`);
  return mismatches;
}

function normalizeGpu(gpu) {
  if (gpu === undefined || gpu === null) return null;
  return {
    devices: (gpu.devices ?? []).map((device) => ({
      vendorId: device.vendorId,
      deviceId: device.deviceId,
      vendorString: device.vendorString,
      deviceString: device.deviceString,
      driverVendor: device.driverVendor,
      driverVersion: device.driverVersion,
    })),
    auxAttributes: gpu.auxAttributes ?? null,
    featureStatus: gpu.featureStatus ?? null,
    driverBugWorkarounds: gpu.driverBugWorkarounds ?? [],
  };
}

function readPowerScheme() {
  if (process.platform !== 'win32') return null;
  try {
    return execFileSync('powercfg.exe', ['/GETACTIVESCHEME'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5_000,
    }).trim();
  } catch {
    return null;
  }
}

async function collectFontEnvironment() {
  const configured = process.env.BOM_F3_FONT_PATH;
  const fontPath = configured ?? (
    process.platform === 'win32' && process.env['WINDIR'] !== undefined
      ? join(process.env['WINDIR'], 'Fonts', 'arial.ttf')
      : null
  );
  if (fontPath === null || !existsSync(fontPath)) {
    return null;
  }
  const digest = await hashFile(fontPath);
  return {
    family: 'Arial',
    filePath: resolve(fontPath),
    bytes: digest.bytes,
    sha256: digest.sha256,
  };
}
