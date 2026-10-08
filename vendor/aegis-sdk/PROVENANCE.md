# AEGIS SDK provenance

| Field | Value |
|---|---|
| Repository | https://github.com/rumukh/aegis-engine |
| Commit | `cc9593b37cf72b72047ac0fc076fb80283652d50` (main on 2026-10-08: merge of PR #19 after PR #18; includes runtime fixes #8/#9/#17, audio #13, save rebind #15, custom `schemes`) |
| Previous pin | `0abd61b5a679020bfb66bf4db24888df9e339d4d` (v1 release candidate) |
| Build host | Windows, Node v25.6.0, npm 11.8.0 |
| Clone location | `%LOCALAPPDATA%\krestets-build\aegis-cc9593b` (outside this repository) |
| License | MIT, © 2026 Aegis contributors (see `THIRD_PARTY_NOTICES.md`) |

Commands:

```powershell
git clone https://github.com/rumukh/aegis-engine.git aegis-cc9593b
git -C aegis-cc9593b checkout cc9593b37cf72b72047ac0fc076fb80283652d50
npm ci
npm run pack:sdk -- --revision cc9593b37cf72b72047ac0fc076fb80283652d50 --out out\sdk-release
# copy out\sdk-release\* to vendor\aegis-sdk\ and install all four tarballs in one npm invocation
```

| Tarball | SHA-256 |
|---|---|
| aegis-browser-0.0.0-local.rcc9593b37cf7.d34550d4cb20c6afa.tgz | 40b3f34e5095c035ba416faea274088de061d7e439ede90a70b225f92dfb2f02 |
| aegis-core-0.0.0-local.rcc9593b37cf7.d34550d4cb20c6afa.tgz | 7b584f5e5f3e5f550d198c84758d9cc497dc8b98116bc2ddc396f7cfd5e3083a |
| aegis-narrative-0.0.0-local.rcc9593b37cf7.d34550d4cb20c6afa.tgz | 8e598a40fc6cfb5defad778d4de0e88877e1001382b3e4979a95cffcd9b22036 |
| aegis-runtime-0.0.0-local.rcc9593b37cf7.d34550d4cb20c6afa.tgz | e853714bdfe9c957b802505ff3ecf73a79199b888a12b551692a8f0e6557a61f |

`artifacts.json` is the engine's own manifest (versions, npm integrity, source digest).
The game imports only public exports: `@aegis/runtime`, `@aegis/browser/save`,
`@aegis/browser/indexeddb`, `@aegis/browser/checkpoint`, `@aegis/browser/audio`,
`@aegis/browser/ui`. No AEGIS demo or lab media is shipped.
