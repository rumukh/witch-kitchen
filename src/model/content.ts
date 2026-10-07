// Content types, loading and cross-reference validation. All balance lives in content/*.json.

export type Kind =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'nostalgia'
  | 'loneliness'
  | 'tremor'
  | 'hope'
  | 'amber'
  | 'burning'
  | 'sediment';
export const KINDS: readonly Kind[] = [
  'joy',
  'sadness',
  'anger',
  'fear',
  'nostalgia',
  'loneliness',
  'tremor',
  'hope',
  'amber',
  'burning',
  'sediment',
];
export type World = 'forest' | 'river' | 'city' | 'memorial';
export const WORLDS: readonly World[] = ['forest', 'river', 'city', 'memorial'];
export type Mode = 'standard' | 'granny' | 'wolf';
export const MODES: readonly Mode[] = ['standard', 'granny', 'wolf'];

export interface KindDef {
  base: boolean;
  act: number;
  orderFeeling: string | null;
  agesInto?: Kind;
  agingSteps?: number;
  burnsNearStove?: boolean;
  burnHeat?: number;
  burnHeatPerNight?: number;
  drainsNeighborsAfterDawns?: number;
  alwaysMurky?: boolean;
}
export interface RecipeDef {
  chapter: string;
  ingredients: Record<string, number>;
  brew: number;
  heat: number;
  knownFrom: number;
  story?: boolean;
  unlock?: string;
}
export interface WorldDef {
  fromNight: number;
  candle: number;
  pay: 'wood' | 'water' | 'sparks' | 'story';
  tips: number;
  slice: Partial<Record<Kind, number>>;
  full: Partial<Record<Kind, number>>;
  reverseFreshness?: boolean;
}
export interface SpecialDef {
  world: World;
  order: string | null;
  candle?: number;
  candleMult: number;
}
export interface VowDef {
  n: number;
  giver: string;
  announce: number | null;
  from: number;
  to: number;
  tutorial?: boolean;
  cond: string;
  count?: number;
  maxWait?: number;
  feeling?: string;
  guest?: string;
  recipe?: string;
  serveNight?: number;
  reminder?: number;
  needsKind?: Kind;
  minQuality?: number;
  minSatisfied?: number;
  spoiler?: boolean;
}
export interface ModeDef {
  ticks: number;
  patienceMult: number;
  winding: boolean;
  guarantees: boolean;
}

export interface Content {
  feelings: {
    kinds: Record<Kind, KindDef>;
    purity: { pure: number; murky: number };
    tremorMerge: { joy: Kind; partner: Kind; maxJoyAge: number; fromNight: number; requirePure: boolean };
    ingredientAccepts: Record<string, Kind[]>;
  };
  actions: {
    listen: { ticks: number };
    listenBottom: { ticks: number };
    cook: { ticks: number };
    experiment: { ticks: number; heat: number; minJars: number; maxJars: number };
    serveFresh: { ticks: number };
    serve: { ticks: number };
    clean: { ticks: number };
    kupa: { ticks: number; heat: number };
    condense: { ticks: number; fromNight: number; costJars: number; gainSediment: number };
    burn: { ticks: number };
    discardDish: { ticks: number; gainSediment: number };
    refuse: { ticks: number };
    wait: { ticks: number };
    endNight: { ticks: number };
    windClock: { ticks: number; costKeys: number; gainTicks: number; perNight: number };
    cuckoo: { ticks: number; perNight: number; fromNight: number };
    undoDepth: number;
  };
  nights: {
    campaignNights: number;
    acts: { act: number; from: number; to: number }[];
    modes: Record<Mode, ModeDef>;
    waves: number[];
    events: { wind: number; midnight: number; predawnBeforeDawn: number };
    tutorial: { night: number; ticks: number; secondGuestTick: number; noChimes: boolean; recipes: string[] };
    patience: { quarters: number; doorMult: number; predawnMult: number; namelessMult: number };
    start: {
      heat: number;
      heatMax: number;
      threads: number;
      seats: number;
      shelfCols: number;
      burners: number;
      waterMax: number;
      shelf: { kind: Kind; pure: boolean; cell: number }[];
    };
    fullPaletteFromNight: number;
    droughtNight: number;
  };
  guests: {
    worlds: Record<World, WorldDef>;
    special: Record<string, SpecialDef>;
    doorQueue: number;
    orderRecipes: Record<string, string>;
    nameless: { nights: number[]; accepts: string; acceptsFinal: string; finalNight: number; payEmptyGold: number };
    unhappy: { sediment: number; storyHalves: number };
    overdrawn: { emptyGold: number; sediment: number };
  };
  recipes: {
    recipes: Record<string, RecipeDef>;
    freshness: {
      fromOven: number;
      hot: number;
      values: number[];
      reverse: number[];
      maxBonus: number;
      coldAtDawnAge: number;
    };
    qualityStep: number;
    qualityMin: number;
  };
  economy: {
    citySparks: Record<string, number>;
    satedPayFactor: number;
    fullStoryMinQuality: number;
    prices: Record<string, { sparks?: number; stories?: number }>;
    mirrorTrade: { stories: number; keys: number; once: boolean };
    murky: { sparks: number; night: number };
    doors: {
      storiesToOpen: number;
      forest: { heatPerClean: number; maxPerNight: number };
      river: { waterAtNightStart: number };
      city: { sparksBonusPercent: number };
      memorial: { storyPerSatisfied: number };
    };
    storiesPerWorld: number;
    fragmentsPerStory: number;
    halvesPerStory: number;
    mittensBonus: number;
    kupaReward: { night: number; recipe: string; grants: string; ifOwnedStartHeat: number };
  };
  sediment: {
    shelfLifeNights: number;
    stackMax: number;
    mutGate: number;
    mutGateFromNight: number;
    overflowBurnHeat: number;
  };
  endings: {
    priority: string[];
    finalNight: number;
    achievements: Record<string, { when: string; mutnoe?: number; world?: string; endings?: string[]; spoiler?: boolean }>;
  };
  vows: { vows: Record<string, VowDef>; keysPerSuccess: number; threadsPerFailure: number };
  schedule: {
    slots: string[];
    slotTicks: Record<string, number>;
    windSlot: string;
    lineMin: number;
    windowNights: number;
    storyGuests: { night: number; slot: string; guest: string; tick?: number; ifRepeat?: string }[];
    forcedWorlds: { night: number; world: World; count: number }[];
    guarantees: { nights: number[]; world?: World; paletteHas?: Kind }[];
  };
}

export const CONTENT_FILES = [
  'feelings',
  'actions',
  'nights',
  'guests',
  'recipes',
  'economy',
  'sediment',
  'endings',
  'vows',
  'schedule',
] as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural + cross-reference validation. Returns diagnostics with file paths. */
export function validateContentData(data: unknown): string[] {
  const errors: string[] = [];
  const need = (cond: unknown, path: string, msg: string) => {
    if (!cond) errors.push(`${path}: ${msg}`);
  };
  if (!isObj(data)) return ['$: content must be an object'];
  for (const f of CONTENT_FILES) need(isObj(data[f]), f, 'missing file section');
  if (errors.length) return errors;
  const c = data as unknown as Content;
  const num = (v: unknown, path: string, min = 0) =>
    need(typeof v === 'number' && Number.isFinite(v) && v >= min, path, `number >= ${min} expected`);
  try {
    for (const k of KINDS) need(isObj(c.feelings.kinds?.[k]), `feelings.kinds.${k}`, 'missing kind');
    for (const m of MODES) {
      const md = c.nights.modes?.[m];
      need(isObj(md), `nights.modes.${m}`, 'missing mode');
      if (md) {
        num(md.ticks, `nights.modes.${m}.ticks`, 6);
        num(md.patienceMult, `nights.modes.${m}.patienceMult`, 0.1);
      }
    }
    for (const w of WORLDS) {
      const wd = c.guests.worlds?.[w];
      need(isObj(wd), `guests.worlds.${w}`, 'missing world');
      if (!wd) continue;
      num(wd.candle, `guests.worlds.${w}.candle`, 1);
      for (const pal of ['slice', 'full'] as const)
        for (const [k, n] of Object.entries(wd[pal] ?? {})) {
          need(KINDS.includes(k as Kind), `guests.worlds.${w}.${pal}.${k}`, 'unknown kind');
          num(n, `guests.worlds.${w}.${pal}.${k}`, 1);
        }
    }
    const recipes = c.recipes.recipes ?? {};
    const ingredientKeys = new Set<string>([...KINDS, 'empty_gold', 'thread', 'story']);
    for (const [id, r] of Object.entries(recipes)) {
      num(r.brew, `recipes.${id}.brew`, 1);
      num(r.heat, `recipes.${id}.heat`, 0);
      num(r.knownFrom, `recipes.${id}.knownFrom`, 1);
      for (const [k, n] of Object.entries(r.ingredients ?? {})) {
        need(ingredientKeys.has(k), `recipes.${id}.ingredients.${k}`, 'unknown ingredient');
        num(n, `recipes.${id}.ingredients.${k}`, 1);
      }
    }
    for (const [f, r] of Object.entries(c.guests.orderRecipes ?? {}))
      need(recipes[r], `guests.orderRecipes.${f}`, `unknown recipe ${r}`);
    need(recipes[c.guests.nameless?.accepts], 'guests.nameless.accepts', 'unknown recipe');
    need(recipes[c.guests.nameless?.acceptsFinal], 'guests.nameless.acceptsFinal', 'unknown recipe');
    need(recipes[c.economy.kupaReward?.recipe], 'economy.kupaReward.recipe', 'unknown recipe');
    for (const [id, sp] of Object.entries(c.guests.special ?? {}))
      need(WORLDS.includes(sp.world), `guests.special.${id}.world`, 'unknown world');
    for (const [id, v] of Object.entries(c.vows.vows ?? {})) {
      if (v.recipe) need(recipes[v.recipe], `vows.${id}.recipe`, 'unknown recipe');
      if (v.guest) need(c.guests.special[v.guest], `vows.${id}.guest`, 'unknown special guest');
      need(v.from <= v.to, `vows.${id}`, 'from > to');
    }
    for (const [i, sg] of (c.schedule.storyGuests ?? []).entries()) {
      need(c.guests.special[sg.guest], `schedule.storyGuests.${i}.guest`, 'unknown special guest');
      need(c.schedule.slots.includes(sg.slot), `schedule.storyGuests.${i}.slot`, 'unknown slot');
      if (sg.ifRepeat) need(c.vows.vows[sg.ifRepeat], `schedule.storyGuests.${i}.ifRepeat`, 'unknown vow');
    }
    for (const s of c.schedule.slots ?? []) num(c.schedule.slotTicks?.[s], `schedule.slotTicks.${s}`, 0);
    need(c.schedule.slots.includes(c.schedule.windSlot), 'schedule.windSlot', 'unknown slot');
    for (const t of c.nights.tutorial.recipes ?? []) need(recipes[t], 'nights.tutorial.recipes', `unknown ${t}`);
    for (const p of Object.keys(c.economy.prices ?? {}))
      need(
        ['shelf', 'chair', 'mittens', 'double_burner', 'silence_jar'].includes(p),
        `economy.prices.${p}`,
        'unknown item',
      );
    for (const e of c.endings.priority ?? [])
      need(['new_spring', 'remember', 'wound', 'letter'].includes(e), 'endings.priority', `unknown ending ${e}`);
    num(c.sediment.stackMax, 'sediment.stackMax', 1);
    num(c.nights.start.heatMax, 'nights.start.heatMax', 1);
  } catch (e) {
    errors.push(`$: malformed content (${(e as Error).message})`);
  }
  return errors;
}

/** Stable content revision derived from the merged data. */
export function contentRevision(data: Content): string {
  return 'c-' + hashHex(stableStringify(data));
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (isObj(v))
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}

export function hashHex(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function mergeContent(files: Record<string, unknown>): Content {
  const out: Record<string, unknown> = {};
  for (const f of CONTENT_FILES) out[f] = files[f];
  return out as unknown as Content;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Deterministic counter-based PRNG (sfc32) seeded from a string. */
export function rngFrom(key: string): () => number {
  const h = hashHex(key);
  let a = parseInt(h.slice(0, 8), 16) >>> 0;
  let b = parseInt(h.slice(8, 16), 16) >>> 0;
  let c = (a ^ 0x9e3779b9) >>> 0;
  let d = (b ^ 0x85ebca6b) >>> 0;
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}
