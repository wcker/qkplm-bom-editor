import { spawnSync } from 'node:child_process';

const minimumNode = [22, 14, 0];
const minimumNpm = [11, 5, 1];
const nodeVersion = parseVersion(process.versions.node, 'Node');

if (compareVersions(nodeVersion, minimumNode) < 0) {
  throw new Error(`Node ${formatVersion(minimumNode)} or newer is required for npm Trusted Publishing.`);
}

const npmVersion = parseVersion(readNpmVersion(), 'npm');
if (compareVersions(npmVersion, minimumNpm) < 0) {
  throw new Error(`npm ${formatVersion(minimumNpm)} or newer is required for npm Trusted Publishing.`);
}

console.log(`OIDC publish tooling verified: Node ${formatVersion(nodeVersion)}, npm ${formatVersion(npmVersion)}.`);

function readNpmVersion() {
  const isWindows = process.platform === 'win32';
  const result = spawnSync(
    isWindows ? (process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe') : 'npm',
    isWindows ? ['/d', '/c', 'call npm --version'] : ['--version'],
    { encoding: 'utf8', shell: false },
  );
  if (result.status !== 0) {
    throw new Error(`Unable to determine npm version: ${result.stderr || result.stdout || result.error?.message || 'unknown error'}`);
  }
  return result.stdout.trim();
}

function parseVersion(value, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value.trim());
  if (match === null) throw new Error(`${label} did not return a semantic version: ${value}.`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function formatVersion(version) {
  return version.join('.');
}
