export interface BomDprResolutionInput {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly maxDpr: number;
  readonly layerCount: number;
  readonly maxBackingStoreBytes: number;
}

export interface BomDprResolution {
  readonly effectiveDpr: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly estimatedBytes: number;
  readonly degraded: boolean;
}

const BYTES_PER_PIXEL = 4;

export function resolveEffectiveDpr(
  input: Readonly<BomDprResolutionInput>,
): Readonly<BomDprResolution> {
  const cssWidth = finiteNonNegative(input.cssWidth);
  const cssHeight = finiteNonNegative(input.cssHeight);
  const layerCount = positiveInteger(input.layerCount, 1);
  const byteBudget = positiveFinite(input.maxBackingStoreBytes, 1);
  const deviceDpr = positiveFinite(input.devicePixelRatio, 1);
  const configuredDpr = positiveFinite(input.maxDpr, 1);
  const requestedDpr = Math.min(deviceDpr, configuredDpr);
  if (byteBudget < BYTES_PER_PIXEL * layerCount) {
    throw new RangeError(
      'maxBackingStoreBytes cannot hold one pixel per Canvas layer',
    );
  }

  if (cssWidth === 0 || cssHeight === 0) {
    return Object.freeze({
      effectiveDpr: requestedDpr,
      backingWidth: 0,
      backingHeight: 0,
      estimatedBytes: 0,
      degraded: requestedDpr < deviceDpr,
    });
  }

  const bytesAtRequested = backingBytes(
    cssWidth,
    cssHeight,
    requestedDpr,
    layerCount,
  );
  if (bytesAtRequested <= byteBudget) {
    return freezeResolution(
      requestedDpr,
      cssWidth,
      cssHeight,
      layerCount,
      requestedDpr < deviceDpr,
    );
  }

  let low = 0;
  let high = requestedDpr;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const candidate = (low + high) / 2;
    if (backingBytes(cssWidth, cssHeight, candidate, layerCount) <= byteBudget) {
      low = candidate;
    } else {
      high = candidate;
    }
  }
  return freezeResolution(
    low,
    cssWidth,
    cssHeight,
    layerCount,
    true,
  );
}

export function logicalToDeviceCoordinate(
  logicalCoordinate: number,
  effectiveDpr: number,
): number {
  return logicalCoordinate * effectiveDpr;
}

export function deviceToLogicalCoordinate(
  deviceCoordinate: number,
  effectiveDpr: number,
): number {
  if (!Number.isFinite(effectiveDpr) || effectiveDpr <= 0) {
    throw new RangeError('effectiveDpr must be a finite positive number');
  }
  return deviceCoordinate / effectiveDpr;
}

function freezeResolution(
  dpr: number,
  width: number,
  height: number,
  layerCount: number,
  degraded: boolean,
): Readonly<BomDprResolution> {
  const backingWidth = Math.ceil(width * dpr);
  const backingHeight = Math.ceil(height * dpr);
  return Object.freeze({
    effectiveDpr: dpr,
    backingWidth,
    backingHeight,
    estimatedBytes:
      backingWidth * backingHeight * BYTES_PER_PIXEL * layerCount,
    degraded,
  });
}

function backingBytes(
  width: number,
  height: number,
  dpr: number,
  layerCount: number,
): number {
  return (
    Math.ceil(width * dpr) *
    Math.ceil(height * dpr) *
    BYTES_PER_PIXEL *
    layerCount
  );
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
