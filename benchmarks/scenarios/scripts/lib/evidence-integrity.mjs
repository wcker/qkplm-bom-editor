export const EVIDENCE_INTEGRITY_PROTOCOL =
  'bom-f3-evidence-integrity/v1';

export function assessEvidenceIntegrity({
  buildBefore,
  buildAfter,
  evidenceToolingBefore,
  evidenceToolingAfter,
  checkedAt = new Date().toISOString(),
} = {}) {
  const build = manifestStability(buildBefore, buildAfter);
  const evidenceTooling = manifestStability(
    evidenceToolingBefore,
    evidenceToolingAfter,
  );
  const blockers = [];
  if (build.stable === false) {
    blockers.push('BOM_F3_BUILD_MUTATED_DURING_RUN');
  } else if (build.stable === null) {
    blockers.push('BOM_F3_BUILD_INTEGRITY_UNAVAILABLE');
  }
  if (evidenceTooling.stable === false) {
    blockers.push('BOM_F3_EVIDENCE_TOOLING_MUTATED_DURING_RUN');
  } else if (evidenceTooling.stable === null) {
    blockers.push('BOM_F3_EVIDENCE_TOOLING_INTEGRITY_UNAVAILABLE');
  }
  const status = blockers.some((blocker) => blocker.endsWith('_MUTATED_DURING_RUN'))
    ? 'mutated'
    : blockers.length === 0
      ? 'verified'
      : 'unavailable';
  return Object.freeze({
    protocol: EVIDENCE_INTEGRITY_PROTOCOL,
    checkedAt,
    status,
    verified: status === 'verified',
    build,
    evidenceTooling,
    blockers: Object.freeze(blockers),
    error: null,
  });
}

export function createEvidenceIntegrityUnavailable({
  buildBefore = null,
  evidenceToolingBefore = null,
  checkedAt = new Date().toISOString(),
  code = 'BOM_F3_EVIDENCE_INTEGRITY_RECHECK_FAILED',
  error = null,
} = {}) {
  return Object.freeze({
    protocol: EVIDENCE_INTEGRITY_PROTOCOL,
    checkedAt,
    status: 'unavailable',
    verified: false,
    build: manifestStability(buildBefore, null),
    evidenceTooling: manifestStability(evidenceToolingBefore, null),
    blockers: Object.freeze([code]),
    error,
  });
}

function manifestStability(before, after) {
  const initialAggregateSha256 = aggregateSha256(before);
  const finalAggregateSha256 = aggregateSha256(after);
  return Object.freeze({
    initialAggregateSha256,
    finalAggregateSha256,
    stable:
      initialAggregateSha256 === null || finalAggregateSha256 === null
        ? null
        : initialAggregateSha256 === finalAggregateSha256,
  });
}

function aggregateSha256(manifest) {
  const value = manifest?.aggregateSha256;
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
    ? value
    : null;
}
