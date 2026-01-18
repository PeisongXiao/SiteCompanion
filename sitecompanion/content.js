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

function createToolbar(shortcuts, position = "bottom-right") {
  let toolbar = document.getElementById("sitecompanion-toolbar");
  if (toolbar) toolbar.remove();

  toolbar = document.createElement("div");
  toolbar.id = "sitecompanion-toolbar";
  
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
    background: #fff7ec;
    border: 1px solid #e4d6c5;
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    z-index: 999999;
    display: flex;
    gap: 8px;
    font-family: system-ui, sans-serif;
  `;

  if (!shortcuts || !shortcuts.length) {
    const label = document.createElement("span");
    label.textContent = "SiteCompanion";
    label.style.fontSize = "12px";
    label.style.color = "#6b5f55";
    toolbar.appendChild(label);
  } else {
    for (const shortcut of shortcuts) {
      const btn = document.createElement("button");
      btn.textContent = shortcut.name;
      btn.style.cssText = `
        padding: 6px 12px;
        background: #b14d2b;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
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



async function refreshToolbar() {
  let {
    sites = [],
    workspaces = [],
    shortcuts = [],
    presets = [],
    toolbarPosition = "bottom-right"
  } = await chrome.storage.local.get([
    "sites",
    "workspaces",
    "shortcuts",
    "presets",
    "toolbarPosition"
  ]);
  const currentUrl = window.location.href;
  const site = sites.find(s => matchUrl(currentUrl, s.urlPattern));
  
  if (site) {
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
    createToolbar(siteShortcuts, resolvedPosition);
  }
}



const observer = new MutationObserver(() => {

  // refreshToolbar(); // Debounce this?

});



// observer.observe(document.documentElement, { childList: true, subtree: true });

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
