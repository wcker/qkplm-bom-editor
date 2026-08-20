import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
const publicManifests = [
  'packages/core/package.json',
  'packages/react/package.json',
  'packages/vue/package.json',
  'packages/umd/package.json',
].map((path) => JSON.parse(readFileSync(resolve(workspaceRoot, path), 'utf8')));

if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(tag)) {
  throw new Error('Release tag must use v<semver>, for example v1.0.0-rc.1.');
}
const versions = new Set(publicManifests.map((manifest) => manifest.version));
if (versions.size !== 1) {
  throw new Error('All public packages must use one lockstep version before release.');
}
const version = publicManifests[0].version;
if (tag !== `v${version}`) {
  throw new Error(`Release tag ${tag} does not match public package version ${version}.`);
}
console.log(`Release tag ${tag} matches all public packages.`);
