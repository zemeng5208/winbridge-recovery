import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const designLabRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Minimal browser globals the components read while rendering. Effects do not
// run during server rendering, so no bridge, timer, or storage work happens.
export function installBrowserStubs({ languages = ["en-US"] } = {}) {
  const storage = new Map();
  globalThis.window = {
    location: { search: "" },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
  };
  globalThis.document = { body: {}, documentElement: {} };
  Object.defineProperty(globalThis, "navigator", { value: { language: languages[0], languages }, configurable: true });
}

/**
 * Loads design-lab modules through Vite's SSR pipeline without the project's
 * vite.config.js (whose dev middleware reads the local Codex install), and
 * renders portals inline so dialogs can be asserted as plain markup.
 */
export async function createRenderer() {
  const server = await createServer({
    configFile: false,
    root: designLabRoot,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [react()],
    resolve: { alias: [{ find: /^react-dom$/, replacement: path.join(designLabRoot, "tests", "helpers", "inline-portal.mjs") }] },
  });
  const load = (modulePath) => server.ssrLoadModule(modulePath);
  const { I18nProvider } = await load("/src/i18n/I18nProvider.jsx");
  const render = (preference, element) => renderToStaticMarkup(createElement(I18nProvider, { preference }, element));
  return { load, render, close: () => server.close() };
}

/** Text content of server-rendered markup, plus attribute values users perceive (labels, titles, placeholders). */
export function visibleText(markup) {
  const attributes = [...markup.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((match) => match[1]);
  const text = markup.replace(/<[^>]+>/g, " ");
  return [text, ...attributes].join(" ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
