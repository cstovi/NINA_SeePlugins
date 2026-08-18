# NINA_SeePlugins

Combined NINA plugin repository for the Seestar telescope plugin family
(SeeDew, SeeDark, SeeDither, SeeDrift). This repository publishes a static
GitHub Pages site that NINA can use as a plugin repository, and provides the
tooling to regenerate the plugin manifest whenever any plugin publishes a new
release.

## How it works

- **`config/plugins.json`** — the single source of truth for the four plugin
  repos and their static metadata (GUID/identifier, author, descriptions,
  tags, minimum NINA version, etc.), sourced from each plugin repo's
  `Properties/AssemblyInfo.cs`. Version, download URL and checksum are *not*
  stored here — they are resolved at generation time from each repo's latest
  GitHub release.
- **`scripts/generate-manifests.mjs`** — a dependency-free Node script that:
  1. Queries the latest GitHub release for each plugin repo.
  2. Picks the best installable asset — a `.zip` is preferred; a `.dll` is
     accepted only as a transitional fallback when no `.zip` exists.
  3. Resolves the version from the asset filename, falling back to the
     release tag.
  4. Resolves the SHA-256 checksum from a matching `.sha256` release asset if
     present, otherwise computes it by downloading the asset.
  5. Writes `docs/pages/plugins/manifests` as a JSON array matching NINA's
     `PluginManifest` schema.
- **`.github/workflows/pages.yml`** — GitHub Actions workflow that regenerates
  the manifest and deploys `docs/pages` to GitHub Pages. It runs on `push` to
  `main`, `workflow_dispatch`, and `repository_dispatch` with type `release`.

## NINA repository URL

The site root is `docs/pages`, so NINA fetches the manifest at:

```
https://<owner>.github.io/<repo>/plugins/manifests
```

In NINA's plugin settings, add this as a plugin repository URL.

## Existing manual installs and settings

Switching from manually copied DLLs to this repository should preserve plugin
configuration. The See plugins store settings outside the plugin install folder:

- `%LOCALAPPDATA%\NINA\SeeDew\settings.json`
- `%LOCALAPPDATA%\NINA\SeeDark\settings.json`
- `%LOCALAPPDATA%\NINA\SeeDither\settings.json`
- `%LOCALAPPDATA%\NINA\SeeDrift\settings.json`

NINA installs/updates plugin files under
`%LOCALAPPDATA%\NINA\Plugins\3.0.0\<PluginName>\`, so replacing or updating the
plugin DLL does not delete those settings files.

If a user previously installed a DLL manually, NINA matches installed plugins to
repository entries by the plugin `Identifier`/GUID. Same GUID + newer repository
version becomes an update; same GUID + same/newer local version is shown as
installed. If duplicates appear because an old DLL was copied into an unusual
folder, remove only the old manual plugin DLL/folder under
`%LOCALAPPDATA%\NINA\Plugins\3.0.0`. Do **not** delete the separate
`%LOCALAPPDATA%\NINA\See*` settings folders unless intentionally resetting the
plugin.

## Determinism & failure policy

- Output is sorted by plugin `Name` and written with stable formatting.
- Asset selection is deterministic (highest-version `.zip` wins).
- Missing release assets or an unobtainable checksum **fail loudly**
  (non-zero exit) unless the plugin is marked `"transitional": true` in
  `config/plugins.json`, in which case it is skipped with a warning instead.

## Local regeneration

```sh
node scripts/generate-manifests.mjs
```

Set `GITHUB_TOKEN` in the environment to avoid GitHub API rate limits.

## Adding / updating a plugin

1. Add or edit its entry in `config/plugins.json` (GUID must match the
   plugin's `AssemblyInfo.cs`).
2. Run the script locally to verify, or push and let CI regenerate + deploy.

For the full maintenance/release workflow, see [MAINTENANCE.md](MAINTENANCE.md).
