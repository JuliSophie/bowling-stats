export type TrashTalkTone = 'playful' | 'dry' | 'savage' | 'coach' | 'absurd';

export type TrashTalkLanguage = 'de';

export type TrashTalkScope =
  | 'score'
  | 'loss-score'
  | 'player-score'
  | 'player-loss-score'
  | 'open-frame'
  | 'rate'
  | 'day-score'
  | 'day-loss-score'
  | 'profile-stat'
  | 'day-stat'
  | 'game-report'
  | 'live-event';

export type TrashTalkContext = {
  scope: TrashTalkScope;
  playerName?: string;
  score?: number;
  average?: number;
  deltaToAverage?: number;
  won?: boolean;
  lost?: boolean;
  rank?: number;
  playerCount?: number;
  margin?: number;
  openFrames?: number;
  openFrameRate?: number;
  cleanFrameRate?: number;
  strikes?: number;
  spares?: number;
  rate?: number;
  rateKind?: 'strikeFollow' | 'comeback' | 'win';
  statKind?: 'medianConsistency' | 'finish' | 'fatigue' | 'strikeCount' | 'spareCount' | 'firstThrow' | 'streak';
  value?: number;
  secondaryValue?: number;
  reportKind?: 'excitement' | 'comeback' | 'bigLead' | 'closestMoment' | 'lateDrama' | 'decidingFrame';
  tensionIndex?: number;
  winnerName?: string;
  leaderName?: string;
  frame?: number;
  previousScore?: number;
  trend?: 'recovery' | 'fatigue' | 'hot_streak' | 'cold_streak' | 'stable';
  seedKey?: string;
};

export type TrashTalkConditions = {
  requiresAverage?: boolean;
  minScore?: number;
  maxScore?: number;
  minAverage?: number;
  maxAverage?: number;
  minDeltaToAverage?: number;
  maxDeltaToAverage?: number;
  minOpenFrameRate?: number;
  maxOpenFrameRate?: number;
  minRate?: number;
  maxRate?: number;
  minValue?: number;
  maxValue?: number;
  minSecondaryValue?: number;
  maxSecondaryValue?: number;
  minMargin?: number;
  maxMargin?: number;
  minFrame?: number;
  maxFrame?: number;
  minTensionIndex?: number;
  maxTensionIndex?: number;
  won?: boolean;
  lost?: boolean;
};

export type TrashTalkMessage = {
  id: string;
  scenario: string;
  language: TrashTalkLanguage;
  tone: TrashTalkTone;
  intensity: 1 | 2 | 3 | 4 | 5;
  mode: 'template';
  template: string;
  conditions?: TrashTalkConditions;
  tags?: string[];
  weight?: number;
  cooldownGroup?: string;
};

export type TrashTalkFragmentSet = {
  id: string;
  scenario: string;
  language: TrashTalkLanguage;
  tone: TrashTalkTone;
  intensity: 1 | 2 | 3 | 4 | 5;
  openers: string[];
  cores: string[];
  suffixes: string[];
  conditions?: TrashTalkConditions;
  weight?: number;
  cooldownGroup?: string;
};

export type TrashTalkSelectOptions = {
  language?: TrashTalkLanguage;
  maxIntensity?: 1 | 2 | 3 | 4 | 5;
  tone?: TrashTalkTone | TrashTalkTone[];
  seed?: string;
  preferFragments?: boolean;
};
