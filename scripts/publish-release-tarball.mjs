import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [packageName, distTag, mode] = process.argv.slice(2);

if (packageName === undefined || distTag === undefined || ![4, 5].includes(process.argv.length)) {
  throw new Error('Usage: node scripts/publish-release-tarball.mjs <package-name> <next|latest> [--dry-run].');
}
if (!['next', 'latest'].includes(distTag)) throw new Error(`Unsupported npm dist-tag: ${distTag}.`);
if (mode !== undefined && mode !== '--dry-run') throw new Error(`Unsupported publish mode: ${mode}.`);

const evidence = JSON.parse(readFileSync(resolve(workspaceRoot, 'release-evidence.json'), 'utf8'));
const packageEvidence = evidence.packages?.find((entry) => entry.name === packageName);
if (packageEvidence === undefined) throw new Error(`Release evidence is missing ${packageName}.`);
if (typeof packageEvidence.tarball !== 'string' || packageEvidence.tarball !== basename(packageEvidence.tarball)) {
  throw new Error(`Release evidence has an unsafe tarball name for ${packageName}.`);
}

const tarball = resolve(workspaceRoot, 'release-tarballs', packageEvidence.tarball);
const tarballDirectory = resolve(workspaceRoot, 'release-tarballs');
if (!tarball.startsWith(`${tarballDirectory}${sep}`) || !existsSync(tarball)) {
  throw new Error(`Release tarball is unavailable for ${packageName}.`);
}
if (typeof packageEvidence.sha512 !== 'string' || !/^[a-f0-9]{128}$/iu.test(packageEvidence.sha512)) {
  throw new Error(`Release evidence has an invalid SHA-512 for ${packageName}.`);
}
const actualHash = createHash('sha512').update(readFileSync(tarball)).digest('hex');
if (actualHash !== packageEvidence.sha512.toLowerCase()) {
  throw new Error(`Release tarball hash does not match release evidence for ${packageName}.`);
}

const isWindows = process.platform === 'win32';
const npmArguments = [
  'publish',
  tarball,
  '--access',
  'public',
  '--provenance',
  '--tag',
  distTag,
  '--registry=https://registry.npmjs.org',
];
if (mode === '--dry-run') npmArguments.push('--dry-run');
const result = spawnSync(
  isWindows ? (process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe') : 'npm',
  isWindows ? ['/d', '/c', ['call', 'npm', ...npmArguments.map(quoteForCmd)].join(' ')] : npmArguments,
  { cwd: workspaceRoot, encoding: 'utf8', shell: false },
);

if (result.stdout !== '') process.stdout.write(result.stdout);
if (result.stderr !== '') process.stderr.write(result.stderr);
if (result.status !== 0) process.exitCode = result.status ?? 1;

function basename(path) {
  return path.split(/[\\/]/u).at(-1);
}

function quoteForCmd(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@=+\\-]+$/u.test(text)
    ? text
    : `"${text.replaceAll('"', '""')}"`;
}
