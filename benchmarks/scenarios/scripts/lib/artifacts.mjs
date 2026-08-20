import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

import { createArtifactManifest, hashFile } from './hashes.mjs';

const gzipAsync = promisify(gzip);

export class EvidenceArtifacts {
  #root;

  constructor(workspaceRoot, runId) {
    if (!/^[a-zA-Z0-9._-]+$/u.test(runId)) {
      throw new RangeError('runId contains unsupported path characters.');
    }
    this.#root = resolve(workspaceRoot, 'benchmarks', 'reports', 'f3', runId);
  }

  get root() {
    return this.#root;
  }

  async initialize() {
    await mkdir(dirname(this.#root), { recursive: true });
    await mkdir(this.#root, { recursive: false });
    await Promise.all([
      mkdir(this.path('raw'), { recursive: true }),
      mkdir(this.path('screenshots'), { recursive: true }),
      mkdir(this.path('traces'), { recursive: true }),
    ]);
  }

  path(relativePath) {
    const target = resolve(this.#root, relativePath);
    const prefix = this.#root.endsWith(sep) ? this.#root : this.#root + sep;
    if (target !== this.#root && !target.startsWith(prefix)) {
      throw new RangeError('artifact path escapes the evidence directory.');
    }
    return target;
  }

  async writeJson(relativePath, value) {
    await writeFile(this.path(relativePath), JSON.stringify(value, null, 2) + '\n', 'utf8');
    return hashFile(this.path(relativePath));
  }

  async writeJsonLines(relativePath, values) {
    const body = values.map((value) => JSON.stringify(value)).join('\n') + '\n';
    await writeFile(this.path(relativePath), body, 'utf8');
    return hashFile(this.path(relativePath));
  }

  async writeCompressedTrace(relativePath, traceBytes) {
    const bytes = await gzipAsync(traceBytes, { level: 9 });
    await writeFile(this.path(relativePath), bytes);
    return hashFile(this.path(relativePath));
  }

  async finalizeManifest(extra = {}) {
    const artifactManifest = await createArtifactManifest(this.#root, ['.']);
    const manifest = Object.freeze({
      schemaVersion: 'bom-f3-artifact-manifest/v1',
      generatedAt: new Date().toISOString(),
      ...extra,
      ...artifactManifest,
    });
    await this.writeJson('manifest.json', manifest);
    return manifest;
  }
}
