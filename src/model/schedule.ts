import { WORLDS, rngFrom } from './content.js';
import type { Content, Kind, World } from './content.js';
import type { GameState, ScheduleEntry, VowState } from './types.js';

export function paletteFor(C: Content, world: World, night: number): Partial<Record<Kind, number>> {
  const wd = C.guests.worlds[world];
  const pal = { ...(night >= C.nights.fullPaletteFromNight ? wd.full : wd.slice) };
  if (night === C.nights.droughtNight && world === 'river' && pal.sadness) {
    pal.sadness -= 1;
    if (pal.sadness <= 0) delete pal.sadness;
  }
  return pal;
}

export function availableWorlds(C: Content, night: number): World[] {
  return WORLDS.filter((w) => C.guests.worlds[w].fromNight <= night);
}

/**
 * Pre-roll a night's guests (§6.2). Depends only on seed, night, line, mode, the two
 * previous nights' worlds and vow repeat status — never on actions inside the night.
 */
export function generateSchedule(
  C: Content,
  seed: string,
  night: number,
  line: World | null,
  hist: World[][],
  vows: Record<string, VowState>,
  guaranteesOn: boolean,
): ScheduleEntry[] {
  const rng = rngFrom(`${seed}|night|${night}|${line ?? '-'}`);
  const S = C.schedule;
  if (night === C.nights.tutorial.night) {
    return S.storyGuests
      .filter((g) => g.night === night)
      .map((g) => ({
        slot: g.slot,
        t: g.tick ?? S.slotTicks[g.slot]!,
        w: C.guests.special[g.guest]!.world,
        sp: g.guest,
        u: rng(),
        wind: false,
        w0: null,
        done: false,
      }));
  }
  const story = new Map<string, string>();
  for (const g of S.storyGuests) {
    if (g.night !== night) continue;
    if (g.ifRepeat && !(vows[g.ifRepeat]?.rep && vows[g.ifRepeat]!.from === night)) continue;
    story.set(g.slot, g.guest);
  }
  const worlds = availableWorlds(C, night);
  const ordinarySlots = S.slots.filter((s) => !story.has(s));
  const windOrdinary = ordinarySlots.includes(S.windSlot);
  const forced = S.forcedWorlds.filter((f) => f.night === night);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const recentWorlds = new Set(hist.slice(-(S.windowNights - 1)).flat());
  const windowNeeded = worlds.filter(
    (w) => C.guests.worlds[w].fromNight <= night - (S.windowNights - 1) && !recentWorlds.has(w),
  );
  const guarantees = guaranteesOn ? S.guarantees.filter((g) => g.nights.includes(night)) : [];

  const check = (assign: Map<string, World>, windWorld: World | null): boolean => {
    const ordinaryWorlds = ordinarySlots.map((s) => (s === S.windSlot && windWorld ? windWorld : assign.get(s)!));
    const all = [...ordinaryWorlds, ...[...story.values()].map((g) => C.guests.special[g]!.world)];
    if (line) {
      const need = Math.min(S.lineMin, ordinarySlots.length - (windOrdinary ? 1 : 0));
      if (ordinaryWorlds.filter((w) => w === line).length < need) return false;
    }
    for (const f of forced) if (ordinaryWorlds.filter((w) => w === f.world).length < f.count) return false;
    for (const w of windowNeeded) if (!all.includes(w)) return false;
    for (const g of guarantees) {
      if (g.world && !ordinaryWorlds.includes(g.world)) return false;
      if (g.paletteHas && !ordinaryWorlds.some((w) => (paletteFor(C, w, night)[g.paletteHas!] ?? 0) > 0))
        return false;
    }
    return true;
  };

  let best: { assign: Map<string, World>; wind: World | null } | null = null;
  for (let attempt = 0; attempt < 400 && !best; attempt++) {
    const assign = new Map<string, World>();
    const free = [...ordinarySlots];
    const take = () => {
      const nonWind = free.filter((s) => s !== S.windSlot);
      const pool = nonWind.length ? nonWind : free;
      const s = pool[Math.floor(rng() * pool.length)]!;
      free.splice(free.indexOf(s), 1);
      return s;
    };
    for (const f of forced) for (let i = 0; i < f.count && free.length; i++) assign.set(take(), f.world);
    if (line) {
      const nonWind = free.filter((s) => s !== S.windSlot);
      for (let i = 0; i < S.lineMin && nonWind.length; i++) {
        const s = nonWind.splice(Math.floor(rng() * nonWind.length), 1)[0]!;
        free.splice(free.indexOf(s), 1);
        assign.set(s, line);
      }
    }
    for (const s of free) assign.set(s, pick(worlds));
    let windWorld: World | null = null;
    if (windOrdinary) {
      const original = assign.get(S.windSlot)!;
      const foreign = worlds.filter((w) => w !== (line ?? original));
      windWorld = pick(foreign.length ? foreign : worlds);
    }
    if (check(assign, windWorld) || attempt === 399) best = { assign, wind: windWorld };
  }
  const out: ScheduleEntry[] = [];
  for (const slot of S.slots) {
    const sp = story.get(slot) ?? null;
    const isWind = slot === S.windSlot && !sp && windOrdinary;
    const w = sp ? C.guests.special[sp]!.world : isWind ? best!.wind! : best!.assign.get(slot)!;
    out.push({
      slot,
      t: S.slotTicks[slot]!,
      w,
      sp,
      u: rng(),
      wind: isWind,
      w0: isWind ? best!.assign.get(slot)! : null,
      done: false,
    });
  }
  return out;
}

export function scheduleSatisfiesGuarantees(C: Content, sched: ScheduleEntry[], night: number): boolean {
  const ordinary = sched.filter((e) => !e.sp).map((e) => e.w);
  for (const g of C.schedule.guarantees.filter((x) => x.nights.includes(night))) {
    if (g.world && !ordinary.includes(g.world)) return false;
    if (g.paletteHas && !ordinary.some((w) => (paletteFor(C, w, night)[g.paletteHas!] ?? 0) > 0)) return false;
  }
  return true;
}

export function worldsOf(sched: ScheduleEntry[]): World[] {
  return sched.map((e) => e.w);
}

export function previewGuests(s: GameState) {
  return s.nt.sched;
}
