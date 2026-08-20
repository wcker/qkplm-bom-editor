import type {
  BomDataSourceCapabilities,
  BomResult,
} from '@bom-editor/contracts';
import {
  BOM_DATASOURCE_ERROR_CODES,
  dataSourceError,
  dataSourceFailure,
  dataSourceSuccess,
} from './errors.js';
import type { BomDataSource } from './types.js';

const METHOD_BY_CAPABILITY = Object.freeze({
  streaming: 'streamDocument',
  lazyChildren: 'loadChildren',
  remoteQuery: 'query',
  writable: 'commit',
  remoteChanges: 'subscribeRemote',
  cancelPendingCommit: 'cancelCommit',
} as const);

export function validateBomDataSource(
  source: BomDataSource,
): BomResult<true> {
  try {
    if (!isRecord(source) || !isRecord(source.capabilities)) {
      return mismatch('capabilities');
    }
    const capabilities = source.capabilities;
    for (const [capability, method] of Object.entries(
      METHOD_BY_CAPABILITY,
    ) as readonly [
      keyof typeof METHOD_BY_CAPABILITY,
      (typeof METHOD_BY_CAPABILITY)[keyof typeof METHOD_BY_CAPABILITY],
    ][]) {
      if (typeof capabilities[capability] !== 'boolean') {
        return mismatch(capability);
      }
      if (
        capabilities[capability] &&
        typeof source[method] !== 'function'
      ) {
        return mismatch(capability);
      }
    }
    if (!isQueryExecution(capabilities.queryExecution)) {
      return mismatch('queryExecution');
    }
    if (typeof source.loadDocument !== 'function') {
      return mismatch('loadDocument');
    }
    return dataSourceSuccess(true);
  } catch {
    return mismatch('accessor');
  }
}

function isQueryExecution(
  value: BomDataSourceCapabilities['queryExecution'],
): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const keys = ['search', 'filter', 'sort', 'pagination'] as const;
  return keys.every((key) => {
    const location = value[key];
    return location === 'local' || location === 'remote';
  });
}

function mismatch(capability: string): BomResult<true> {
  return dataSourceFailure(
    dataSourceError(
      BOM_DATASOURCE_ERROR_CODES.capabilityMismatch,
      'CONFIG',
      { capability },
    ),
  );
}

function isRecord(value: object | undefined): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
