import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicPackages = Object.freeze([
  {
    name: '@qkplm/bom-editor',
    directory: 'packages/core',
    maxGzipBytes: 30 * 1024,
    required: ['dist/index.js', 'dist/index.d.ts'],
  },
  {
    name: '@qkplm/bom-editor-react',
    directory: 'packages/react',
    maxGzipBytes: 30 * 1024,
    required: ['dist/index.js', 'dist/index.d.ts'],
  },
  {
    name: '@qkplm/bom-editor-vue',
    directory: 'packages/vue',
    maxGzipBytes: 30 * 1024,
    required: ['dist/index.js', 'dist/index.d.ts'],
  },
  {
    name: '@qkplm/bom-editor-umd',
    directory: 'packages/umd',
    maxGzipBytes: 300 * 1024,
    required: [
      'dist/index.js',
      'dist/index.d.ts',
      'dist/bom-editor.umd.js',
      'dist/bom-editor.umd.min.js',
      'dist/integrity.json',
    ],
  },
]);
const failures = [];
const releaseManifestPath = parseReleaseManifestPath();
const temporaryRoot = mkdtempSync(join(tmpdir(), 'qkplm-bom-editor-release-'));

try {
  verifyWorkspaceMetadata();
  verifyBuildArtifacts();
  const tarballs = createAndInspectTarballs();
  await smokeInstall(tarballs);
  writeReleaseManifest(tarballs);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`ERROR: ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Release verification passed for ${publicPackages.length} public packages.`);
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}

function verifyWorkspaceMetadata() {
  const workspace = readJson(resolve(workspaceRoot, 'package.json'));
  if (workspace.private !== true) failures.push('Workspace root must remain private.');
  if (workspace.license !== 'Apache-2.0') failures.push('Workspace license must be Apache-2.0.');
  if (workspace.engines?.node !== '>=22.0.0') failures.push('Workspace Node engine must be >=22.0.0.');

  const allowed = new Set(publicPackages.map((entry) => entry.name));
  for (const directory of readdirSync(resolve(workspaceRoot, 'packages'), { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const manifestPath = resolve(workspaceRoot, 'packages', directory.name, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    if (!allowed.has(manifest.name) && manifest.private !== true) {
      failures.push(`${manifest.name} must be private because it is not a public allowlist package.`);
    }
  }

  const versions = new Set();
  for (const entry of publicPackages) {
    const manifest = readJson(resolve(workspaceRoot, entry.directory, 'package.json'));
    versions.add(manifest.version);
    if (manifest.name !== entry.name) failures.push(`${entry.directory} has the wrong public package name.`);
    if (manifest.private === true) failures.push(`${entry.name} must not be private.`);
    if (manifest.license !== 'Apache-2.0') failures.push(`${entry.name} must declare Apache-2.0.`);
    if (manifest.author !== 'QKPLM') failures.push(`${entry.name} must declare QKPLM as author.`);
    if (manifest.engines?.node !== '>=22') failures.push(`${entry.name} must require Node >=22.`);
    if (manifest.publishConfig?.access !== 'public' ||
      manifest.publishConfig?.registry !== 'https://registry.npmjs.org') {
      failures.push(`${entry.name} must publish publicly to npmjs.`);
    }
    for (const field of ['repository', 'homepage', 'bugs', 'keywords']) {
      if (manifest[field] === undefined) failures.push(`${entry.name} is missing ${field}.`);
    }
    if (hasInternalDependency(manifest)) {
      failures.push(`${entry.name} declares an internal @bom-editor runtime dependency.`);
    }
  }
  if (versions.size !== 1) failures.push('All four public packages must use one lockstep version.');

  const core = readJson(resolve(workspaceRoot, 'packages/core/package.json'));
  if (Object.keys(core.dependencies ?? {}).length !== 0) {
    failures.push('The public Core package must not declare runtime dependencies.');
  }
  for (const name of ['@qkplm/bom-editor-react', '@qkplm/bom-editor-vue', '@qkplm/bom-editor-umd']) {
    const packageEntry = publicPackages.find((entry) => entry.name === name);
    const manifest = readJson(resolve(workspaceRoot, packageEntry.directory, 'package.json'));
    if (manifest.dependencies?.['@qkplm/bom-editor'] !== `workspace:${core.version}`) {
      failures.push(`${name} must depend on the lockstep public Core version.`);
    }
  }
}

function verifyBuildArtifacts() {
  for (const entry of publicPackages) {
    const packageRoot = resolve(workspaceRoot, entry.directory);
    for (const relativePath of entry.required) {
      if (!existsSync(resolve(packageRoot, relativePath))) {
        failures.push(`${entry.name} is missing ${relativePath}; build before release verification.`);
      }
    }
  }
  const coreDist = resolve(workspaceRoot, 'packages/core/dist');
  if (existsSync(coreDist)) {
    for (const file of listFiles(coreDist)) {
      if (!/\.(?:js|d\.ts)$/u.test(file)) continue;
      const source = readFileSync(file, 'utf8');
      if (source.includes('@bom-editor/') || source.includes('workspace:')) {
        failures.push(`Core artifact ${display(file)} leaks an internal module reference.`);
      }
    }
  }
  const integrityPath = resolve(workspaceRoot, 'packages/umd/dist/integrity.json');
  if (existsSync(integrityPath)) {
    try {
      const integrity = readJson(integrityPath);
      const minified = readFileSync(resolve(workspaceRoot, 'packages/umd/dist/bom-editor.umd.min.js'));
      const expected = `sha384-${createHash('sha384').update(minified).digest('base64')}`;
      if (integrity['bom-editor.umd.min.js'] !== expected) {
        failures.push('UMD integrity.json does not match bom-editor.umd.min.js.');
      }
    } catch (error) {
      failures.push(`Unable to verify UMD integrity: ${messageOf(error)}.`);
    }
  }
}

function createAndInspectTarballs() {
  const tarballDirectory = resolve(temporaryRoot, 'tarballs');
  mkdirSync(tarballDirectory, { recursive: true });
  const tarballs = new Map();
  for (const entry of publicPackages) {
    const packageRoot = resolve(workspaceRoot, entry.directory);
    run('pnpm', ['--dir', packageRoot, 'pack', '--pack-destination', tarballDirectory]);
    const candidates = readdirSync(tarballDirectory)
      .filter((name) => name.endsWith('.tgz'))
      .map((name) => resolve(tarballDirectory, name))
      .filter((path) => !tarballsHasPath(tarballs, path));
    if (candidates.length !== 1) {
      failures.push(`${entry.name} did not produce exactly one tarball.`);
      continue;
    }
    const tarball = candidates[0];
    tarballs.set(entry.name, tarball);
    const size = statSync(tarball).size;
    if (size > entry.maxGzipBytes) {
      console.warn(
        `WARNING: ${entry.name} gzip tarball is ${size} bytes, above the ${entry.maxGzipBytes} byte advisory budget.`,
      );
    }
    inspectTarball(entry, tarball);
  }
  return tarballs;
}

function inspectTarball(entry, tarball) {
  let entries;
  try {
    entries = readTarEntries(tarball);
  } catch (error) {
    failures.push(`${entry.name} tarball cannot be read: ${messageOf(error)}.`);
    return;
  }
  for (const required of ['LICENSE', 'NOTICE', 'README.md', ...entry.required]) {
    if (!entries.has(`package/${required}`)) {
      failures.push(`${entry.name} tarball is missing ${required}.`);
    }
  }
  const packageJson = entries.get('package/package.json');
  if (packageJson === undefined) {
    failures.push(`${entry.name} tarball is missing package.json.`);
    return;
  }
  try {
    const manifest = JSON.parse(packageJson.toString('utf8'));
    if (manifest.name !== entry.name) failures.push(`${entry.name} tarball has a mismatched package name.`);
    if (hasInternalDependency(manifest)) {
      failures.push(`${entry.name} tarball leaks an internal @bom-editor dependency.`);
    }
    if (entry.name === '@qkplm/bom-editor' && Object.keys(manifest.dependencies ?? {}).length !== 0) {
      failures.push('Packed public Core has runtime dependencies.');
    }
  } catch (error) {
    failures.push(`${entry.name} tarball package.json is invalid: ${messageOf(error)}.`);
  }
}

async function smokeInstall(tarballs) {
  if (tarballs.size !== publicPackages.length) return;
  const smokeRoot = resolve(temporaryRoot, 'smoke-install');
  mkdirSync(smokeRoot, { recursive: true });
  writeFileSync(
    resolve(smokeRoot, 'package.json'),
    JSON.stringify({
      name: `qkplm-bom-editor-smoke-${randomUUID()}`,
      private: true,
      type: 'module',
    }),
    'utf8',
  );
  writeFileSync(
    resolve(smokeRoot, 'pnpm-workspace.yaml'),
    [
      'packages: []',
      'overrides:',
      `  '@qkplm/bom-editor': 'file:${tarballs.get('@qkplm/bom-editor')}'`,
      '',
    ].join('\n'),
    'utf8',
  );
  const packageSources = publicPackages.map((entry) => `file:${tarballs.get(entry.name)}`);
  run('pnpm', [
    '--dir', smokeRoot,
    'add',
    '--ignore-scripts',
    '--config.strict-peer-dependencies=false',
    ...packageSources,
  ]);
  if (failures.length > 0) return;
  const smokeScript = resolve(smokeRoot, 'smoke.mjs');
  writeFileSync(smokeScript, [
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    "import { resolve } from 'node:path';",
    "import vm from 'node:vm';",
    "const core = await import('@qkplm/bom-editor');",
    "const react = await import('@qkplm/bom-editor-react');",
    "const vue = await import('@qkplm/bom-editor-vue');",
    "assert.equal(typeof core.createBomEditor, 'function');",
    "assert.equal(typeof react.createBomEditorReactAdapter, 'function');",
    "assert.equal(typeof vue.createBomEditorVueAdapter, 'function');",
    "const umdPath = resolve('node_modules/@qkplm/bom-editor-umd/dist/bom-editor.umd.js');",
    "const sandbox = { console }; sandbox.globalThis = sandbox;",
    "vm.runInNewContext(readFileSync(umdPath, 'utf8'), sandbox, { timeout: 5000 });",
    "assert.equal(sandbox.QkplmBomEditor.protocol, 'bom-editor-umd/v1');",
    "assert.equal(typeof sandbox.QkplmBomEditor.createBomEditorComponent, 'function');",
  ].join('\n'), 'utf8');
  run(process.execPath, [smokeScript], smokeRoot);
}

function writeReleaseManifest(tarballs) {
  if (releaseManifestPath === undefined || tarballs.size !== publicPackages.length) return;
  const umdIntegrity = readJson(resolve(workspaceRoot, 'packages/umd/dist/integrity.json'));
  const packages = publicPackages.map((entry) => {
    const tarball = tarballs.get(entry.name);
    return {
      name: entry.name,
      version: readJson(resolve(workspaceRoot, entry.directory, 'package.json')).version,
      tarball: basename(tarball),
      sha512: createHash('sha512').update(readFileSync(tarball)).digest('hex'),
    };
  });
  writeFileSync(
    releaseManifestPath,
    `${JSON.stringify({ packages, sri: umdIntegrity }, null, 2)}\n`,
    'utf8',
  );
}

function readTarEntries(path) {
  const archive = gunzipSync(readFileSync(path));
  const entries = new Map();
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const size = Number.parseInt(readTarString(header, 124, 12).trim() || '0', 8);
    const pathName = prefix === '' ? name : `${prefix}/${name}`;
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    entries.set(pathName, archive.subarray(contentStart, contentEnd));
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function readTarString(buffer, start, length) {
  const end = buffer.subarray(start, start + length).indexOf(0);
  return buffer.subarray(start, start + (end === -1 ? length : end)).toString('utf8');
}

function hasInternalDependency(manifest) {
  return ['dependencies', 'optionalDependencies', 'peerDependencies']
    .some((section) => Object.keys(manifest[section] ?? {}).some((name) => name.startsWith('@bom-editor/')));
}

function tarballsHasPath(tarballs, candidate) {
  return [...tarballs.values()].some((path) => path === candidate);
}

function run(command, argumentsList, cwd = workspaceRoot) {
  const windowsCommand = process.platform === 'win32' && command === 'pnpm';
  const executable = windowsCommand
    ? (process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe')
    : command;
  const executableArguments = windowsCommand
    ? ['/d', '/c', ['call', command, ...argumentsList.map(quoteForCmd)].join(' ')]
    : argumentsList;
  const result = spawnSync(executable, executableArguments, {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    failures.push(`${command} ${argumentsList.join(' ')} failed: ${result.stderr || result.stdout || result.error?.message || 'unknown error'}`);
  }
}

function quoteForCmd(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@=+\\-]+$/u.test(text)
    ? text
    : `"${text.replaceAll('"', '""')}"`;
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function display(path) {
  return path.slice(workspaceRoot.length + 1).replaceAll('\\', '/');
}

function parseReleaseManifestPath() {
  if (process.argv.length === 2) return undefined;
  if (process.argv.length !== 4 || process.argv[2] !== '--release-manifest') {
    throw new Error('Usage: node scripts/release-verify.mjs [--release-manifest <path>]');
  }
  const candidate = resolve(workspaceRoot, process.argv[3]);
  if (!candidate.startsWith(`${workspaceRoot}${sep}`) && candidate !== workspaceRoot) {
    throw new Error('Release manifest output must stay inside the workspace.');
  }
  return candidate;
}
