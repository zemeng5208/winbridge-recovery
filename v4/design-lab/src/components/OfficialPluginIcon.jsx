import { useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

const PLUGIN_ICON_IDS = new Set(["browser", "chrome", "computer-use"]);

const runtimeAssetRequests = new WeakMap();

function loadRuntimeAssets(bridge) {
  if (!bridge || typeof bridge.getPluginAssets !== "function") return Promise.resolve(null);
  if (!runtimeAssetRequests.has(bridge)) {
    const request = Promise.resolve().then(() => bridge.getPluginAssets()).catch((error) => {
      runtimeAssetRequests.delete(bridge);
      throw error;
    });
    runtimeAssetRequests.set(bridge, request);
  }
  return runtimeAssetRequests.get(bridge);
}

export default function OfficialPluginIcon({ pluginId, color }) {
  const t = useI18n();
  const label = PLUGIN_ICON_IDS.has(pluginId) ? t(`plugin.icon.${pluginId}`) : null;
  const [asset, setAsset] = useState(null);
  const runtimeMode = Boolean(window.winBridgeApi) || new URLSearchParams(window.location.search).has("runtime");
  const runtimeAssetSource = runtimeMode;

  useEffect(() => {
    let cancelled = false;
    const source = runtimeAssetSource
      ? loadRuntimeAssets(window.winBridgeApi)
      : fetch("/__concept/plugin-assets", { cache: "no-store" }).then((response) => response.ok ? response.json() : null);
    source
      .then((payload) => {
        const items = payload?.readOnly === true && Array.isArray(payload.items) ? payload.items : [];
        if (!cancelled) setAsset(items.find((item) => item.id === pluginId) ?? null);
      })
      .catch(() => { if (!cancelled) setAsset(null); });
    return () => { cancelled = true; };
  }, [pluginId, runtimeAssetSource]);

  const runtimeDataUrl = typeof asset?.dataUrl === "string" && /^data:image\/(png|webp|jpeg);base64,/.test(asset.dataUrl)
    ? asset.dataUrl
    : null;
  const available = runtimeAssetSource
    ? Boolean(asset?.available === true && runtimeDataUrl)
    : Boolean(asset?.available === true);
  if (!available) {
    return <span className="official-plugin-icon is-placeholder" style={{ color }} aria-label={t("plugin.icon.unavailable", { label: label || t("plugin.icon.fallback") })}><Icon name="spark" size={17} /></span>;
  }
  const src = runtimeAssetSource ? runtimeDataUrl : `/__concept/plugin-assets/${encodeURIComponent(pluginId)}`;
  const detail = asset.version ? ` · ${asset.version}` : "";
  return <span className="official-plugin-icon" style={{ "--plugin-icon-color": color }} title={`${label || t("plugin.icon.officialFallback")}${detail}`}><img src={src} alt="" /></span>;
}
