import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalJson(value) {
  return encodeCanonical(value, new Set());
}

export function hashCanonicalJson(value) {
  return sha256(canonicalJson(value));
}

export async function hashFile(filePath) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    digest.update(chunk);
  }
  const info = await stat(filePath);
  return Object.freeze({
    bytes: info.size,
    sha256: digest.digest('hex'),
  });
}

export async function createArtifactManifest(workspaceRoot, paths) {
  const root = resolve(workspaceRoot);
  const collectedFiles = [];
  for (const input of paths) {
    const target = resolve(root, input);
    assertInside(root, target);
    const info = await stat(target).catch(() => null);
    if (info === null) {
      continue;
    }
    if (info.isDirectory()) {
      await collectDirectory(root, target, collectedFiles);
    } else if (info.isFile()) {
      collectedFiles.push(target);
    }
  }
  const files = [...new Set(collectedFiles)];
  files.sort((left, right) => compareCodeUnits(
    normalizePath(relative(root, left)),
    normalizePath(relative(root, right)),
  ));

  const entries = [];
  for (const filePath of files) {
    const digest = await hashFile(filePath);
    entries.push(Object.freeze({
      path: normalizePath(relative(root, filePath)),
      bytes: digest.bytes,
      sha256: digest.sha256,
    }));
  }
  const frozenEntries = Object.freeze(entries);
  return Object.freeze({
    algorithm: 'sha256',
    files: frozenEntries,
    aggregateSha256: hashCanonicalJson(frozenEntries),
  });
}

async function collectDirectory(root, directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareCodeUnits(left.name, right.name));
  for (const entry of entries) {
    const target = resolve(directory, entry.name);
    assertInside(root, target);
    if (entry.isDirectory()) {
      await collectDirectory(root, target, output);
    } else if (entry.isFile()) {
      output.push(target);
    }
  }
}

function encodeCanonical(value, ancestors) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonical JSON does not support non-finite numbers.');
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`canonical JSON does not support ${typeof value}.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError('canonical JSON does not support cycles.');
  }
  ancestors.add(value);
  let encoded;
  if (Array.isArray(value)) {
    encoded = '[' + value.map((entry) => encodeCanonical(entry, ancestors)).join(',') + ']';
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('canonical JSON supports only plain objects.');
    }
    const keys = Object.keys(value).sort(compareCodeUnits);
    encoded =
      '{' +
      keys.map((key) => JSON.stringify(key) + ':' + encodeCanonical(value[key], ancestors)).join(',') +
      '}';
  }
  ancestors.delete(value);
  return encoded;
}

function assertInside(root, target) {
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(prefix)) {
    throw new RangeError(`artifact path escapes workspace: ${target}`);
  }
}

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
