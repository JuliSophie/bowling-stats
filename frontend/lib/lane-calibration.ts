export const LANE_PROTOCOL_VERSION = 1 as const;
export const MAX_LANE_IMAGE_EDGE = 2048;
export const MAX_LANE_IMAGE_PIXELS = 4_000_000;

export type LanePoint = { x: number; y: number };
export type LaneCorners = {
  topLeft: LanePoint;
  topRight: LanePoint;
  bottomRight: LanePoint;
  bottomLeft: LanePoint;
};

export type LaneDebugMetadata = {
  pinDeck?: {
    mimeType: 'image/jpeg';
    width: number;
    height: number;
    jpegBase64: string;
    laneEndLine?: [number, number, number, number];
  };
  pinStatus?: {
    standing: number;
    total: number;
    down: number;
    referenceAvailable: boolean;
    pinCountingArmed: boolean;
    deckSettled: boolean;
    autoReferenceStatus: string;
    autoReferenceReady: boolean;
  };
};

type LaneEnvelope<TType extends string, TPayload> = {
  protocolVersion: typeof LANE_PROTOCOL_VERSION;
  type: TType;
  sessionId: string;
  requestId: string;
  payload: TPayload;
};

export type LaneScreenshotMessage = LaneEnvelope<
  'lane.screenshot',
  {
    screenshotId: string;
    reason: string;
    capturedAt: string;
    image: { mimeType: 'image/jpeg'; width: number; height: number; jpegBase64: string };
    corners: LaneCorners;
    debug?: LaneDebugMetadata | null;
  }
>;

export type LaneControlMessage =
  | LaneScreenshotMessage
  | LaneEnvelope<'lane.quad.applied', { screenshotId: string }>
  | LaneEnvelope<'lane.error', { message: string }>;

export type LaneBrowserMessage =
  | LaneEnvelope<'lane.screenshot.request', Record<string, never>>
  | LaneEnvelope<'lane.quad.apply', { screenshotId: string; corners: LaneCorners }>;

export function isLaneControlMessage(value: unknown): value is LaneControlMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<LaneControlMessage>;
  return (
    message.protocolVersion === LANE_PROTOCOL_VERSION &&
    typeof message.sessionId === 'string' &&
    typeof message.requestId === 'string' &&
    (message.type === 'lane.screenshot' || message.type === 'lane.quad.applied' || message.type === 'lane.error') &&
    Boolean(message.payload && typeof message.payload === 'object')
    && (message.type !== 'lane.screenshot' || isLaneScreenshotPayload(message.payload))
  );
}

function isLaneScreenshotPayload(payload: unknown): payload is LaneScreenshotMessage['payload'] {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as LaneScreenshotMessage['payload'];
  const image = candidate.image;
  if (!image || image.mimeType !== 'image/jpeg' || !isLaneImageSizeValid(image.width, image.height) || typeof image.jpegBase64 !== 'string' || image.jpegBase64.length > 2_000_000) return false;
  const debug = candidate.debug;
  if (debug == null) return true;
  const crop = debug.pinDeck;
  if (crop && (!isLaneImageSizeValid(crop.width, crop.height) || crop.width > 1024 || crop.height > 1024 || typeof crop.jpegBase64 !== 'string' || crop.jpegBase64.length > 600_000 || (crop.laneEndLine && (crop.laneEndLine.length !== 4 || crop.laneEndLine.some((value) => !Number.isFinite(value) || value < 0 || value > 1))))) return false;
  const status = debug.pinStatus;
  return !status || [status.standing, status.total, status.down].every((value) => Number.isInteger(value) && value >= 0 && value <= 10)
    && [status.referenceAvailable, status.pinCountingArmed, status.deckSettled, status.autoReferenceReady].every((value) => typeof value === 'boolean')
    && typeof status.autoReferenceStatus === 'string' && status.autoReferenceStatus.length <= 160;
}

export function laneRequest(
  sessionId: string,
  type: LaneBrowserMessage['type'],
  payload: LaneBrowserMessage['payload'],
): LaneBrowserMessage {
  return {
    protocolVersion: LANE_PROTOCOL_VERSION,
    type,
    sessionId,
    requestId: crypto.randomUUID(),
    payload,
  } as LaneBrowserMessage;
}

export function isLaneImageSizeValid(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    && width <= MAX_LANE_IMAGE_EDGE && height <= MAX_LANE_IMAGE_EDGE
    && width * height <= MAX_LANE_IMAGE_PIXELS;
}