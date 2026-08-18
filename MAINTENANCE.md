# NINA_SeePlugins maintenance guide

This repository is the shared public NINA plugin repository for the See plugin family.

Public landing page:

```text
https://cstovi.github.io/NINA_SeePlugins/
```

NINA plugin repository URL users add:

```text
https://cstovi.github.io/NINA_SeePlugins
```

NINA manifest endpoint:

```text
https://cstovi.github.io/NINA_SeePlugins/plugins/manifests
```

## What lives here

`NINA_SeePlugins` is only the shared index/site. It does **not** contain the plugin source code.

Plugin code and releases remain in the individual repos:

- `cstovi/NINA_SeeDew`
- `cstovi/NINA_SeeDark`
- `cstovi/NINA_SeeDither`
- `cstovi/NINA_SeeDrift`

This repo publishes two things from `docs/pages` via GitHub Pages:

- `index.html` — the human web page with install instructions, copy button, plugin cards, and Ko-fi link.
- `plugins/manifests` — the JSON manifest array that NINA reads.

## How NINA uses it

Users add the base repo URL in NINA 3.2 here:

```text
Options → General → Plugin Repositories section → +
```

NINA appends `/plugins/manifests` to the base URL, downloads the JSON array, and treats each array item as an independently installable plugin. Users can install/update only the See plugins they want.

Installed plugins are matched to manifest entries by `Identifier` GUID, not by filename or file modified date. Keep each `Identifier` exactly matching the plugin assembly GUID.

## Key files

```text
config/plugins.json
scripts/generate-manifests.mjs
docs/pages/index.html
docs/pages/style.css
docs/pages/script.js
docs/pages/plugins/manifests
.github/workflows/pages.yml
```

### `config/plugins.json`

Static source data for each plugin:

- GitHub repo name
- manifest display name
- plugin GUID / `Identifier`
- author/homepage/repository/license fields
- NINA minimum version
- tags
- short/long descriptions
- featured image URL

Do not put release versions, installer URLs, or checksums here. Those are resolved from GitHub releases when the manifest generator runs.

`transitional` should normally be `false`. Only set it to `true` temporarily if a plugin is not ready to be listed and the shared manifest build should skip it instead of failing.

### `scripts/generate-manifests.mjs`

Dependency-free Node script. It:

1. Reads `config/plugins.json`.
2. Queries the latest GitHub release for each plugin repo.
3. Chooses the install asset, preferring a versioned `.zip`.
4. Reads the matching `.zip.sha256` asset, or computes SHA256 by downloading the asset if needed.
5. Builds one NINA manifest object per plugin.
6. Sorts entries by plugin name.
7. Writes `docs/pages/plugins/manifests`.

Run locally from this repo:

```powershell
node scripts/generate-manifests.mjs
```

Use a token if GitHub API rate limits are a problem:

```powershell
$env:GITHUB_TOKEN = "..."
node scripts/generate-manifests.mjs
```

### `.github/workflows/pages.yml`

GitHub Actions workflow that regenerates the manifest and deploys `docs/pages` to GitHub Pages.

It runs on:

- push to `main`
- manual `workflow_dispatch`
- `repository_dispatch` with type `release`

## Normal release/update flow

When one of the plugin repos has a new plugin release:

1. In that plugin repo, bump version fields in `Properties/AssemblyInfo.cs`.
2. Update that plugin repo's `CHANGELOG.md` / README if needed.
3. Commit and push the plugin repo.
4. Tag the release, e.g.:

   ```powershell
   git tag v1.8.0
   git push origin v1.8.0
   ```

5. The plugin repo release workflow builds and publishes:

   ```text
   NINA.Plugin.<PluginName>-x.y.z.0.zip
   NINA.Plugin.<PluginName>-x.y.z.0.zip.sha256
   ```

   Some repos may also keep uploading the raw DLL for manual-download compatibility.

6. Refresh this shared manifest repo after the release assets are live:

   ```powershell
   cd ../NINA_SeePlugins
   node scripts/generate-manifests.mjs
   git add docs/pages/plugins/manifests
   git commit -m "Refresh manifests for <PluginName> vx.y.z"
   git push
   ```

7. Wait for the `Generate & Deploy Plugin Manifests` workflow to pass.
8. Verify the live endpoint contains the new version and `Installer.Type: "ARCHIVE"`.

## Editing the web page

Edit files under `docs/pages`:

- `index.html` for text/content/cards/links
- `style.css` for visual styling
- `script.js` for the copy button and small page interactions

Then commit and push to `main`. The Pages workflow redeploys the page.

Install instructions on the page should currently say:

```text
Options → General → Plugin Repositories section → +
```

That path was verified for NINA 3.2.

## Existing manual installs and settings

Switching from manual DLL copy to the repo installer should preserve plugin settings. The See plugins store settings outside the plugin install folder:

```text
%LOCALAPPDATA%\NINA\SeeDew\settings.json
%LOCALAPPDATA%\NINA\SeeDark\settings.json
%LOCALAPPDATA%\NINA\SeeDither\settings.json
%LOCALAPPDATA%\NINA\SeeDrift\settings.json
```

NINA installs plugin files under a NINA plugins directory such as:

```text
%LOCALAPPDATA%\NINA\Plugins\3.0.0\<PluginName>\
```

If a user sees duplicate plugins after switching, tell them to remove only the old manually copied plugin DLL/folder. Do **not** tell them to delete `%LOCALAPPDATA%\NINA\See*` unless they intentionally want to reset settings.

## Verification commands

Check latest site deploy:

```powershell
gh run list --repo cstovi/NINA_SeePlugins --limit 5
```

Check a plugin release has zip assets:

```powershell
gh release view v1.8.0 --repo cstovi/NINA_SeeDark --json tagName,assets,url
```

Regenerate manifest locally:

```powershell
node scripts/generate-manifests.mjs
```

Verify the live manifest manually:

```text
https://cstovi.github.io/NINA_SeePlugins/plugins/manifests
```

Every listed plugin should have:

```json
"Installer": {
  "Type": "ARCHIVE",
  "ChecksumType": "SHA256"
}
```

## Common failure cases

- **Pages workflow fails with missing release asset**: the plugin release workflow may still be running, or the tag did not publish a zip.
- **Manifest still shows an old version**: regenerate and commit `docs/pages/plugins/manifests` after the plugin release assets exist.
- **GitHub rejects workflow-file push**: local `gh` auth needs `workflow` scope.
- **NINA does not offer update**: check the manifest `Identifier` GUID and `Version`; NINA matches by GUID and compares versions, not file dates.
- **Duplicate plugin after switching from manual install**: old manual DLL may still be in an unusual plugin folder. Remove only the old plugin DLL/folder, not the `%LOCALAPPDATA%\NINA\See*` settings folder.
