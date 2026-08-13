# Third-party and adapted-source notices

Current status: prerelease concept only; not a release package.

## Nebula Capsules Guanyu Lab progress renderer

- Source: https://github.com/yizhe21803/nebula-capsules-guanyu-lab
- Pinned source commit: `aef3f7d010a721e00404ec8dc69239714e38e77c`
- Copyright: Copyright (c) 2026 yizhe21803
- License: MIT
- Vendored files (copied unchanged into `third_party/nebula-progress/`): `LICENSE`, `progress.css`, `progress-flow-renderer.js`, `progress-flow-overlays.js`, `progress-motion-data.js`, and `progress-reference-atlases.js`.
- Source verification: all vendored files were copied from the pinned checkout and SHA-256 matched. Renderer `2C8B52181EBB31077F27829C34DD121D695FA8E9CAD07D6344B8CD56A9C845C8`; overlays `6E79302E558C9240267B17A6587FEA65F60D14466AF4715BD0CC7F44E72B69A7`; motion data `CF938FE6CE7FDAE9DF3C3D16196F0AF6B0E0553366F90B27E6D7482E1BC71A22`; reference atlases `0A70639FA464A0D0DB526F6890FA02BD48A07E0E33224DD8D3779DBDE3208066`; progress CSS `6D64342E6986BBD151E951FDBEB4FAA3DAC271B4B7DF5869594E007B8E6EE536`; license `6E79A7FC7A36A51ACC4D8DF6A76DF341422B02B9D721ACD1F8E5562C3B4875F1`.
- Local adaptation: `src/components/NebulaFluidProgress.jsx` is a thin React adapter for actual/displayed progress, ResultReady gating, configurable channels, reduced motion and renderer lifecycle. `src/lib/nebulaCanvasFallback.js` is a small Canvas 2D adapter based on the upstream fallback layering; it is not copied into the upstream directory.
- License copies: `third_party/nebula-progress/LICENSE` and `LICENSES/nebula-capsules-guanyu-lab-MIT.txt`. No upstream attribution or watermark is rendered in the UI.

## WinBridge Recovery 3.1.1 stage orbit

- Source: `LauncherUI/WinBridgeRecovery.cs` in the WinBridge Recovery 3.1.1 project.
- Adapted portions: stage number gradient, 38 px wavy orbit geometry, waiting / active / complete state color and speed logic.
- Local files: `src/components/StageProgressOrbit.jsx`, the stage-orbit rules in `src/styles.css`, and state wiring in `src/components/RecoveryWindow.jsx`.
- License: MIT. The required copyright and license text is in `LICENSES/WinBridge-Recovery-MIT.txt`.

## Build dependencies

- React 19.2.8 — MIT
- React DOM 19.2.8 — MIT
- Vite 8.2.1 — MIT
- @vitejs/plugin-react 6.0.5 — MIT

The final publisher must review the production bundle and include all required dependency notices. Research-only projects listed in `research/SOURCES.md` were not copied into this concept implementation.
