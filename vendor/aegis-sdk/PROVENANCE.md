# AEGIS SDK provenance

| Field | Value |
|---|---|
| Repository | https://github.com/rumukh/aegis-engine |
| Commit | `0abd61b5a679020bfb66bf4db24888df9e339d4d` (main on 2026-10-08, CI and Pages green) |
| Build host | Windows, Node v25.6.0, npm 11.8.0 |
| Clone location | `%LOCALAPPDATA%\krestets-build\aegis-0abd61b5` (outside this repository) |
| License | MIT, © 2026 Aegis contributors (see `THIRD_PARTY_NOTICES.md`) |

Commands:

```powershell
git clone https://github.com/rumukh/aegis-engine.git aegis-0abd61b5
git -C aegis-0abd61b5 checkout 0abd61b5a679020bfb66bf4db24888df9e339d4d
npm ci
npm run pack:sdk -- --revision 0abd61b5a679020bfb66bf4db24888df9e339d4d --out out\sdk-release
# copy out\sdk-release\* to vendor\aegis-sdk\ and install all four tarballs in one npm invocation
```

| Tarball | SHA-256 |
|---|---|
| aegis-core-0.0.0-local.r0abd61b5a679.dc349e8c5ff2bae20.tgz | c0e5311915befd51c40fe3a244b39ae12648f3eab5864436deeaf13ef49430a1 |
| aegis-runtime-0.0.0-local.r0abd61b5a679.dc349e8c5ff2bae20.tgz | 98032097506781d9e239854b7e81694ec3da5e70cb3407d25885eedd5aa1159c |
| aegis-narrative-0.0.0-local.r0abd61b5a679.dc349e8c5ff2bae20.tgz | e9fb223c68fda44436449b13b1712913d988e5d4b9cc577dc8e39c044706cb2d |
| aegis-browser-0.0.0-local.r0abd61b5a679.dc349e8c5ff2bae20.tgz | 82fffdc3b14502b07ee6fd5761ff603c94aa9aeb02fcbb95d638a28656aebca0 |

`artifacts.json` is the engine's own manifest (versions, npm integrity, source digest).
The game imports only public exports: `@aegis/runtime`, `@aegis/browser/save`,
`@aegis/browser/indexeddb`, `@aegis/browser/checkpoint`, `@aegis/browser/audio`,
`@aegis/browser/ui`. No AEGIS demo or lab media is shipped.
