// AEGIS runtime adapter: the authoritative host for a campaign slot.
import {
  createRuntimeHost,
  failure,
  schema,
  success,
  type CheckpointWriter,
  type ContentPack,
  type ContentRegistration,
  type JsonValue,
  type RuntimeAdapter,
  type RuntimeHost,
  type Schema,
} from '@aegis/runtime';
import {
  advanceTick,
  begin,
  createCampaign,
  finish,
  resolve,
  validateContentData,
  type Action,
  type Content,
  type GameState,
  type Mode,
} from '../model/index.js';

export const ADAPTER_ID = 'io.github.rumukh.krestets';
export const STATE_VERSION = 1;

export interface KrestetsView {
  state: GameState;
  turn: number;
  revision: number;
}
export type KrestetsHost = RuntimeHost<GameState, Action, KrestetsView, Content>;

const ACTION_TYPES = new Set([
  'move', 'undo', 'listen', 'listenBottom', 'cook', 'experiment', 'serve', 'clean', 'kupa', 'condense', 'burn',
  'discardDish', 'refuse', 'wait', 'endNight', 'windClock', 'cuckoo', 'vow', 'buy', 'mirrorTrade', 'buyMurky',
  'tram', 'tarot', 'tremorPairs', 'nextNight', 'windFinal', 'restartNight', 'restorePreFinale', 'ackScene',
]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const actionSchema: Schema<Action> = {
  parse(value) {
    if (!isObj(value) || typeof value.t !== 'string' || !ACTION_TYPES.has(value.t))
      return failure('invalid-action', 'Unknown Krestets action.');
    if (JSON.stringify(value).length > 2000) return failure('invalid-action', 'Action too large.');
    return success(value as unknown as Action);
  },
};

const STATE_KEYS = ['v', 'seed', 'mode', 'night', 'phase', 'shelf', 'seats', 'burners', 'nt', 'vows', 'scenes', 'flags'];
export function isGameState(v: unknown): v is GameState {
  if (!isObj(v) || v.v !== 1) return false;
  for (const k of STATE_KEYS) if (!(k in v)) return false;
  return Array.isArray(v.shelf) && Array.isArray(v.seats) && Array.isArray(v.burners) && isObj(v.nt);
}

export const stateSchema: Schema<GameState> = {
  parse(value) {
    return isGameState(value) ? success(value) : failure('invalid-state', 'Not a Krestets campaign state.');
  },
};

export const contentRegistration: ContentRegistration<Content> = {
  schemaVersion: 1,
  schema: {
    parse(value) {
      const errors = validateContentData(value);
      return errors.length ? failure('invalid-content', errors.join('; ')) : success(value as Content);
    },
  },
};

export function createAdapter(seed: string, mode: Mode): RuntimeAdapter<GameState, Action, KrestetsView, Content> {
  return {
    id: ADAPTER_ID,
    stateVersion: STATE_VERSION,
    state: stateSchema,
    action: actionSchema,
    content: contentRegistration,
    eventPhases: ['tick'],
    initialize: ({ content }) => createCampaign(content.data as Content, seed, mode),
    resolve: (action, read) => {
      const r = resolve(read.state as GameState, action, read.content.data as Content);
      if (!r.ok) return failure(`rule.${r.code}`, `Rejected: ${r.code}`);
      return success({ rule: 'act', payload: action as unknown as JsonValue, turns: r.cost });
    },
    commands: [
      {
        id: 'act',
        payload: schema.json as Schema<JsonValue>,
        progress: schema.literal(null),
        start(ctx, pending) {
          const C = ctx.content.data as Content;
          const a = pending.payload as unknown as Action;
          const before = summarize(ctx.state);
          begin(ctx.state, a, C, pending.turns);
          ctx.emit('action', a.t);
          emitDiff(ctx.emit, before, ctx.state);
        },
        turn(ctx) {
          const before = summarize(ctx.state);
          advanceTick(ctx.state, ctx.content.data as Content);
          emitDiff(ctx.emit, before, ctx.state);
        },
        finish(ctx, pending) {
          const before = summarize(ctx.state);
          finish(ctx.state, pending.payload as unknown as Action, ctx.content.data as Content);
          emitDiff(ctx.emit, before, ctx.state);
        },
      },
    ],
    view: (read) => ({ state: read.state as GameState, turn: read.turn, revision: read.revision }),
    validate: ({ state }) =>
      isGameState(state) ? success(undefined) : failure('invalid-state', 'Campaign state is incomplete.'),
  };
}

interface Summary {
  fired: string[];
  arrived: number;
  ready: number;
  phase: string;
  nameless: number;
  scenes: number;
  served: number;
  unhappy: number;
}
function summarize(s: GameState): Summary {
  return {
    fired: [...s.nt.fired],
    arrived: s.nt.stats.arrived,
    ready: s.burners.filter((d) => d?.ok).length,
    phase: s.phase,
    nameless: s.nt.nameless,
    scenes: s.scenes.length,
    served: s.nt.stats.served,
    unhappy: s.nt.stats.unhappy,
  };
}
function emitDiff(emit: (type: string, data?: JsonValue) => void, a: Summary, s: GameState): void {
  for (const f of s.nt.fired) if (!a.fired.includes(f)) emit('chime', f);
  if (s.nt.stats.arrived > a.arrived) emit('arrive', s.nt.stats.arrived - a.arrived);
  const ready = s.burners.filter((d) => d?.ok).length;
  if (ready > a.ready) emit('ready', ready - a.ready);
  if (s.nt.nameless !== a.nameless) emit('nameless', s.nt.nameless);
  if (s.phase !== a.phase) emit('phase', s.phase);
  if (s.nt.stats.served > a.served) emit('served', null);
  if (s.nt.stats.unhappy > a.unhappy) emit('unhappy', null);
}

export function createKrestetsHost(
  content: ContentPack<Content>,
  seed: string,
  mode: Mode,
  checkpoint?: CheckpointWriter,
): KrestetsHost {
  return createRuntimeHost({
    adapter: createAdapter(seed, mode),
    content,
    seed,
    checkpoint,
    limits: { maxTurnsPerAction: 4 },
  });
}

export function contentPack(data: Content, revision: string): ContentPack<Content> {
  return { id: 'krestets-content', revision, schemaVersion: 1, data };
}
