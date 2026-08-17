#!/usr/bin/env node
/**
 * generate-manifests.mjs
 *
 * Generates the NINA combined plugin repository manifest at
 *   docs/pages/plugins/manifests
 * as a JSON array matching NINA's PluginManifest schema
 * (see NINA.Plugin/ManifestDefinition/PluginManifest.cs).
 *
 * For each plugin listed in config/plugins.json it:
 *   1. Queries the repo's latest GitHub release.
 *   2. Picks the best installable asset: a .zip is preferred; a .dll is
 *      accepted only as a transitional fallback when no .zip exists.
 *   3. Resolves the version from the asset filename, falling back to the
 *      release tag.
 *   4. Resolves the SHA-256 checksum from a matching .sha256 release asset
 *      if present, otherwise computes it by downloading the asset.
 *   5. Emits one NINA manifest entry.
 *
 * Determinism: output is sorted by plugin Name and written with stable
 * formatting. Asset selection is deterministic (highest-version .zip wins).
 *
 * Failure policy: missing release assets or an unobtainable checksum fail
 * loudly (non-zero exit) UNLESS the plugin is marked "transitional" in the
 * config, in which case it is skipped with a warning instead.
 *
 * No third-party dependencies. Requires Node 18+ (global fetch).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'config', 'plugins.json');
const outputPath = path.join(repoRoot, 'docs', 'pages', 'plugins', 'manifests');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com';
const UA = 'NINA_SeePlugins-manifest-generator';

function apiHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': UA,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

async function ghGet(url) {
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Parse a dotted version string into a 4-part {Major,Minor,Patch,Build}. */
function versionFromString(s) {
  const m = String(s).match(/(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return {
    Major: parseInt(m[1], 10),
    Minor: parseInt(m[2], 10),
    Patch: parseInt(m[3], 10),
    Build: m[4] ? parseInt(m[4], 10) : 0,
  };
}

function compareVersions(a, b) {
  for (const key of ['Major', 'Minor', 'Patch', 'Build']) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return 0;
}

/**
 * Deterministically pick the best installable asset.
 * Returns { asset, transitional } where transitional is true when only a
 * .dll was available (no .zip exists).
 */
function pickAsset(assets, pluginName) {
  const zips = assets.filter((a) => a.name.toLowerCase().endsWith('.zip'));
  const dlls = assets.filter((a) => a.name.toLowerCase().endsWith('.dll'));

  if (zips.length > 0) {
    const named = zips.filter((a) =>
      a.name.toLowerCase().includes(pluginName.toLowerCase())
    );
    const pool = named.length > 0 ? named : zips;
    const chosen = pool
      .map((a) => ({ asset: a, ver: versionFromString(a.name) }))
      .sort((x, y) => {
        if (x.ver && y.ver) return compareVersions(y.ver, x.ver);
        if (x.ver) return -1;
        if (y.ver) return 1;
        return 0;
      })[0].asset;
    return { asset: chosen, transitional: false };
  }

  if (dlls.length > 0) {
    return { asset: dlls[0], transitional: true };
  }

  return { asset: null, transitional: false };
}

/** Find a .sha256 asset that corresponds to the chosen asset, if any. */
function findSha256Asset(assets, chosenAsset) {
  const base = chosenAsset.name.toLowerCase();
  return (
    assets.find((a) => {
      const n = a.name.toLowerCase();
      return (
        n === `${base}.sha256` ||
        n === `${base}.sha256.txt` ||
        n === `${base}.sha256sum`
      );
    }) || null
  );
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Resolve the SHA-256 checksum for the chosen asset: prefer a matching
 * .sha256 release asset, otherwise compute it by downloading the asset.
 */
async function resolveChecksum(assets, chosenAsset) {
  const shaAsset = findSha256Asset(assets, chosenAsset);
  if (shaAsset) {
    const text = await fetchText(shaAsset.browser_download_url);
    const m = text.match(/[A-Fa-f0-9]{64}/);
    if (!m) {
      throw new Error(
        `.sha256 asset "${shaAsset.name}" did not contain a 64-char hex hash`
      );
    }
    return m[0].toLowerCase();
  }
  const buf = await fetchBuffer(chosenAsset.browser_download_url);
  return createHash('sha256').update(buf).digest('hex');
}

async function processPlugin(cfg) {
  const { repo, name, identifier } = cfg;
  const cfgTransitional = Boolean(cfg.transitional);

  let release;
  try {
    release = await ghGet(`${API}/repos/${repo}/releases/latest`);
  } catch (err) {
    if (cfgTransitional && /404/.test(err.message)) {
      console.warn(`[warn] ${repo}: no releases found; marked transitional, skipping`);
      return null;
    }
    throw err;
  }

  const assets = release.assets || [];
  const { asset, transitional: assetTransitional } = pickAsset(assets, name);
  const isTransitional = cfgTransitional || assetTransitional;

  if (!asset) {
    if (isTransitional) {
      console.warn(
        `[warn] ${repo}: no .zip or .dll asset on release "${release.tag_name}"; marked transitional, skipping`
      );
      return null;
    }
    throw new Error(
      `${repo}: no installable release asset (.zip or .dll) on release "${release.tag_name}"`
    );
  }

  const version =
    versionFromString(asset.name) || versionFromString(release.tag_name);
  if (!version) {
    if (isTransitional) {
      console.warn(
        `[warn] ${repo}: cannot determine version from asset "${asset.name}" or tag "${release.tag_name}"; marked transitional, skipping`
      );
      return null;
    }
    throw new Error(
      `${repo}: cannot determine version from asset "${asset.name}" or tag "${release.tag_name}"`
    );
  }

  let checksum;
  try {
    checksum = await resolveChecksum(assets, asset);
  } catch (err) {
    if (isTransitional) {
      console.warn(
        `[warn] ${repo}: checksum unavailable for "${asset.name}" (${err.message}); marked transitional, skipping`
      );
      return null;
    }
    throw new Error(`${repo}: failed to obtain checksum for "${asset.name}": ${err.message}`);
  }

  const installerType = asset.name.toLowerCase().endsWith('.zip') ? 'ARCHIVE' : 'DLL';

  return {
    Name: name,
    Identifier: identifier,
    Version: version,
    Author: cfg.author,
    Homepage: cfg.homepage || '',
    Repository: cfg.repository || `https://github.com/${repo}`,
    License: cfg.license,
    LicenseURL: cfg.licenseUrl,
    ChangelogURL: cfg.changelogUrl || `https://github.com/${repo}/releases`,
    Tags: cfg.tags || [],
    MinimumApplicationVersion: versionFromString(cfg.minimumApplicationVersion),
    Descriptions: {
      ShortDescription: cfg.descriptions.shortDescription,
      LongDescription: cfg.descriptions.longDescription || '',
      FeaturedImageURL: cfg.descriptions.featuredImageUrl || '',
      ScreenshotURL: cfg.descriptions.screenshotUrl || '',
      AltScreenshotURL: cfg.descriptions.altScreenshotUrl || '',
    },
    Installer: {
      URL: asset.browser_download_url,
      Type: installerType,
      Checksum: checksum,
      ChecksumType: 'SHA256',
    },
  };
}

async function main() {
  // Strip a UTF-8 BOM if present (e.g. written by PowerShell) before parsing.
  const raw = await readFile(configPath, 'utf8');
  const config = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const plugins = config.plugins || [];
  if (plugins.length === 0) {
    throw new Error(`No plugins defined in ${configPath}`);
  }

  const results = [];
  for (const p of plugins) {
    const entry = await processPlugin(p);
    if (entry) results.push(entry);
  }

  if (results.length === 0) {
    throw new Error('No plugin manifests were generated; refusing to write an empty manifest file.');
  }

  // Deterministic ordering.
  results.sort((a, b) => a.Name.localeCompare(b.Name));

  const json = JSON.stringify(results, null, 2) + '\n';
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, 'utf8');

  console.log(`Wrote ${results.length} plugin manifest(s) to ${outputPath}`);
  for (const r of results) {
    console.log(`  - ${r.Name} ${r.Version.Major}.${r.Version.Minor}.${r.Version.Patch}.${r.Version.Build} [${r.Installer.Type}]`);
  }
}

main().catch((err) => {
  console.error(`[error] ${err.message}`);
  process.exit(1);
});
