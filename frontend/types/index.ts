export type ManualCorner = {
  x: number;
  y: number;
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
  edge_debug_image_data_url?: string | null;
  warnings: string[];
};
