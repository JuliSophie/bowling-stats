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
  );
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