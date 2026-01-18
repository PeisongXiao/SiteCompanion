function findMinimumScope(text) {
  if (!text) return null;
  const normalized = normalizeWhitespace(text);
  if (!normalized) return null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      const nodeText = normalizeWhitespace(node.innerText);
      if (nodeText.includes(normalized)) {
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

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function escapeSelector(value) {
  if (window.CSS && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function buildClassSelector(className) {
  const parts = String(className || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.map((name) => `.${escapeSelector(name)}`).join("");
}

function inferCssAllTarget(node) {
  if (!node || node.nodeType !== 1) return null;
  const classList = node.classList ? Array.from(node.classList) : [];
  let best = null;
  for (const className of classList) {
    if (!className) continue;
    const matches = Array.from(document.getElementsByClassName(className));
    const index = matches.indexOf(node);
    if (index < 0) continue;
    if (!best || matches.length < best.matches.length) {
      best = { className, index, matches };
    }
  }
  if (best) {
    return {
      kind: "cssAll",
      selector: `.${escapeSelector(best.className)}`,
      index: best.index
    };
  }
  const className =
    typeof node.className === "string" ? node.className.trim() : "";
  if (!className) return null;
  const selector = buildClassSelector(className);
  if (!selector) return null;
  const matches = Array.from(document.getElementsByClassName(className));
  const index = matches.indexOf(node);
  if (index < 0) return null;
  return { kind: "cssAll", selector, index };
}

function inferCssTarget(node) {
  if (!node || node.nodeType !== 1) return null;
  const selector = buildSelector(node);
  if (!selector) return null;
  return { kind: "css", selector };
}

function inferAnchoredCssTarget(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  return {
    kind: "anchoredCss",
    anchor: { kind: "textScope", text: trimmed },
    selector: ":scope"
  };
}

function inferScopeTargets(text, node) {
  const candidates = [];
  const cssAll = inferCssAllTarget(node);
  if (cssAll) candidates.push(cssAll);
  const css = inferCssTarget(node);
  if (css) candidates.push(css);
  const anchoredCss = inferAnchoredCssTarget(text);
  if (anchoredCss) candidates.push(anchoredCss);
  const trimmed = String(text || "").trim();
  if (trimmed) {
    candidates.push({ kind: "textScope", text: trimmed });
  }
  return candidates;
}

function selectInferredTarget(text, node) {
  const candidates = inferScopeTargets(text, node);
  for (const candidate of candidates) {
    const resolved = resolveExtractionTarget(candidate);
    if (!resolved.error && resolved.node === node) {
      return candidate;
    }
  }
  return null;
}

function findBestScopeCandidate(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (node.innerText.includes(normalized)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    }
  });

  let best = null;
  let node = walker.nextNode();
  while (node) {
    if (node !== document.body) {
      const cssAll = inferCssAllTarget(node);
      if (cssAll) {
        const resolved = resolveExtractionTarget(cssAll);
        if (!resolved.error && resolved.node === node) {
          const matchCount = document.querySelectorAll(cssAll.selector).length;
          if (!best || matchCount < best.matchCount) {
            best = { node, target: cssAll, matchCount };
          }
        }
      }
    }
    node = walker.nextNode();
  }
  return best;
}

function parseLegacySelectorString(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return { error: "Missing extraction target." };
  }
  const classMatch = trimmed.match(
    /^(?:document\.)?getElementsByClassName\(\s*(['"])(.+?)\1\s*\)\s*\[\s*(\d+)\s*\]\s*(?:\.innerText\s*)?;?$/i
  );
  if (classMatch) {
    const selector = buildClassSelector(classMatch[2]);
    if (!selector) {
      return { error: "Missing extraction target." };
    }
    const index = Number.parseInt(classMatch[3], 10);
    if (!Number.isInteger(index) || index < 0) {
      return { error: "Invalid index." };
    }
    return {
      target: { kind: "cssAll", selector, index }
    };
  }
  if (trimmed.includes("getElementsByClassName")) {
    return { error: "Unsupported extraction target." };
  }
  return null;
}

function normalizeExtractionTarget(input) {
  if (!input) {
    return { error: "Missing extraction target." };
  }
  if (typeof input === "string") {
    const parsed = parseLegacySelectorString(input);
    if (parsed) {
      if (parsed.error) return { error: parsed.error };
      return { target: parsed.target };
    }
    const selector = input.trim();
    if (!selector) {
      return { error: "Missing extraction target." };
    }
    return { target: { kind: "css", selector } };
  }
  if (!isPlainObject(input) || typeof input.kind !== "string") {
    return { error: "Missing extraction target." };
  }
  return { target: input };
}

function resolveExtractionTarget(target) {
  if (!target || typeof target !== "object") {
    return { error: "Missing extraction target." };
  }

  if (target.kind === "xpath") {
    return { error: "XPath not supported." };
  }

  if (target.kind === "textScope") {
    if (typeof target.text !== "string" || !target.text.trim()) {
      return { error: "Missing extraction target." };
    }
    const node = findMinimumScope(target.text);
    if (!node) {
      return { error: "Scope not found." };
    }
    return { node };
  }

  if (target.kind === "anchoredCss") {
    const anchor = target.anchor;
    if (
      !anchor ||
      anchor.kind !== "textScope" ||
      typeof anchor.text !== "string" ||
      !anchor.text.trim()
    ) {
      return { error: "Missing extraction target." };
    }
    const anchorNode = findMinimumScope(anchor.text);
    if (!anchorNode) {
      return { error: "Anchor scope not found." };
    }
    const selector = target.selector || "";
    if (!selector.trim()) {
      return { error: "Missing extraction target." };
    }
    let node = null;
    try {
      node = anchorNode.querySelector(selector);
    } catch {
      return { error: "Invalid selector." };
    }
    if (!node) {
      return { error: "Selector matched no elements." };
    }
    return { node };
  }

  if (target.kind === "css" || target.kind === "cssAll") {
    const selector = target.selector || "";
    if (!selector) {
      return { error: "Missing extraction target." };
    }
    if (target.kind === "css") {
      let node = null;
      try {
        node = document.querySelector(selector);
      } catch {
        return { error: "Invalid selector." };
      }
      if (!node) {
        return { error: "Selector matched no elements." };
      }
      return { node };
    }
    const index = target.index;
    if (!Number.isInteger(index) || index < 0) {
      return { error: "Invalid index." };
    }
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(selector));
    } catch {
      return { error: "Invalid selector." };
    }
    if (!nodes.length) {
      return { error: "Selector matched no elements." };
    }
    if (index >= nodes.length) {
      return { error: "Index out of bounds." };
    }
    return { node: nodes[index] };
  }

  return { error: "Unsupported extraction target." };
}

function buildSelector(node) {
  if (!node || node.nodeType !== 1) return "body";
  if (node === document.body) return "body";
  const parts = [];
  let current = node;
  while (current && current.nodeType === 1 && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`${tag}#${escapeSelector(current.id)}`);
      break;
    }
    let selector = tag;
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(selector);
    current = parent;
  }
  if (current === document.body) {
    parts.unshift("body");
  }
  const selector = parts.join(" > ");
  return selector || "body";
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
        chrome.runtime.sendMessage(
          { type: "RUN_SHORTCUT", shortcutId: shortcut.id },
          () => {
            void chrome.runtime.lastError;
          }
        );
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
  try {
    if (!chrome?.runtime?.id) return;
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
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("Extension context invalidated")) {
      return;
    }
    console.warn("SiteCompanion toolbar refresh failed:", error);
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
    refreshToolbar().catch((error) => {
      const message = String(error?.message || "");
      if (message.includes("Extension context invalidated")) {
        return;
      }
      console.warn("SiteCompanion toolbar refresh failed:", error);
    });
  }, 200);
}

const observer = new MutationObserver(() => {
  if (suppressObserver) return;
  scheduleToolbarRefresh();
});

observer.observe(document.documentElement, { childList: true, subtree: true });

chrome.storage.onChanged.addListener(() => {
  if (suppressObserver) return;
  scheduleToolbarRefresh();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "FIND_SCOPE") {
    const rawText = message.text || "";
    const baseTarget = { kind: "textScope", text: rawText };
    const resolved = resolveExtractionTarget(baseTarget);
    if (resolved.error) {
      sendResponse({ ok: false, error: resolved.error });
      return;
    }
    let effectiveNode = resolved.node;
    let responseTarget = selectInferredTarget(rawText, resolved.node) || baseTarget;
    if (resolved.node === document.body) {
      const scoped = findBestScopeCandidate(rawText);
      if (scoped) {
        effectiveNode = scoped.node;
        responseTarget = scoped.target;
      } else if (
        responseTarget.kind === "css" &&
        responseTarget.selector === "body"
      ) {
        responseTarget = baseTarget;
      }
    }
    sendResponse({
      ok: true,
      extracted: effectiveNode.innerText || "",
      target: responseTarget
    });
    return;
  }
  if (message.type === "EXTRACT_BY_SELECTOR") {
    const { target, error } = normalizeExtractionTarget(
      message.target ?? message.selector
    );
    if (error) {
      sendResponse({ ok: false, error });
      return;
    }
    const resolved = resolveExtractionTarget(target);
    if (resolved.error) {
      sendResponse({ ok: false, error: resolved.error });
      return;
    }
    sendResponse({ ok: true, extracted: resolved.node.innerText || "", target });
    return;
  }
  if (message.type === "EXTRACT_FULL") {
    const target = { kind: "css", selector: "body" };
    const resolved = resolveExtractionTarget(target);
    if (resolved.error) {
      const extracted = document.body?.innerText || "";
      sendResponse({ ok: true, extracted, target });
      return;
    }
    sendResponse({ ok: true, extracted: resolved.node.innerText || "", target });
  }
});

try {
  refreshToolbar();
} catch (error) {
  console.warn("SiteCompanion toolbar failed:", error);
}
