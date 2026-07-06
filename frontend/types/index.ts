export type ManualCorner = {
  x: number;
  y: number;
};

export type LineSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type SubCell = {
  row: number;
  col: number;
  sub_index: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CornerGuessResult = {
  filename: string;
  guessed_corners: ManualCorner[];
  captured_at?: string | null;
  warnings: string[];
};

export type FrameData = {
  throw1: string;
  throw2: string;
  throw3: string;
  cumulative: string;
  // Per-ball fallen pin numbers (1..10), index 0 = first ball. Present for live-tracked games.
  fallenPins?: number[][];
  split?: {
    isSplit: boolean;
    converted: boolean;
    standingPins: number[];
  };
};

export type PlayerData = {
  name: string;
  frames: FrameData[];
  row_crop_data_url?: string | null;
  frame_crop_data_urls?: (string | null)[];
};

export type ExtractionResult = {
  filename: string;
  players: PlayerData[];
  warnings: string[];
};

export type RecentPlayerNamesResponse = {
  names: string[];
};

export type RectifiedPreview = {
  filename: string;
  bw_image_data_url?: string | null;
  morph_horizontal_data_url?: string | null;
  morph_vertical_data_url?: string | null;
  horizontal_candidates: LineSegment[];
  vertical_candidates: LineSegment[];
  warnings: string[];
};

export type TableBuildResult = {
  rectified_bw_data_url?: string | null;
  sub_cells: SubCell[];
  warnings: string[];
};

export type ConfirmedScore = {
  player_name: string;
  total_score: number;
  frames: FrameData[];
};

export type GameCreate = {
  played_at: string;
  played_at_time?: string | null;
  location: string;
  mode?: string;
  scores: ConfirmedScore[];
};

export type PlayerRenameRequest = {
  current_name: string;
  new_name: string;
};

export type PlayerRenameResponse = {
  previous_name: string;
  player_name: string;
  merged: boolean;
};

export type StoredScore = {
  player_name: string;
  total_score: number;
  frames: FrameData[];
};

export type GameRead = {
  id: number;
  played_at: string;
  played_at_time?: string | null;
  location: string;
  mode: string;
  scores: StoredScore[];
};

export type TrendPoint = {
  played_at: string;
  total_score: number;
};

export type PlayerTrend = {
  player_name: string;
  games: TrendPoint[];
};

export type PlayerAverage = {
  player_name: string;
  average_score: number;
  games_played: number;
};

export type HighScoreEntry = {
  player_name: string;
  total_score: number;
  played_at: string;
  location: string;
};

export type StatsResponse = {
  score_trends: PlayerTrend[];
  averages: PlayerAverage[];
  hall_of_fame: HighScoreEntry[];
};

export type TrackingFrame = {
  throws: number[];
  cumulative: number | null;
  isStrike: boolean;
  isSpare: boolean;
  // Pins (1..10) that fell on each ball of this frame, in ball order.
  fallenPins?: number[][];
};

export type TrackingPlayerCard = {
  index: number;
  name: string;
  frames: TrackingFrame[];
  total: number;
  isCurrent: boolean;
};

export type TrackingLoggedThrow = {
  index: number;
  player: string;
  frame: number;
  throw: number;
  pinsKnockedDown?: number | null;
  fallenPins?: number[];
  observedFallenPins?: number[];
  alreadyDownPins?: number[];
  capturedAt?: string | null;
  manual: boolean;
  manualCorrection?: boolean;
  lowConfidence: boolean;
  ballSpeedKmh?: number | null;
};

export type TrackingScoreboard = {
  playerCount: number;
  players: TrackingPlayerCard[];
  throwCount: number;
  throws?: TrackingLoggedThrow[];
};

export type TrackingSession = {
  sessionId: string;
  pairingToken: string;
  createdAt: string;
  playerNames: string[];
  playerCount: number;
  currentPlayer?: string | null;
  currentPlayerIndex: number;
  currentFrame: number;
  currentThrow: number;
  companionConnected: boolean;
  liveClientCount: number;
  scoreboard?: TrackingScoreboard | null;
  location?: string | null;
};

export type TrajectorySample = {
  timestampMs?: number;
  timestamp_ms?: number;
  distanceM?: number;
  distance_m?: number;
  board: number;
  confidence?: number | null;
};

export type BallPathPoint = {
  distanceM: number;
  board: number;
};

export type ThrowCurve = {
  launch?: BallPathPoint | null;
  apex?: BallPathPoint | null;
  impact?: BallPathPoint | null;
};

export type ThrowAnalysis = {
  sessionId: string;
  clientEventId?: string | null;
  capturedAt: string;
  player: string;
  frame: number;
  throw: number;
  pinsKnockedDown?: number | null;
  // Pin numbers (1..10) that fell on this delivery, from the overhead display.
  fallenPins?: number[] | null;
  // Raw companion observation and same-rack pins ignored because they were already down.
  observedFallenPins?: number[] | null;
  alreadyDownPins?: number[] | null;
  ballSpeedKmh?: number | null;
  impactBoard?: number | null;
  launchBoard?: number | null;
  breakpointBoard?: number | null;
  entryAngleDeg?: number | null;
  curveBoards?: number | null;
  isCurve?: boolean;
  trackedPoints?: number | null;
  isLikelyRatShot: boolean;
  confidence?: number | null;
  lowConfidence: boolean;
  trajectory: TrajectorySample[];
  // Smoothed reconstruction for redraw: polyline + key shape points.
  path?: BallPathPoint[];
  curve?: ThrowCurve | null;
};

export type LiveEvent = {
  eventId: string;
  type: string;
  payload: {
    session?: TrackingSession;
    events?: LiveEvent[];
    liveClientCount?: number;
    sessionId?: string;
    [key: string]: unknown;
  };
  createdAt: string;
};
