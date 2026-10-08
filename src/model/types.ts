import type { Kind, Mode, World } from './content.js';

export type Loc = number | 'tray';

/** A feeling jar or a sediment stack (k = 'sediment', s = ages of each item). */
export interface Jar {
  k: Kind;
  p: boolean;
  a: number;
  u: number;
  s?: number[];
}

export interface Dish {
  r: string;
  /** Tick (actual) at which the dish becomes ready. */
  rt: number;
  ok: boolean;
  /** Heat-age: ticks since ready, doubled after predawn. */
  h: number;
  pur: number;
  /** Experiment: true if the combination fails (no dish at the end). */
  fail?: boolean;
  exp?: boolean;
}

export interface Guest {
  id: number;
  w: World;
  sp: string | null;
  pal: Partial<Record<Kind, number>>;
  ord: string;
  pat: number;
  pat0: number;
  arr: number;
  out: boolean;
  st: string | null;
  fr: number;
  dw: number;
  /** Pre-rolled order draw. */
  u: number;
}

export type Seat = Guest | 'dirty' | null;

export interface ScheduleEntry {
  slot: string;
  t: number;
  w: World;
  sp: string | null;
  u: number;
  wind: boolean;
  w0: World | null;
  done: boolean;
}

export interface NightStats {
  arrived: number;
  served: number;
  satisfied: number;
  sated: number;
  unhappy: number;
  overdrawn: number;
  turnedAway: number;
  sparks: number;
  stories: number;
  halves: number;
  sediment: number;
  heatLost: number;
  lastServeTick: number;
  pureDishes: number;
  overflowBurned: number;
}

export interface Hint {
  type: 'serve' | 'recipe' | 'risk' | 'listen' | 'wait' | 'none';
  burner?: number;
  seat?: number;
  recipe?: string;
  kind?: Kind;
}

export interface NightState {
  n: number;
  tick: number;
  shift: number;
  len: number;
  fired: string[];
  sched: ScheduleEntry[];
  heat: number;
  angerBurned: boolean;
  hints: number;
  winds: number;
  forestBonus: number;
  cooked: boolean;
  mirrorTick: number;
  /** 0 = not tonight / not yet, 1 = present, 2 = left. */
  nameless: number;
  namelessArr: number;
  stats: NightStats;
  log: [number, string][];
  lastHint: Hint | null;
  pureServed: number;
  doorFail: boolean;
  living: boolean;
  cuckooUsed: boolean;
  memorialFail: boolean;
}

export type VowStatus = 'announced' | 'offered' | 'active' | 'declined' | 'success' | 'failed' | 'repeat' | 'lost';
export interface VowState {
  s: VowStatus;
  rep: number;
  from: number;
  to: number;
}

export interface DawnReport {
  night: number;
  stats: NightStats;
  thread: boolean;
  guardian: boolean;
  transforms: { cell: Loc; from: Kind; to: Kind }[];
}

export interface TarotReveal {
  card: 'guest' | 'wind' | 'whisper';
  guests?: { w: World; sp: string | null; ord: string }[];
  wind?: World | null;
  hint?: string | null;
}

export interface Flags {
  arc: boolean;
  guardian: boolean;
  pieServed: boolean;
  kupaReward: boolean;
  kupaHeat: number;
  mirrorTraded: boolean;
  namelessSeen: boolean;
}

export interface GameState {
  v: 1;
  seed: string;
  mode: Mode;
  night: number;
  phase: 'night' | 'day' | 'ended';
  ending: string | null;
  sparks: number;
  keys: number;
  threads: number;
  stories: number;
  halves: number;
  gold: number;
  water: number;
  mut: number;
  cols: number;
  seatsN: number;
  burnersN: number;
  up: string[];
  silence: number;
  shelf: (Jar | null)[];
  tray: Jar | null;
  seats: Seat[];
  door: Guest | null;
  burners: (Dish | null)[];
  known: string[];
  book: string[];
  tried: string[];
  col: Record<string, number>;
  doors: World[];
  line: World | null;
  tarot: TarotReveal | null;
  hist: World[][];
  vows: Record<string, VowState>;
  offers: string[];
  scenes: string[];
  flags: Flags;
  pairs: Record<string, number>;
  uid: number;
  gid: number;
  undo: { shelf: (Jar | null)[]; tray: Jar | null }[];
  tremorPairs: [number, number][] | null;
  nt: NightState;
  report: DawnReport | null;
  nightStart: GameState | null;
  preFinale: GameState | null;
}

export type Target = number | 'nameless' | 'kupa';

export type Action =
  | { t: 'move'; from: Loc; to: Loc }
  | { t: 'undo' }
  | { t: 'listen'; seat: number; kind: Kind; warm: boolean; cell?: number }
  | { t: 'listenBottom'; seat: number; cell?: number }
  | { t: 'cook'; recipe: string; burner?: number; water?: boolean; cells?: number[] }
  | { t: 'experiment'; cells: number[]; burner?: number }
  | { t: 'serve'; burner: number; to: Target }
  | { t: 'clean'; seat: number }
  | { t: 'kupa' }
  | { t: 'condense'; cells: number[] }
  | { t: 'burn'; from: Loc | 'silence' }
  | { t: 'discardDish'; burner: number }
  | { t: 'refuse'; seat: number | 'door' }
  | { t: 'wait' }
  | { t: 'endNight' }
  | { t: 'windClock' }
  | { t: 'cuckoo' }
  | { t: 'vow'; id: string; accept: boolean }
  | { t: 'buy'; item: string; pay?: 'sparks' | 'stories' }
  | { t: 'mirrorTrade' }
  | { t: 'buyMurky' }
  | { t: 'tram'; line: World | null }
  | { t: 'tarot'; card: 'guest' | 'wind' | 'whisper' }
  | { t: 'tremorPairs'; pairs: [number, number][] }
  | { t: 'nextNight' }
  | { t: 'windFinal' }
  | { t: 'restartNight' }
  | { t: 'restorePreFinale' }
  | { t: 'ackScene' };

export type ActionType = Action['t'];

export interface ModelOptions {
  /** Keep night-start / pre-finale copies inside the state (off for fast simulations). */
  checkpoints: boolean;
  /** Keep the per-night action log (DIAG-01). */
  log: boolean;
}

export type Resolution = { ok: true; cost: number } | { ok: false; code: string };
