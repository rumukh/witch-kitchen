# Крестец. Ведьмина кухня на границе миров — v1

A cozy turn-based kitchen-of-feelings game on the AEGIS engine. Russian only (Q44).

## Run and build

```powershell
npm ci                     # installs the vendored AEGIS SDK tarballs (vendor/aegis-sdk) and dev tools
npm run dev                # Vite dev server (http://localhost:5199); content/*.json is fetched at runtime,
                           # so a balance edit only needs a page reload (no TypeScript rebuild)
npm run build:web          # dist/web (static, relative paths, no service worker) + release/krestets-web.zip for itch.io
npm run build:win          # Electron portable Windows x64: dist/win/Krestets-win32-x64 + release/krestets-win-x64.zip
```

Checks:

```powershell
npm run typecheck; npm run lint; npm test          # rules, AEGIS host parity, replay
npm run sim                                         # 10,000-seed sweeps → docs/reports/simulation-report.md
npx tsx scripts/make-fixture.ts e2e/fixtures/night12.json 12; npx tsx scripts/make-fixture.ts e2e/fixtures/night10.json 10
npm run e2e                                         # Playwright on dist/web (run build:web first)
node scripts/smoke-electron.mjs                     # packaged desktop: launch, play, quit, relaunch, resume
npx tsx scripts/replay-report.ts <night-report.json> # DIAG-01 headless replay
npx tsx sim/replay-seed.ts new_spring standard 42   # reproduce any sweep seed with a full trace
```

Fixtures are tied to the content revision (a hash of `content/*.json`); regenerate them after a
balance edit.

## Layout

| Path | What |
|---|---|
| `docs/GAME_RULES_V1.md` | authoritative rules contract (EN) |
| `docs/DECISIONS_LOG.md` | build-team decisions closing remaining gaps |
| `content/*.json` | all balance numbers; `content/locales/ru/*.json` all texts by stable key |
| `src/model` | pure deterministic rules (shared by the AEGIS host and the bots) |
| `src/engine/adapter.ts` | AEGIS runtime adapter (typed commands, ticks as logical turns, events) |
| `src/platform` | slots/profile/storage (IndexedDB on web, file storage on desktop), slot session, night report |
| `src/ui` | DOM/SVG UI, scenes, onboarding, audio director, art library |
| `electron/` | desktop main/preload (app:// protocol, file saves in `%APPDATA%\Krestets`) |
| `sim/` | bots and seed sweeps |
| `e2e/` | Playwright UI tests and fixtures |
| `assets/art`, `assets/audio` | delivered by the art/audio sessions (manifests + provenance) |
| `docs/reports`, `docs/screens` | evidence |

Storage namespace: `io.github.rumukh.krestets` (WEBHOST-01). Engine pin: AEGIS
`cc9593b37cf72b72047ac0fc076fb80283652d50` (`vendor/aegis-sdk/PROVENANCE.md`).
