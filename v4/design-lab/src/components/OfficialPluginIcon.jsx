import { useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";

const labels = {
  browser: "Browser 官方图标",
  chrome: "Chrome 官方图标",
  "computer-use": "Computer Use 官方图标",
};

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
    return <span className="official-plugin-icon is-placeholder" style={{ color }} aria-label={`${labels[pluginId] || "插件图标"}暂不可用`}><Icon name="spark" size={17} /></span>;
  }
  const src = runtimeAssetSource ? runtimeDataUrl : `/__concept/plugin-assets/${encodeURIComponent(pluginId)}`;
  const detail = asset.version ? ` · ${asset.version}` : "";
  return <span className="official-plugin-icon" style={{ "--plugin-icon-color": color }} title={`${labels[pluginId] || "官方插件图标"}${detail}`}><img src={src} alt="" /></span>;
}
