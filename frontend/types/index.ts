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
  warnings: string[];
};

export type FrameData = {
  throw1: string;
  throw2: string;
  throw3: string;
  cumulative: string;
};

export type PlayerData = {
  name: string;
  frames: FrameData[];
};

export type ExtractionResult = {
  filename: string;
  players: PlayerData[];
  warnings: string[];
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
