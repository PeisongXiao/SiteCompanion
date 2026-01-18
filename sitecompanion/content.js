function findMinimumScope(text) {
  if (!text) return null;
  const normalized = text.trim();
  if (!normalized) return null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (node.innerText.includes(normalized)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    }
  });

  let deepest = null;
  let node = walker.nextNode();
  while (node) {
    deepest = node;
    node = walker.nextNode();
  }

  return deepest;
}

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
}

function resolveScopedItems(parentItems, localItems, disabledNames) {
  const parent = Array.isArray(parentItems) ? parentItems : [];
  const local = Array.isArray(localItems) ? localItems : [];
  const disabledSet = new Set(
    (disabledNames || []).map((name) => normalizeName(name)).filter(Boolean)
  );
  const localNameSet = new Set(
    local.map((item) => normalizeName(item.name)).filter(Boolean)
  );
  const inherited = parent.filter((item) => {
    if (item?.enabled === false) return false;
    const key = normalizeName(item?.name);
    if (!key) return false;
    if (localNameSet.has(key)) return false;
    if (disabledSet.has(key)) return false;
    return true;
  });
  const localEnabled = local.filter((item) => item?.enabled !== false);
  return [...inherited, ...localEnabled];
}

function resolveThemeValue(globalTheme, workspace, site) {
  const siteTheme = site?.theme;
  if (siteTheme && siteTheme !== "inherit") return siteTheme;
  const workspaceTheme = workspace?.theme;
  if (workspaceTheme && workspaceTheme !== "inherit") return workspaceTheme;
  return globalTheme || "system";
}

function resolveThemeMode(theme) {
  if (theme === "dark" || theme === "light") return theme;
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function getToolbarThemeTokens(mode) {
  if (mode === "dark") {
    return {
      ink: "#abb2bf",
      muted: "#8b93a5",
      accent: "#61afef",
      accentDeep: "#56b6c2",
      panel: "#2f343f",
      border: "#3e4451",
      glow: "rgba(97, 175, 239, 0.2)",
      shadow: "rgba(0, 0, 0, 0.35)"
    };
  }
  return {
    ink: "#1f1a17",
    muted: "#6b5f55",
    accent: "#b14d2b",
    accentDeep: "#7d321b",
    panel: "#fff7ec",
    border: "#e4d6c5",
    glow: "rgba(177, 77, 43, 0.18)",
    shadow: "rgba(122, 80, 47, 0.12)"
  };
}

function createToolbar(shortcuts, position = "bottom-right", themeMode = "light") {
  let toolbar = document.getElementById("sitecompanion-toolbar");
  if (toolbar) toolbar.remove();

  toolbar = document.createElement("div");
  toolbar.id = "sitecompanion-toolbar";

  const tokens = getToolbarThemeTokens(themeMode);
  
  let posStyle = "";
  switch (position) {
    case "top-left":
      posStyle = "top: 20px; left: 20px;";
      break;
    case "top-right":
      posStyle = "top: 20px; right: 20px;";
      break;
    case "bottom-left":
      posStyle = "bottom: 20px; left: 20px;";
      break;
    case "bottom-center":
      posStyle = "bottom: 20px; left: 50%; transform: translateX(-50%);";
      break;
    case "bottom-right":
    default:
      posStyle = "bottom: 20px; right: 20px;";
      break;
  }

  toolbar.style.cssText = `
    position: fixed;
    ${posStyle}
    background: ${tokens.panel};
    border: 1px solid ${tokens.border};
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 12px 30px ${tokens.shadow};
    z-index: 2147483647;
    display: flex;
    gap: 8px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: ${tokens.ink};
  `;

  if (!shortcuts || !shortcuts.length) {
    const label = document.createElement("span");
    label.textContent = "SiteCompanion";
    label.style.fontSize = "12px";
    label.style.color = tokens.muted;
    toolbar.appendChild(label);
  } else {
    for (const shortcut of shortcuts) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = shortcut.name;
      btn.style.cssText = `
        padding: 6px 12px;
        background: ${tokens.accent};
        color: #fff9f3;
        border: 1px solid ${tokens.accent};
        border-radius: 10px;
        cursor: pointer;
        font-size: 12px;
        box-shadow: 0 8px 20px ${tokens.glow};
      `;
      btn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "RUN_SHORTCUT", shortcutId: shortcut.id });
      });
      toolbar.appendChild(btn);
    }
  }

  document.body.appendChild(toolbar);
}



function matchUrl(url, pattern) {
  if (!pattern) return false;
  let regex = null;
  try {
    regex = new RegExp("^" + pattern.split("*").join(".*") + "$");
  } catch {
    return false;
  }
  try {
    const urlObj = new URL(url);
    const target = urlObj.hostname + urlObj.pathname;
    return regex.test(target);
  } catch {
    return false;
  }
}



let suppressObserver = false;

async function refreshToolbar() {
  suppressObserver = true;
  let {
    sites = [],
    workspaces = [],
    shortcuts = [],
    presets = [],
    toolbarPosition = "bottom-right",
    theme = "system"
  } = await chrome.storage.local.get([
    "sites",
    "workspaces",
    "shortcuts",
    "presets",
    "toolbarPosition",
    "theme"
  ]);
  const currentUrl = window.location.href;
  const site = sites.find(s => matchUrl(currentUrl, s.urlPattern));
  
  try {
    if (!site) {
      const toolbar = document.getElementById("sitecompanion-toolbar");
      if (toolbar) toolbar.remove();
      return;
    }

    if (!shortcuts.length && Array.isArray(presets) && presets.length) {
      shortcuts = presets;
      await chrome.storage.local.set({ shortcuts });
      await chrome.storage.local.remove("presets");
    }
    const workspace =
      workspaces.find((ws) => ws.id === site.workspaceId) || null;
    const workspaceDisabled = workspace?.disabledInherited?.shortcuts || [];
    const siteDisabled = site?.disabledInherited?.shortcuts || [];
    const workspaceShortcuts = resolveScopedItems(
      shortcuts,
      workspace?.shortcuts || [],
      workspaceDisabled
    );
    const siteShortcuts = resolveScopedItems(
      workspaceShortcuts,
      site.shortcuts || [],
      siteDisabled
    );
    const resolvedPosition =
      site.toolbarPosition && site.toolbarPosition !== "inherit"
        ? site.toolbarPosition
        : workspace?.toolbarPosition && workspace.toolbarPosition !== "inherit"
          ? workspace.toolbarPosition
          : toolbarPosition;
    const resolvedTheme = resolveThemeValue(theme, workspace, site);
    const themeMode = resolveThemeMode(resolvedTheme);
    createToolbar(siteShortcuts, resolvedPosition, themeMode);
  } finally {
    window.setTimeout(() => {
      suppressObserver = false;
    }, 0);
  }
}



let refreshTimer = null;
function scheduleToolbarRefresh() {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void refreshToolbar();
  }, 200);
}

const observer = new MutationObserver(() => {
  if (suppressObserver) return;
  scheduleToolbarRefresh();
});

observer.observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "FIND_SCOPE") {
    const node = findMinimumScope(message.text || "");
    if (!node) {
      sendResponse({ ok: false, error: "Scope not found." });
      return;
    }
    sendResponse({ ok: true, extracted: node.innerText || "" });
    return;
  }
  if (message.type === "EXTRACT_FULL") {
    const extracted = document.body?.innerText || "";
    sendResponse({ ok: true, extracted });
  }
});

try {
  refreshToolbar();
} catch (error) {
  console.warn("SiteCompanion toolbar failed:", error);
}
