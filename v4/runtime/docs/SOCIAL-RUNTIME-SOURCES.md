# Social runtime source and license record

## Facts

- Product behavior and fixed account/source choices were read from the project's own frozen 3.1.1 UI source at review time: `LauncherUI/SocialFeedWindow.cs` in the separately controlled Publish tree. That source was read-only and was not modified or copied into V4App.
- Fixed public accounts are Tibo (`thsottiaux`), OpenAI (`OpenAI`), and ChatGPT (`ChatGPT`). Fixed network sources are the XXU RSS route, RSSHub route, Jina public page reader, and the same fixed Google translation route used by 3.1.1.
- V4App's broker, parsers, validators, cache, and tests in this change are newly implemented for the 4.0 runtime. No third-party code or visual asset was copied or vendored.
- The first implementation does not download or redistribute account avatars. `avatarDataUrl` remains an optional future-compatible response field.

## License obligations

- No new package dependency, bundled source, font, icon, or media asset was added by this social runtime work.
- Public endpoint behavior is not treated as source-code licensing permission. Any future vendoring of code or assets requires a separate license review and source record.

## Operational boundary

- This record describes implementation provenance only. It is not approval to run live requests, accept third-party terms, ship, or publish; those decisions remain with total control.
