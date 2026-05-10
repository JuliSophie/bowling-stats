export type DetectedScore = {
  player_name: string;
  total_score: number;
  frames: Array<number | Record<string, number | string>>;
};

export type UploadResult = {
  filename: string;
  raw_text: string;
  detected_scores: DetectedScore[];
  warnings: string[];
};

export type GameDraft = {
  played_at: string;
  location: string;
  mode: string;
  user_id?: string;
  scores: DetectedScore[];
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
