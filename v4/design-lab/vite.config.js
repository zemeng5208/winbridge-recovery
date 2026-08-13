import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const PLUGIN_IDS = ["browser", "chrome", "computer-use"];
const home = os.homedir();
const pluginBases = [
  path.join(home, ".codex", "marketplaces", "openai-bundled", "plugins"),
  path.join(home, ".codex", "plugins", "cache", "openai-bundled"),
  path.join(home, ".codex", ".tmp", "bundled-marketplaces", "openai-bundled", "plugins"),
];

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function findPluginRoot(pluginId) {
  for (const base of pluginBases) {
    const direct = path.join(base, pluginId);
    if (fs.existsSync(path.join(direct, ".codex-plugin", "plugin.json"))) return direct;
    if (!fs.existsSync(base)) continue;
    const candidates = fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const candidate of candidates) {
      const root = path.join(base, candidate.name, "plugins", pluginId);
      if (fs.existsSync(path.join(root, ".codex-plugin", "plugin.json"))) return root;
    }
  }
  return null;
}

function readPluginAsset(pluginId) {
  if (!PLUGIN_IDS.includes(pluginId)) return null;
  const root = findPluginRoot(pluginId);
  if (!root) return { id: pluginId, available: false, sourceRoot: `CODEX_HOME/.../plugins/${pluginId}` };
  const manifestPath = path.resolve(root, ".codex-plugin", "plugin.json");
  if (!inside(root, manifestPath)) return null;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { return null; }
  const logo = manifest?.interface?.logo;
  if (typeof logo !== "string" || logo.startsWith("/") || logo.includes("\\")) return null;
  const relativeAsset = logo.replace(/^\.\//, "");
  const assetPath = path.resolve(root, relativeAsset);
  if (!inside(root, assetPath) || !fs.existsSync(assetPath)) {
    return { id: pluginId, available: false, displayName: manifest?.interface?.displayName || pluginId, sourceRoot: `CODEX_HOME/.../plugins/${pluginId}`, asset: relativeAsset };
  }
  const stats = fs.statSync(assetPath);
  return {
    id: pluginId,
    available: true,
    displayName: manifest?.interface?.displayName || pluginId,
    version: manifest?.version || "unknown",
    sourceRoot: `CODEX_HOME/.../plugins/${pluginId}`,
    manifest: ".codex-plugin/plugin.json",
    asset: relativeAsset,
    assetPath,
    size: stats.size,
    hash: crypto.createHash("sha256").update(fs.readFileSync(assetPath)).digest("hex").toUpperCase(),
  };
}

function pluginAssetMiddleware() {
  return (req, res, next) => {
    const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
    if (!pathname.startsWith("/__concept/plugin-assets")) return next();
    if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
    const suffix = pathname.slice("/__concept/plugin-assets".length).replace(/^\//, "");
    if (!suffix) {
      const items = PLUGIN_IDS.map(readPluginAsset).filter(Boolean).map(({ assetPath, ...item }) => item);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ readOnly: true, items }));
      return;
    }
    const item = readPluginAsset(decodeURIComponent(suffix));
    if (!item?.available || !item.assetPath) { res.statusCode = 404; res.end(); return; }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Plugin-Asset-Source", `${item.sourceRoot}/${item.asset}`);
    fs.createReadStream(item.assetPath).pipe(res);
  };
}

export default defineConfig({
  // Electron loads the production entry with loadFile(file://...), so every
  // emitted asset reference must remain relative to dist/index.html.
  base: "./",
  plugins: [{
    name: "concept-plugin-asset-readonly",
    configureServer(server) { server.middlewares.use(pluginAssetMiddleware()); },
  }, react()],
  server: {
    host: "127.0.0.1",
    port: 41740,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 41741,
    strictPort: true,
  },
});
