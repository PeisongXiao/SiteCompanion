const saveBtnSidebar = document.getElementById("saveBtnSidebar");
const addApiConfigBtn = document.getElementById("addApiConfigBtn");
const apiConfigsContainer = document.getElementById("apiConfigs");
const addApiKeyBtn = document.getElementById("addApiKeyBtn");
const apiKeysContainer = document.getElementById("apiKeys");
const addEnvConfigBtn = document.getElementById("addEnvConfigBtn");
const envConfigsContainer = document.getElementById("envConfigs");
const addTaskBtn = document.getElementById("addTaskBtn");
const tasksContainer = document.getElementById("tasks");
const addProfileBtn = document.getElementById("addProfileBtn");
const profilesContainer = document.getElementById("profiles");
const addWorkspaceBtn = document.getElementById("addWorkspaceBtn");
const workspacesContainer = document.getElementById("workspaces");
const addSiteBtn = document.getElementById("addSiteBtn");
const sitesContainer = document.getElementById("sites");
const addShortcutBtn = document.getElementById("addShortcutBtn");
const shortcutsContainer = document.getElementById("shortcuts");
const statusSidebarEl = document.getElementById("statusSidebar");
const sidebarErrorsEl = document.getElementById("sidebarErrors");
const themeSelect = document.getElementById("themeSelect");
const toolbarPositionSelect = document.getElementById("toolbarPositionSelect");
const toolbarAutoHide = document.getElementById("toolbarAutoHide");
const alwaysShowOutput = document.getElementById("alwaysShowOutput");
const globalSitesContainer = document.getElementById("globalSites");
const toc = document.querySelector(".toc");
const tocResizer = document.getElementById("tocResizer");
const settingsLayout = document.querySelector(".settings-layout");
let initialSiteIds = new Set();
let lastSavedSnapshot = "";
let hasUnsavedChanges = false;
let dirtyCheckFrame = null;
let statusClearTimer = null;
let suppressDirtyTracking = true;
let dirtyObserver = null;
let tocTargets = [];
let tocHighlightFrame = null;
let activeTocLink = null;
let tocTargetMap = new WeakMap();

const OPENAI_DEFAULTS = {
  apiBaseUrl: "https://api.openai.com/v1"
};
const DEFAULT_MODEL = "gpt-5.2";
const DEFAULT_SYSTEM_PROMPT = "";
const SIDEBAR_WIDTH_KEY = "sidebarWidth";

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

function parseLegacyDomSelectorString(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return null;
  const classMatch = trimmed.match(
    /^(?:document\.)?getElementsByClassName\(\s*(['"])(.+?)\1\s*\)\s*\[\s*(\d+)\s*\]\s*(?:\.innerText\s*)?;?$/i
  );
  if (classMatch) {
    const selector = buildClassSelector(classMatch[2]);
    if (!selector) {
      return { target: null, error: "Missing extraction target." };
    }
    const index = Number.parseInt(classMatch[3], 10);
    if (!Number.isInteger(index) || index < 0) {
      return { target: null, error: "Invalid index." };
    }
    return { target: { kind: "cssAll", selector, index }, error: null };
  }
  if (trimmed.includes("getElementsByClassName")) {
    return { target: null, error: "Unsupported extraction target." };
  }
  return null;
}

function parseLooseJsonInput(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed.startsWith("{")) return null;
  let normalized = trimmed;
  normalized = normalized.replace(
    /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,
    '$1"$2"$3'
  );
  normalized = normalized.replace(
    /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
    (_match, value) => `"${value.replace(/"/g, '\\"')}"`
  );
  return normalized;
}

function normalizeExtractionTargetValue(value) {
  if (typeof value === "string") {
    const legacy = parseLegacyDomSelectorString(value);
    if (legacy) {
      return legacy.target;
    }
    const trimmed = value.trim();
    return trimmed ? { kind: "css", selector: trimmed } : null;
  }
  if (isPlainObject(value) && typeof value.kind === "string") {
    return value;
  }
  return null;
}

function serializeExtractionTarget(target) {
  if (!target) return "";
  if (typeof target === "string") {
    const legacy = parseLegacyDomSelectorString(target);
    if (legacy?.target) return JSON.stringify(legacy.target);
    const trimmed = target.trim();
    if (!trimmed) return "";
    return JSON.stringify({ kind: "css", selector: trimmed });
  }
  if (isPlainObject(target) && typeof target.kind === "string") {
    return JSON.stringify(target);
  }
  return "";
}

function validateExtractionTarget(target) {
  if (!target || typeof target !== "object") {
    return "Missing extraction target.";
  }
  if (target.kind === "xpath") {
    return "XPath not supported.";
  }
  if (target.kind === "css") {
    return typeof target.selector === "string" && target.selector.trim()
      ? null
      : "Missing extraction target.";
  }
  if (target.kind === "cssAll") {
    if (typeof target.selector !== "string" || !target.selector.trim()) {
      return "Missing extraction target.";
    }
    if (!Number.isInteger(target.index) || target.index < 0) {
      return "Invalid index.";
    }
    return null;
  }
  if (target.kind === "textScope") {
    return typeof target.text === "string" && target.text.trim()
      ? null
      : "Missing extraction target.";
  }
  if (target.kind === "anchoredCss") {
    const anchor = target.anchor;
    if (!anchor || anchor.kind !== "textScope") {
      return "Invalid anchor target.";
    }
    if (typeof anchor.text !== "string" || !anchor.text.trim()) {
      return "Missing extraction target.";
    }
    if (typeof target.selector !== "string" || !target.selector.trim()) {
      return "Missing extraction target.";
    }
    return null;
  }
  return "Unsupported extraction target.";
}

function parseExtractionTargetInput(rawValue) {
  const trimmed = (rawValue || "").trim();
  if (!trimmed) {
    return { target: null, error: "Missing extraction target." };
  }
  const legacy = parseLegacyDomSelectorString(trimmed);
  if (legacy) {
    if (legacy.error) {
      return { target: null, error: legacy.error };
    }
    const error = validateExtractionTarget(legacy.target);
    return { target: legacy.target, error };
  }
  if (trimmed.startsWith("textScope:")) {
    const text = trimmed.slice("textScope:".length).trim();
    const target = { kind: "textScope", text };
    const error = validateExtractionTarget(target);
    return { target, error };
  }
  let target = null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      target = normalizeExtractionTargetValue(parsed);
    } catch {
      const normalized = parseLooseJsonInput(trimmed);
      if (!normalized) {
        return { target: null, error: "Invalid extraction target JSON." };
      }
      try {
        const parsed = JSON.parse(normalized);
        target = normalizeExtractionTargetValue(parsed);
      } catch {
        return { target: null, error: "Invalid extraction target JSON." };
      }
    }
  } else {
    target = { kind: "css", selector: trimmed };
  }
  if (!target) {
    return { target: null, error: "Invalid extraction target." };
  }
  const error = validateExtractionTarget(target);
  return { target, error };
}

function normalizeStoredExtractionTarget(site) {
  const normalized = normalizeExtractionTargetValue(site?.extractTarget);
  if (normalized) {
    const changed = typeof site?.extractTarget === "string";
    return { target: normalized, changed };
  }
  if (typeof site?.extractSelector === "string" && site.extractSelector.trim()) {
    const legacy = parseLegacyDomSelectorString(site.extractSelector);
    if (legacy?.target) {
      return { target: legacy.target, changed: true };
    }
    return {
      target: { kind: "css", selector: site.extractSelector.trim() },
      changed: true
    };
  }
  return { target: null, changed: false };
}

function getSidebarWidthLimits() {
  const min = 160;
  const max = Math.max(min, Math.min(360, window.innerWidth - 240));
  return { min, max };
}

function applySidebarWidth(width) {
  if (!toc) return;
  const { min, max } = getSidebarWidthLimits();
  if (!Number.isFinite(width)) {
    toc.style.width = "";
    toc.style.flex = "";
    return;
  }
  const clamped = Math.min(Math.max(width, min), max);
  toc.style.width = `${clamped}px`;
  toc.style.flex = `0 0 ${clamped}px`;
}

function initSidebarResize() {
  if (!toc || !tocResizer) return;
  let startX = 0;
  let startWidth = 0;

  const onMouseMove = (event) => {
    const delta = event.clientX - startX;
    applySidebarWidth(startWidth + delta);
  };

  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.classList.remove("is-resizing");
    const width = toc.getBoundingClientRect().width;
    void chrome.storage.local.set({ [SIDEBAR_WIDTH_KEY]: Math.round(width) });
  };

  tocResizer.addEventListener("mousedown", (event) => {
    event.preventDefault();
    startX = event.clientX;
    startWidth = toc.getBoundingClientRect().width;
    document.body.classList.add("is-resizing");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

const SETTINGS_VIEW_STATE_KEY = "settingsViewState";
let settingsViewState = { open: {}, scrollTop: 0 };
let settingsViewStateTimer = null;

async function loadSettingsViewState() {
  const stored = await getStorage([SETTINGS_VIEW_STATE_KEY]);
  const state = stored[SETTINGS_VIEW_STATE_KEY];
  if (!state || typeof state !== "object") return;
  const open =
    state.open && typeof state.open === "object" ? state.open : {};
  settingsViewState = {
    open,
    scrollTop: Number.isFinite(state.scrollTop) ? state.scrollTop : 0
  };
}

function scheduleSettingsViewStateSave() {
  if (settingsViewStateTimer) clearTimeout(settingsViewStateTimer);
  settingsViewStateTimer = setTimeout(() => {
    settingsViewStateTimer = null;
    void chrome.storage.local.set({
      [SETTINGS_VIEW_STATE_KEY]: settingsViewState
    });
  }, 200);
}

function getDetailStateKey(details) {
  return details?.dataset?.stateKey || details?.id || "";
}

function openDetails(details) {
  if (!details) return;
  details.open = true;
  const key = getDetailStateKey(details);
  if (!key) return;
  settingsViewState.open[key] = true;
  scheduleSettingsViewStateSave();
}

function centerCardInView(card) {
  if (!card || typeof card.getBoundingClientRect !== "function") return;
  requestAnimationFrame(() => {
    if (!card.isConnected) return;
    scrollCardToCenter(card);
  });
}

function centerCardInViewAfterLayout(card, attempts = 4) {
  if (!card || typeof card.getBoundingClientRect !== "function") return;
  if (attempts <= 0) {
    centerCardInView(card);
    return;
  }
  requestAnimationFrame(() => {
    if (!card.isConnected) return;
    const rect = card.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) {
      centerCardInViewAfterLayout(card, attempts - 1);
      return;
    }
    centerCardInView(card);
  });
}

function registerDetail(details, defaultOpen) {
  if (!details || details.dataset.stateReady === "true") return;
  const key = getDetailStateKey(details);
  if (!key) return;
  details.dataset.stateReady = "true";
  const storedOpen = settingsViewState.open?.[key];
  if (typeof storedOpen === "boolean") {
    details.open = storedOpen;
  } else if (typeof defaultOpen === "boolean") {
    details.open = defaultOpen;
  }
  details.addEventListener("toggle", () => {
    settingsViewState.open[key] = details.open;
    if (!details.open) {
      collapseChildDetails(details);
    }
    scheduleSettingsViewStateSave();
    scheduleTocHighlight();
  });
}

function collapseChildDetails(parent) {
  if (!parent) return;
  const children = parent.querySelectorAll("details");
  children.forEach((child) => {
    if (child.open) {
      child.open = false;
      const childKey = getDetailStateKey(child);
      if (childKey) {
        settingsViewState.open[childKey] = false;
      }
    }
  });
}

function registerAllDetails() {
  const detailsList = document.querySelectorAll("details");
  detailsList.forEach((details) => {
    if (!details.dataset.stateKey && details.id) {
      details.dataset.stateKey = details.id;
    }
    registerDetail(details, details.open);
  });
}

function restoreScrollPosition() {
  if (!Number.isFinite(settingsViewState.scrollTop)) return;
  requestAnimationFrame(() => {
    window.scrollTo(0, settingsViewState.scrollTop || 0);
  });
}

function handleSettingsScroll() {
  settingsViewState.scrollTop = window.scrollY || 0;
  scheduleSettingsViewStateSave();
  scheduleTocHighlight();
}

function setStatus(message, options = {}) {
  if (!statusSidebarEl) return;
  const { tone = "normal", persist = false, restoreDirty = true } = options;
  if (statusClearTimer) {
    clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }
  statusSidebarEl.textContent = message;
  statusSidebarEl.classList.toggle("is-dirty", tone === "dirty");
  if (!message) return;
  if (persist) return;
  statusClearTimer = window.setTimeout(() => {
    statusClearTimer = null;
    if (statusSidebarEl?.textContent !== message) return;
    if (hasUnsavedChanges && restoreDirty) {
      setStatus("Unsaved changes.", {
        tone: "dirty",
        persist: true,
        restoreDirty: false
      });
      return;
    }
    statusSidebarEl.textContent = "";
    statusSidebarEl.classList.remove("is-dirty");
  }, 2000);
}

function buildSettingsSnapshot() {
  return JSON.stringify({
    apiKeys: collectApiKeys(),
    apiConfigs: collectApiConfigs(),
    envConfigs: collectEnvConfigs(),
    profiles: collectProfiles(),
    tasks: collectTasks(),
    shortcuts: collectShortcuts(),
    workspaces: collectWorkspaces(),
    sites: collectSites(),
    theme: themeSelect?.value || "system",
    toolbarPosition: toolbarPositionSelect
      ? toolbarPositionSelect.value
      : "bottom-right",
    toolbarAutoHide: toolbarAutoHide ? toolbarAutoHide.checked : true,
    alwaysShowOutput: alwaysShowOutput ? alwaysShowOutput.checked : false
  });
}

function setDirtyState(isDirty) {
  if (hasUnsavedChanges === isDirty) return;
  hasUnsavedChanges = isDirty;
  if (hasUnsavedChanges) {
    setStatus("Unsaved changes.", {
      tone: "dirty",
      persist: true,
      restoreDirty: false
    });
    return;
  }
  if (statusSidebarEl?.classList.contains("is-dirty")) {
    setStatus("");
  }
}

function updateDirtyState() {
  if (!lastSavedSnapshot) {
    setDirtyState(false);
    return;
  }
  const snapshot = buildSettingsSnapshot();
  setDirtyState(snapshot !== lastSavedSnapshot);
}

function scheduleDirtyCheck() {
  if (suppressDirtyTracking) return;
  if (dirtyCheckFrame) return;
  dirtyCheckFrame = requestAnimationFrame(() => {
    dirtyCheckFrame = null;
    updateDirtyState();
  });
}

function captureSavedSnapshot() {
  lastSavedSnapshot = buildSettingsSnapshot();
  setDirtyState(false);
}

function initDirtyObserver() {
  if (!settingsLayout || dirtyObserver) return;
  dirtyObserver = new MutationObserver((mutations) => {
    if (suppressDirtyTracking) return;
    const hasChildChange = mutations.some(
      (mutation) => mutation.type === "childList"
    );
    if (hasChildChange) scheduleDirtyCheck();
  });
  dirtyObserver.observe(settingsLayout, { childList: true, subtree: true });
}

let sidebarErrorFrame = null;
function scheduleSidebarErrors() {
  if (!sidebarErrorsEl) return;
  if (sidebarErrorFrame) return;
  sidebarErrorFrame = requestAnimationFrame(() => {
    sidebarErrorFrame = null;
    updateSidebarErrors();
  });
}

function renderGlobalSitesList(sites) {
  if (!globalSitesContainer) return;
  globalSitesContainer.innerHTML = "";
  const globalSites = (sites || []).filter(
    (site) => (site.workspaceId || "global") === "global"
  );
  if (!globalSites.length) {
    const empty = document.createElement("div");
    empty.textContent = "No sites inherit from global.";
    empty.className = "hint";
    globalSitesContainer.appendChild(empty);
    return;
  }
  for (const site of globalSites) {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = site.name || site.urlPattern || "Untitled Site";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const card = document.querySelector(`.site-card[data-id="${site.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        openDetailsChain(document.getElementById("sites-panel"));
      }
    });
    globalSitesContainer.appendChild(link);
  }
}

function renderWorkspaceSitesList(list, workspaceId, sites) {
  if (!list) return;
  const ownedSites = (sites || []).filter(
    (site) => (site.workspaceId || "global") === workspaceId
  );
  list.innerHTML = "";
  if (!ownedSites.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No sites inherit from this workspace.";
    list.appendChild(empty);
    return;
  }
  for (const site of ownedSites) {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = site.name || site.urlPattern || "Untitled Site";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const siteCard = document.querySelector(
        `.site-card[data-id="${site.id}"]`
      );
      if (siteCard) {
        siteCard.scrollIntoView({ behavior: "smooth", block: "center" });
        openDetailsChain(document.getElementById("sites-panel"));
      }
    });
    list.appendChild(link);
  }
}

function applyTheme(theme) {
  const value = theme || "system";
  document.documentElement.dataset.theme = value;
}

function newTaskId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newApiKeyId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newApiConfigId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `config-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newEnvConfigId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `env-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newProfileId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `profile-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newWorkspaceId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `ws-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newSiteId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `site-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newShortcutId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `shortcut-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildChatUrlFromBase(baseUrl) {
  const trimmed = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function collectNames(container, selector) {
  if (!container) return [];
  return [...container.querySelectorAll(selector)]
    .map((input) => (input.value || "").trim())
    .filter(Boolean);
}

function buildUniqueDefaultName(names) {
  const lower = new Set(names.map((name) => name.toLowerCase()));
  if (!lower.has("default")) return "Default";
  let index = 2;
  while (lower.has(`default-${index}`)) {
    index += 1;
  }
  return `Default-${index}`;
}

function buildUniqueNumberedName(prefix, names) {
  const base = (prefix || "").trim() || "New";
  const lower = new Set(names.map((name) => name.toLowerCase()));
  let index = 1;
  let candidate = `${base}-${index}`;
  while (lower.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}

function ensureUniqueName(desired, existingNames) {
  const trimmed = (desired || "").trim();
  const lowerNames = existingNames.map((name) => name.toLowerCase());
  if (trimmed && !lowerNames.includes(trimmed.toLowerCase())) {
    return trimmed;
  }
  return buildUniqueDefaultName(existingNames);
}

function isEnabled(value) {
  return value !== false;
}

function populateSelect(select, items, emptyLabel) {
  const preferred = select.dataset.preferred || select.value;
  select.innerHTML = "";
  if (!items.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyLabel;
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name || "Default";
    select.appendChild(option);
  }

  if (preferred && items.some((item) => item.id === preferred)) {
    select.value = preferred;
  } else {
    select.value = items[0]?.id || "";
  }

  select.dataset.preferred = select.value;
}

function buildItemMap(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return map;
}

function mergeById(...lists) {
  const map = new Map();
  lists.flat().forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return [...map.values()];
}

function setupCardPanel(card, nameInput, fallbackTitle, options = {}) {
  const { subPanel = true } = options;
  card.open = false;
  card.classList.add("panel");
  if (subPanel) {
    card.classList.add("sub-panel");
  }
  card.classList.add("settings-card");
  const summary = document.createElement("summary");
  summary.className = "panel-summary card-summary";
  const row = document.createElement("div");
  row.className = "panel-summary-row";
  const summaryLeft = document.createElement("div");
  summaryLeft.className = "panel-summary-left";
  const summaryRight = document.createElement("div");
  summaryRight.className = "panel-summary-right";
  const rowTitle = document.createElement("span");
  rowTitle.className = "row-title";
  const title = document.createElement("span");
  title.className = "card-title";
  rowTitle.appendChild(title);
  summaryLeft.appendChild(rowTitle);
  row.appendChild(summaryLeft);
  row.appendChild(summaryRight);
  summary.appendChild(row);
  const body = document.createElement("div");
  body.className = "panel-body card-body";
  card.appendChild(summary);
  card.appendChild(body);

  summary.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      event.preventDefault();
    }
  });

  const updateTitle = () => {
    const text = (nameInput?.value || "").trim();
    title.textContent = text || fallbackTitle;
  };
  updateTitle();
  if (nameInput) {
    nameInput.addEventListener("input", updateTitle);
  }

  registerDetail(card, false);

  return { body, summaryLeft, summaryRight, updateTitle };
}

function buildEnabledToggleButton(enabledInput) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "enabled-toggle ghost";

  const updateState = () => {
    const enabled = enabledInput.checked;
    button.textContent = enabled ? "Enabled" : "Disabled";
    button.classList.toggle("accent", enabled);
    button.classList.toggle("ghost", !enabled);
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    enabledInput.checked = !enabledInput.checked;
    enabledInput.dispatchEvent(new Event("change", { bubbles: true }));
    updateState();
  });
  enabledInput.addEventListener("change", updateState);
  updateState();

  return button;
}

function populateSelectPreserving(select, items, emptyLabel, allItemsById) {
  const preferred = select.dataset.preferred || select.value;
  populateSelect(select, items, emptyLabel);
  if (!preferred) return;
  const hasPreferred = [...select.options].some(
    (option) => option.value === preferred
  );
  if (hasPreferred) return;
  const fallback = allItemsById?.get(preferred);
  if (!fallback) return;
  const option = document.createElement("option");
  option.value = preferred;
  option.textContent = `${fallback.name || "Unavailable"} (disabled)`;
  option.disabled = true;
  select.appendChild(option);
  select.value = preferred;
  select.dataset.preferred = preferred;
}

function normalizeConfigList(list) {
  return Array.isArray(list)
    ? list.map((item) => ({ ...item, enabled: item.enabled !== false }))
    : [];
}

const TEMPLATE_PLACEHOLDERS = [
  "SYSTEM_PROMPT_GOES_HERE",
  "PROMPT_GOES_HERE",
  "API_KEY_GOES_HERE",
  "MODEL_GOES_HERE",
  "API_BASE_URL_GOES_HERE"
].sort((a, b) => b.length - a.length);

function buildTemplateValidationSource(template) {
  let output = template || "";
  for (const token of TEMPLATE_PLACEHOLDERS) {
    output = output.split(`\"${token}\"`).join(JSON.stringify("PLACEHOLDER"));
    output = output.split(token).join("null");
  }
  return output;
}

function normalizeTemplateInput(template) {
  return (template || "")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[\u0000-\u001F]/g, (char) =>
      char === "\n" || char === "\r" || char === "\t" ? char : " "
    )
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");
}

function isValidTemplateJson(template) {
  if (!template) return false;
  const normalized = normalizeTemplateInput(template);
  try {
    JSON.parse(normalized);
    return true;
  } catch {
    // Fall through to placeholder-neutralized parsing.
  }
  try {
    JSON.parse(buildTemplateValidationSource(normalized));
    return true;
  } catch {
    return false;
  }
}

function normalizeDisabledInherited(source) {
  const data = source && typeof source === "object" ? source : {};
  return {
    envs: Array.isArray(data.envs) ? data.envs : [],
    profiles: Array.isArray(data.profiles) ? data.profiles : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    shortcuts: Array.isArray(data.shortcuts) ? data.shortcuts : [],
    apiConfigs: Array.isArray(data.apiConfigs) ? data.apiConfigs : []
  };
}

function getTopEnvId() {
  return collectEnvConfigs().find((env) => isEnabled(env.enabled))?.id || "";
}

function getTopProfileId() {
  return collectProfiles().find((profile) => isEnabled(profile.enabled))?.id || "";
}

function setApiConfigAdvanced(card, isAdvanced) {
  card.classList.toggle("is-advanced", isAdvanced);
  card.dataset.mode = isAdvanced ? "advanced" : "basic";

  const basicFields = card.querySelectorAll(
    ".basic-only input, .basic-only textarea"
  );
  const advancedFields = card.querySelectorAll(
    ".advanced-only input, .advanced-only textarea"
  );
  basicFields.forEach((field) => {
    field.disabled = isAdvanced;
  });
  advancedFields.forEach((field) => {
    field.disabled = !isAdvanced;
  });

  const resetBtn = card.querySelector(".reset-openai");
  if (resetBtn) resetBtn.disabled = false;

  const advancedBtn = card.querySelector(".advanced-toggle");
  if (advancedBtn) {
    advancedBtn.disabled = false;
    advancedBtn.classList.toggle("hidden", isAdvanced);
  }
}

function readApiConfigFromCard(card) {
  const nameInput = card.querySelector(".api-config-name");
  const keySelect = card.querySelector(".api-config-key-select");
  const baseInput = card.querySelector(".api-config-base");
  const modelInput = card.querySelector(".api-config-model");
  const urlInput = card.querySelector(".api-config-url");
  const templateInput = card.querySelector(".api-config-template");
  const enabledInput = card.querySelector(".config-enabled");
  const isAdvanced = card.classList.contains("is-advanced");

  return {
    id: card.dataset.id || newApiConfigId(),
    name: (nameInput?.value || "Default").trim(),
    apiKeyId: keySelect?.value || "",
    apiBaseUrl: (baseInput?.value || "").trim(),
    model: (modelInput?.value || "").trim(),
    apiUrl: (urlInput?.value || "").trim(),
    requestTemplate: (templateInput?.value || "").trim(),
    advanced: isAdvanced,
    enabled: enabledInput ? enabledInput.checked : true
  };
}

function buildApiConfigCard(config) {
  const card = document.createElement("details");
  card.className = "api-config-card";
  card.dataset.id = config.id || newApiConfigId();
  card.dataset.stateKey = `api-config:${card.dataset.id}`;
  const isAdvanced = Boolean(config.advanced);

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = config.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateEnvApiOptions();
  });
  enabledInput.classList.add("hidden");

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = config.name || "";
  nameInput.className = "api-config-name";
  const nameField = document.createElement("div");
  nameField.className = "field";
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);
  const { body, summaryLeft, summaryRight } = setupCardPanel(
    card,
    nameInput,
    "Untitled"
  );
  const enabledToggle = buildEnabledToggleButton(enabledInput);
  summaryLeft.prepend(enabledToggle);
  summaryLeft.appendChild(enabledInput);

  const keyField = document.createElement("div");
  keyField.className = "field";
  const keyLabel = document.createElement("label");
  keyLabel.textContent = "API Key";
  const keySelect = document.createElement("select");
  keySelect.className = "api-config-key-select";
  keySelect.dataset.preferred = config.apiKeyId || "";
  keyField.appendChild(keyLabel);
  keyField.appendChild(keySelect);

  const baseField = document.createElement("div");
  baseField.className = "field basic-only";
  const baseLabel = document.createElement("label");
  baseLabel.textContent = "API Base URL";
  const baseInput = document.createElement("input");
  baseInput.type = "text";
  baseInput.placeholder = OPENAI_DEFAULTS.apiBaseUrl;
  baseInput.value = config.apiBaseUrl || "";
  baseInput.className = "api-config-base";
  baseField.appendChild(baseLabel);
  baseField.appendChild(baseInput);

  const modelField = document.createElement("div");
  modelField.className = "field basic-only api-config-model-field";
  const modelLabel = document.createElement("label");
  modelLabel.textContent = "Model name";
  const modelInput = document.createElement("input");
  modelInput.type = "text";
  modelInput.placeholder = DEFAULT_MODEL;
  modelInput.value = config.model || "";
  modelInput.className = "api-config-model";
  modelField.appendChild(modelLabel);
  modelField.appendChild(modelInput);

  const primaryRow = document.createElement("div");
  primaryRow.className = "inline-fields api-config-primary";
  primaryRow.appendChild(nameField);
  primaryRow.appendChild(keyField);
  primaryRow.appendChild(modelField);

  const urlField = document.createElement("div");
  urlField.className = "field advanced-only";
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "API URL";
  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.placeholder = "https://api.example.com/v1/chat/completions";
  urlInput.value = config.apiUrl || "";
  urlInput.className = "api-config-url";
  urlField.appendChild(urlLabel);
  urlField.appendChild(urlInput);

  const templateField = document.createElement("div");
  templateField.className = "field advanced-only";
  const templateLabel = document.createElement("label");
  templateLabel.textContent = "Request JSON body";
  const templateInput = document.createElement("textarea");
  templateInput.rows = 8;
  templateInput.placeholder = [
    "{",
    "  \"stream\": true,",
    "  \"messages\": [",
    "    { \"role\": \"system\", \"content\": \"SYSTEM_PROMPT_GOES_HERE\" },",
    "    { \"role\": \"user\", \"content\": \"PROMPT_GOES_HERE\" }",
    "  ],",
    "  \"api_key\": \"API_KEY_GOES_HERE\"",
    "}"
  ].join("\n");
  templateInput.value = config.requestTemplate || "";
  templateInput.className = "api-config-template";
  templateField.appendChild(templateLabel);
  templateField.appendChild(templateInput);

  const actions = document.createElement("div");
  actions.className = "api-config-actions";
  const leftActions = document.createElement("div");
  leftActions.className = "api-config-actions-left";
  const rightActions = document.createElement("div");
  rightActions.className = "api-config-actions-right";
  const moveTopBtn = document.createElement("button");
  moveTopBtn.type = "button";
  moveTopBtn.className = "ghost move-top";
  moveTopBtn.textContent = "Top";
  const moveUpBtn = document.createElement("button");
  moveUpBtn.type = "button";
  moveUpBtn.className = "ghost move-up";
  moveUpBtn.textContent = "Up";
  const moveDownBtn = document.createElement("button");
  moveDownBtn.type = "button";
  moveDownBtn.className = "ghost move-down";
  moveDownBtn.textContent = "Down";
  const duplicateBtn = document.createElement("button");
  duplicateBtn.type = "button";
  duplicateBtn.className = "ghost duplicate";
  duplicateBtn.textContent = "Duplicate";
  const addBelowBtn = document.createElement("button");
  addBelowBtn.type = "button";
  addBelowBtn.className = "accent add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = apiConfigsContainer.firstElementChild;
    if (!first || first === card) return;
    animateCardMove(card, () => {
      apiConfigsContainer.insertBefore(card, first);
    }, { scrollToCenter: true });
    updateApiConfigControls();
    updateEnvApiOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    animateCardMove(card, () => {
      apiConfigsContainer.insertBefore(card, previous);
    });
    updateApiConfigControls();
    updateEnvApiOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    animateCardMove(card, () => {
      apiConfigsContainer.insertBefore(card, next.nextElementSibling);
    });
    updateApiConfigControls();
    updateEnvApiOptions();
  });

  duplicateBtn.addEventListener("click", () => {
    const sourceRect = card.getBoundingClientRect();
    const source = readApiConfigFromCard(card);
    const names = collectNames(apiConfigsContainer, ".api-config-name");
    const nameValue = source.name || "Default";
    const copy = {
      ...source,
      id: newApiConfigId(),
      name: ensureUniqueName(`${nameValue} Copy`, names)
    };
    const newCard = buildApiConfigCard(copy);
    card.insertAdjacentElement("afterend", newCard);
    openDetails(newCard);
    animateDuplicateFromRect(newCard, sourceRect);
    updateApiConfigKeyOptions();
    updateEnvApiOptions();
    updateApiConfigControls();
    scheduleSidebarErrors();
    centerCardInViewAfterLayout(newCard);
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueNumberedName(
      "New API",
      collectNames(apiConfigsContainer, ".api-config-name")
    );
    const newCard = buildApiConfigCard({
      id: newApiConfigId(),
      name,
      apiBaseUrl: OPENAI_DEFAULTS.apiBaseUrl,
      model: DEFAULT_MODEL,
      apiUrl: "",
      requestTemplate: "",
      advanced: false
    });
    card.insertAdjacentElement("afterend", newCard);
    openDetails(newCard);
    centerCardInView(newCard);
    updateApiConfigKeyOptions();
    updateEnvApiOptions();
    updateApiConfigControls();
  });

  const advancedBtn = document.createElement("button");
  advancedBtn.type = "button";
  advancedBtn.className = "ghost advanced-toggle";
  advancedBtn.textContent = "Advanced Mode";
  advancedBtn.addEventListener("click", () => {
    if (card.classList.contains("is-advanced")) return;
    urlInput.value = buildChatUrlFromBase(baseInput.value);
    templateInput.value = [
      "{",
      `  \"model\": \"${modelInput.value || DEFAULT_MODEL}\",`,
      "  \"stream\": true,",
      "  \"messages\": [",
      "    { \"role\": \"system\", \"content\": \"SYSTEM_PROMPT_GOES_HERE\" },",
      "    { \"role\": \"user\", \"content\": \"PROMPT_GOES_HERE\" }",
      "  ],",
      "  \"api_key\": \"API_KEY_GOES_HERE\"",
      "}"
    ].join("\n");
    setApiConfigAdvanced(card, true);
    updateEnvApiOptions();
  });
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "ghost reset-openai";
  resetBtn.textContent = "Reset to OpenAI";
  resetBtn.addEventListener("click", () => {
    baseInput.value = OPENAI_DEFAULTS.apiBaseUrl;
    modelInput.value = DEFAULT_MODEL;
    urlInput.value = "";
    templateInput.value = "";
    setApiConfigAdvanced(card, false);
    updateEnvApiOptions();
  });
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateEnvApiOptions();
    updateApiConfigControls();
  });

  const updateSelect = () => updateEnvApiOptions();
  nameInput.addEventListener("input", updateSelect);
  baseInput.addEventListener("input", updateSelect);
  modelInput.addEventListener("input", updateSelect);
  urlInput.addEventListener("input", updateSelect);
  templateInput.addEventListener("input", updateSelect);

  rightActions.appendChild(moveTopBtn);
  rightActions.appendChild(moveUpBtn);
  rightActions.appendChild(moveDownBtn);
  rightActions.appendChild(duplicateBtn);
  rightActions.appendChild(addBelowBtn);
  rightActions.appendChild(deleteBtn);

  leftActions.appendChild(advancedBtn);
  leftActions.appendChild(resetBtn);

  actions.appendChild(leftActions);
  actions.appendChild(rightActions);

  body.appendChild(primaryRow);
  body.appendChild(baseField);
  body.appendChild(urlField);
  body.appendChild(templateField);
  summaryRight.appendChild(actions);

  setApiConfigAdvanced(card, isAdvanced);

  return card;
}

function collectApiConfigs() {
  const cards = [...apiConfigsContainer.querySelectorAll(".api-config-card")];
  return cards.map((card) => readApiConfigFromCard(card));
}

function updateApiConfigControls() {
  const cards = [...apiConfigsContainer.querySelectorAll(".api-config-card")];
  cards.forEach((card, index) => {
    const moveTopBtn = card.querySelector(".move-top");
    const moveUpBtn = card.querySelector(".move-up");
    const moveDownBtn = card.querySelector(".move-down");
    if (moveTopBtn) moveTopBtn.disabled = index === 0;
    if (moveUpBtn) moveUpBtn.disabled = index === 0;
    if (moveDownBtn) moveDownBtn.disabled = index === cards.length - 1;
  });
  scheduleSidebarErrors();
}

function buildApiKeyCard(entry) {
  const card = document.createElement("details");
  card.className = "api-key-card";
  card.dataset.id = entry.id || newApiKeyId();
  card.dataset.stateKey = `api-key:${card.dataset.id}`;

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = entry.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateApiConfigKeyOptions();
  });
  enabledInput.classList.add("hidden");

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = entry.name || "";
  nameInput.className = "api-key-name";
  const { body, summaryLeft, summaryRight } = setupCardPanel(
    card,
    nameInput,
    "Untitled"
  );
  const enabledToggle = buildEnabledToggleButton(enabledInput);
  summaryLeft.prepend(enabledToggle);
  summaryLeft.appendChild(enabledInput);
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const keyField = document.createElement("div");
  keyField.className = "field";
  const keyLabel = document.createElement("label");
  keyLabel.textContent = "Key";
  const keyInline = document.createElement("div");
  keyInline.className = "inline";
  const keyInput = document.createElement("input");
  keyInput.type = "password";
  keyInput.autocomplete = "off";
  keyInput.placeholder = "sk-...";
  keyInput.value = entry.key || "";
  keyInput.className = "api-key-value";
  const showBtn = document.createElement("button");
  showBtn.type = "button";
  showBtn.className = "ghost";
  showBtn.textContent = "Show";
  showBtn.addEventListener("click", () => {
    const isPassword = keyInput.type === "password";
    keyInput.type = isPassword ? "text" : "password";
    showBtn.textContent = isPassword ? "Hide" : "Show";
  });
  keyInline.appendChild(keyInput);
  keyInline.appendChild(showBtn);
  keyField.appendChild(keyLabel);
  keyField.appendChild(keyInline);

  const actions = document.createElement("div");
  actions.className = "api-key-actions";
  const moveTopBtn = document.createElement("button");
  moveTopBtn.type = "button";
  moveTopBtn.className = "ghost move-top";
  moveTopBtn.textContent = "Top";
  const moveUpBtn = document.createElement("button");
  moveUpBtn.type = "button";
  moveUpBtn.className = "ghost move-up";
  moveUpBtn.textContent = "Up";
  const moveDownBtn = document.createElement("button");
  moveDownBtn.type = "button";
  moveDownBtn.className = "ghost move-down";
  moveDownBtn.textContent = "Down";
  const addBelowBtn = document.createElement("button");
  addBelowBtn.type = "button";
  addBelowBtn.className = "accent add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = apiKeysContainer.firstElementChild;
    if (!first || first === card) return;
    animateCardMove(card, () => {
      apiKeysContainer.insertBefore(card, first);
    }, { scrollToCenter: true });
    updateApiKeyControls();
    updateApiConfigKeyOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    animateCardMove(card, () => {
      apiKeysContainer.insertBefore(card, previous);
    });
    updateApiKeyControls();
    updateApiConfigKeyOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    animateCardMove(card, () => {
      apiKeysContainer.insertBefore(card, next.nextElementSibling);
    });
    updateApiKeyControls();
    updateApiConfigKeyOptions();
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueDefaultName(
      collectNames(apiKeysContainer, ".api-key-name")
    );
    const newCard = buildApiKeyCard({ id: newApiKeyId(), name, key: "" });
    card.insertAdjacentElement("afterend", newCard);
    openDetails(newCard);
    centerCardInView(newCard);
    updateApiConfigKeyOptions();
    updateApiKeyControls();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateApiConfigKeyOptions();
    updateApiKeyControls();
  });
  actions.appendChild(deleteBtn);

  const updateSelect = () => updateApiConfigKeyOptions();
  nameInput.addEventListener("input", updateSelect);
  keyInput.addEventListener("input", updateSelect);

  body.appendChild(nameField);
  body.appendChild(keyField);
  summaryRight.appendChild(actions);

  return card;
}

function collectApiKeys() {
  const cards = [...apiKeysContainer.querySelectorAll(".api-key-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".api-key-name");
    const keyInput = card.querySelector(".api-key-value");
    const enabledInput = card.querySelector(".config-enabled");
    return {
      id: card.dataset.id || newApiKeyId(),
      name: (nameInput?.value || "Default").trim(),
      key: (keyInput?.value || "").trim(),
      enabled: enabledInput ? enabledInput.checked : true
    };
  });
}

function updateApiKeyControls() {
  const cards = [...apiKeysContainer.querySelectorAll(".api-key-card")];
  cards.forEach((card, index) => {
    const moveTopBtn = card.querySelector(".move-top");
    const moveUpBtn = card.querySelector(".move-up");
    const moveDownBtn = card.querySelector(".move-down");
    if (moveTopBtn) moveTopBtn.disabled = index === 0;
    if (moveUpBtn) moveUpBtn.disabled = index === 0;
    if (moveDownBtn) moveDownBtn.disabled = index === cards.length - 1;
  });
  scheduleSidebarErrors();
}

function updateApiConfigKeyOptions() {
  const keys = collectApiKeys().filter((key) => isEnabled(key.enabled));
  const selects = apiConfigsContainer.querySelectorAll(".api-config-key-select");
  selects.forEach((select) => {
    const preferred = select.dataset.preferred || select.value;
    select.innerHTML = "";
    if (!keys.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No keys configured";
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    for (const key of keys) {
      const option = document.createElement("option");
      option.value = key.id;
      option.textContent = key.name || "Default";
      select.appendChild(option);
    }

    if (preferred && keys.some((key) => key.id === preferred)) {
      select.value = preferred;
    } else {
      select.value = keys[0].id;
    }

    select.dataset.preferred = select.value;
  });
}

function buildEnvConfigCard(config, container = envConfigsContainer) {
  const card = document.createElement("details");
  card.className = "env-config-card";
  card.dataset.id = config.id || newEnvConfigId();
  card.dataset.stateKey = `env:${card.dataset.id}`;

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = config.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateEnvApiOptions();
  });
  enabledInput.classList.add("hidden");

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = config.name || "";
  nameInput.className = "env-config-name";
  const { body, summaryLeft, summaryRight } = setupCardPanel(
    card,
    nameInput,
    "Untitled"
  );
  const enabledToggle = buildEnabledToggleButton(enabledInput);
  summaryLeft.prepend(enabledToggle);
  summaryLeft.appendChild(enabledInput);
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const apiField = document.createElement("div");
  apiField.className = "field";
  const apiLabel = document.createElement("label");
  apiLabel.textContent = "API config";
  const apiSelect = document.createElement("select");
  apiSelect.className = "env-config-api-select";
  apiSelect.dataset.preferred = config.apiConfigId || "";
  apiField.appendChild(apiLabel);
  apiField.appendChild(apiSelect);

  const promptField = document.createElement("div");
  promptField.className = "field";
  const promptLabel = document.createElement("label");
  promptLabel.textContent = "System prompt";
  const promptInput = document.createElement("textarea");
  promptInput.rows = 8;
  promptInput.value = config.systemPrompt || "";
  promptInput.className = "env-config-prompt";
  promptField.appendChild(promptLabel);
  promptField.appendChild(promptInput);
  const primaryRow = document.createElement("div");
  primaryRow.className = "inline-fields two env-config-primary";
  primaryRow.appendChild(nameField);
  primaryRow.appendChild(apiField);

  const actions = document.createElement("div");
  actions.className = "env-config-actions";
  const moveTopBtn = document.createElement("button");
  moveTopBtn.type = "button";
  moveTopBtn.className = "ghost move-top";
  moveTopBtn.textContent = "Top";
  const moveUpBtn = document.createElement("button");
  moveUpBtn.type = "button";
  moveUpBtn.className = "ghost move-up";
  moveUpBtn.textContent = "Up";
  const moveDownBtn = document.createElement("button");
  moveDownBtn.type = "button";
  moveDownBtn.className = "ghost move-down";
  moveDownBtn.textContent = "Down";
  const addBelowBtn = document.createElement("button");
  addBelowBtn.type = "button";
  addBelowBtn.className = "accent add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = container.firstElementChild;
    if (!first || first === card) return;
    animateCardMove(card, () => {
      container.insertBefore(card, first);
    }, { scrollToCenter: true });
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    animateCardMove(card, () => {
      container.insertBefore(card, previous);
    });
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    animateCardMove(card, () => {
      container.insertBefore(card, next.nextElementSibling);
    });
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);

  const moveControls = buildMoveControls("envs", card, container);
  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueNumberedName(
      "New Environment",
      collectNames(container, ".env-config-name")
    );
    const fallbackApiConfigId = getApiConfigsForEnvContainer(container)[0]?.id || "";
    const newCard = buildEnvConfigCard({
      id: newEnvConfigId(),
      name,
      apiConfigId: fallbackApiConfigId,
      systemPrompt: DEFAULT_SYSTEM_PROMPT
    }, container);
    card.insertAdjacentElement("afterend", newCard);
    openDetails(newCard);
    centerCardInView(newCard);
    updateEnvApiOptions();
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  const getSourceData = () => ({
    id: card.dataset.id,
    name: nameInput.value || "Default",
    apiConfigId: apiSelect.value || "",
    systemPrompt: promptInput.value || "",
    enabled: enabledInput.checked
  });
  const duplicateControls = buildDuplicateControls("envs", getSourceData, {
    onHere: () => {
      const sourceRect = card.getBoundingClientRect();
      const newCard = buildDuplicateCard("envs", getSourceData(), container);
      if (!newCard) return;
      card.insertAdjacentElement("afterend", newCard);
      openDetails(newCard);
      animateDuplicateFromRect(newCard, sourceRect);
      updateEnvApiOptions();
      updateEnvControls(container);
      updateTaskEnvOptions();
      scheduleSidebarErrors();
      centerCardInViewAfterLayout(newCard);
    },
    sourceCard: card
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  actions.appendChild(moveControls);
  actions.appendChild(duplicateControls);
  actions.appendChild(addBelowBtn);
  actions.appendChild(deleteBtn);
  nameInput.addEventListener("input", () => updateEnvApiOptions());

  body.appendChild(primaryRow);
  body.appendChild(promptField);
  summaryRight.appendChild(actions);

  return card;
}

function updateEnvControls(container = envConfigsContainer) {
  const cards = [...container.querySelectorAll(".env-config-card")];
  cards.forEach((card, index) => {
    const moveTopBtn = card.querySelector(".move-top");
    const moveUpBtn = card.querySelector(".move-up");
    const moveDownBtn = card.querySelector(".move-down");
    if (moveTopBtn) moveTopBtn.disabled = index === 0;
    if (moveUpBtn) moveUpBtn.disabled = index === 0;
    if (moveDownBtn) moveDownBtn.disabled = index === cards.length - 1;
  });
  scheduleSidebarErrors();
}

function updateTaskEnvOptionsForContainer(container, envs, allEnvsById) {
  if (!container) return;
  const selects = container.querySelectorAll(".task-env-select");
  selects.forEach((select) => {
    populateSelectPreserving(
      select,
      envs,
      "No environments configured",
      allEnvsById
    );
  });
}

function updateTaskEnvOptions() {
  const allGlobalEnvs = collectEnvConfigs();
  const enabledGlobalEnvs = allGlobalEnvs.filter((env) => isEnabled(env.enabled));
  updateTaskEnvOptionsForContainer(
    tasksContainer,
    enabledGlobalEnvs,
    buildItemMap(allGlobalEnvs)
  );

  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const scope = getWorkspaceScopeData(card);
    const workspaceEnvs = collectEnvConfigs(card.querySelector(".workspace-envs"));
    const allEnvs = mergeById(allGlobalEnvs, workspaceEnvs);
    updateTaskEnvOptionsForContainer(
      card.querySelector(".workspace-tasks"),
      scope.envs,
      buildItemMap(allEnvs)
    );
  });

  const siteCards = document.querySelectorAll(".site-card");
  siteCards.forEach((card) => {
    const scope = getSiteScopeData(card);
    const workspaceId = card.querySelector(".site-workspace")?.value || "global";
    const workspaceCard = document.querySelector(
      `.workspace-card[data-id="${workspaceId}"]`
    );
    const workspaceEnvs = workspaceCard
      ? collectEnvConfigs(workspaceCard.querySelector(".workspace-envs"))
      : [];
    const siteEnvs = collectEnvConfigs(card.querySelector(".site-envs"));
    const allEnvs = mergeById(allGlobalEnvs, workspaceEnvs, siteEnvs);
    updateTaskEnvOptionsForContainer(
      card.querySelector(".site-tasks"),
      scope.envs,
      buildItemMap(allEnvs)
    );
  });

  updateShortcutOptions();
  refreshWorkspaceInheritedLists();
  refreshSiteInheritedLists();
  scheduleSidebarErrors();
}

function buildProfileCard(profile, container = profilesContainer) {
  const card = document.createElement("details");
  card.className = "profile-card";
  card.dataset.id = profile.id || newProfileId();
  card.dataset.stateKey = `profile:${card.dataset.id}`;

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = profile.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateTaskProfileOptions();
  });
  enabledInput.classList.add("hidden");

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = profile.name || "";
  nameInput.className = "profile-name";
  const { body, summaryLeft, summaryRight } = setupCardPanel(
    card,
    nameInput,
    "Untitled"
  );
  const enabledToggle = buildEnabledToggleButton(enabledInput);
  summaryLeft.prepend(enabledToggle);
  summaryLeft.appendChild(enabledInput);
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const textField = document.createElement("div");
  textField.className = "field";
  const textLabel = document.createElement("label");
  textLabel.textContent = "Profile text";
  const textArea = document.createElement("textarea");
  textArea.rows = 8;
  textArea.value = profile.text || "";
  textArea.className = "profile-text";
  textField.appendChild(textLabel);
  textField.appendChild(textArea);

  const actions = document.createElement("div");
  actions.className = "profile-actions";
  const moveTopBtn = document.createElement("button");
  moveTopBtn.type = "button";
  moveTopBtn.className = "ghost move-top";
  moveTopBtn.textContent = "Top";
  const moveUpBtn = document.createElement("button");
  moveUpBtn.type = "button";
  moveUpBtn.className = "ghost move-up";
  moveUpBtn.textContent = "Up";
  const moveDownBtn = document.createElement("button");
  moveDownBtn.type = "button";
  moveDownBtn.className = "ghost move-down";
  moveDownBtn.textContent = "Down";
  const addBelowBtn = document.createElement("button");
  addBelowBtn.type = "button";
  addBelowBtn.className = "accent add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = container.firstElementChild;
    if (!first || first === card) return;
    animateCardMove(card, () => {
      container.insertBefore(card, first);
    }, { scrollToCenter: true });
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    animateCardMove(card, () => {
      container.insertBefore(card, previous);
    });
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    animateCardMove(card, () => {
      container.insertBefore(card, next.nextElementSibling);
    });
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueNumberedName(
      "New Profile",
      collectNames(container, ".profile-name")
    );
    const newCard = buildProfileCard({
      id: newProfileId(),
      name,
      text: ""
    }, container);
    card.insertAdjacentElement("afterend", newCard);
    openDetails(newCard);
    centerCardInView(newCard);
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  const getSourceData = () => ({
    id: card.dataset.id,
    name: nameInput.value || "Default",
    text: textArea.value || "",
    enabled: enabledInput.checked
  });
  const duplicateControls = buildDuplicateControls("profiles", getSourceData, {
    onHere: () => {
      const sourceRect = card.getBoundingClientRect();
      const newCard = buildDuplicateCard("profiles", getSourceData(), container);
      if (!newCard) return;
      card.insertAdjacentElement("afterend", newCard);
      openDetails(newCard);
      animateDuplicateFromRect(newCard, sourceRect);
      updateProfileControls(container);
      updateTaskProfileOptions();
      scheduleSidebarErrors();
      centerCardInViewAfterLayout(newCard);
    },
    sourceCard: card
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  const moveControls = buildMoveControls("profiles", card, container);
  actions.appendChild(moveControls);
  actions.appendChild(duplicateControls);
  actions.appendChild(addBelowBtn);
  actions.appendChild(deleteBtn);

  nameInput.addEventListener("input", () => updateTaskProfileOptions());

  body.appendChild(nameField);
  body.appendChild(textField);
  summaryRight.appendChild(actions);

  return card;
}

function collectProfiles(container = profilesContainer) {
  if (!container) return [];
  const cards = [...container.querySelectorAll(".profile-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".profile-name");
    const textArea = card.querySelector(".profile-text");
    const enabledInput = card.querySelector(".config-enabled");
    return {
      id: card.dataset.id || newProfileId(),
      name: (nameInput?.value || "Default").trim(),
      text: (textArea?.value || "").trim(),
      enabled: enabledInput ? enabledInput.checked : true
    };
  });
}

function updateProfileControls(container = profilesContainer) {
  const cards = [...container.querySelectorAll(".profile-card")];
  cards.forEach((card, index) => {
    const moveTopBtn = card.querySelector(".move-top");
    const moveUpBtn = card.querySelector(".move-up");
    const moveDownBtn = card.querySelector(".move-down");
    if (moveTopBtn) moveTopBtn.disabled = index === 0;
    if (moveUpBtn) moveUpBtn.disabled = index === 0;
    if (moveDownBtn) moveDownBtn.disabled = index === cards.length - 1;
  });
  scheduleSidebarErrors();
}

function updateTaskProfileOptionsForContainer(container, profiles, allProfilesById) {
  if (!container) return;
  const selects = container.querySelectorAll(".task-profile-select");
  selects.forEach((select) => {
    populateSelectPreserving(
      select,
      profiles,
      "No profiles configured",
      allProfilesById
    );
  });
}

function updateTaskProfileOptions() {
  const allGlobalProfiles = collectProfiles();
  const enabledProfiles = allGlobalProfiles.filter((profile) =>
    isEnabled(profile.enabled)
  );
  updateTaskProfileOptionsForContainer(
    tasksContainer,
    enabledProfiles,
    buildItemMap(allGlobalProfiles)
  );

  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const scope = getWorkspaceScopeData(card);
    const workspaceProfiles = collectProfiles(
      card.querySelector(".workspace-profiles")
    );
    const allProfiles = mergeById(allGlobalProfiles, workspaceProfiles);
    updateTaskProfileOptionsForContainer(
      card.querySelector(".workspace-tasks"),
      scope.profiles,
      buildItemMap(allProfiles)
    );
  });

  const siteCards = document.querySelectorAll(".site-card");
  siteCards.forEach((card) => {
    const scope = getSiteScopeData(card);
    const workspaceId = card.querySelector(".site-workspace")?.value || "global";
    const workspaceCard = document.querySelector(
      `.workspace-card[data-id="${workspaceId}"]`
    );
    const workspaceProfiles = workspaceCard
      ? collectProfiles(workspaceCard.querySelector(".workspace-profiles"))
      : [];
    const siteProfiles = collectProfiles(card.querySelector(".site-profiles"));
    const allProfiles = mergeById(
      allGlobalProfiles,
      workspaceProfiles,
      siteProfiles
    );
    updateTaskProfileOptionsForContainer(
      card.querySelector(".site-tasks"),
      scope.profiles,
      buildItemMap(allProfiles)
    );
  });

  updateShortcutOptions();
  refreshWorkspaceInheritedLists();
  refreshSiteInheritedLists();
  scheduleSidebarErrors();
}

function updateEnvApiOptionsForContainer(container, apiConfigs) {
  if (!container) return;
  const selects = container.querySelectorAll(".env-config-api-select");
  selects.forEach((select) => {
    select.dataset.preferred = select.value;
    populateSelect(select, apiConfigs, "No API configs configured");
  });
}

function refreshWorkspaceApiConfigLists() {
  const apiConfigs = collectApiConfigs().filter((config) => isEnabled(config.enabled));
  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const list = card.querySelector('.inherited-list[data-module="apiConfigs"]');
    if (!list) return;
    const disabled = collectDisabledInherited(list);
    const nextList = buildApiConfigToggleList(apiConfigs, disabled);
    nextList.dataset.module = "apiConfigs";
    list.replaceWith(nextList);
  });
}

function refreshSiteApiConfigLists() {
  const siteCards = document.querySelectorAll(".site-card");
  siteCards.forEach((card) => {
    const list = card.querySelector('.inherited-list[data-module="apiConfigs"]');
    if (!list) return;
    const disabled = collectDisabledInherited(list);
    const scopedConfigs = getWorkspaceAvailableApiConfigsForSite(card);
    const nextList = buildApiConfigToggleList(scopedConfigs, disabled);
    nextList.dataset.module = "apiConfigs";
    list.replaceWith(nextList);
  });
}

function refreshWorkspaceInheritedLists() {
  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const sections = [
      {
        key: "envs",
        parent: () => collectEnvConfigs(),
        container: card.querySelector(".workspace-envs")
      },
      {
        key: "profiles",
        parent: () => collectProfiles(),
        container: card.querySelector(".workspace-profiles")
      },
      {
        key: "tasks",
        parent: () => collectTasks(),
        container: card.querySelector(".workspace-tasks")
      },
      {
        key: "shortcuts",
        parent: () => collectShortcuts(),
        container: card.querySelector(".workspace-shortcuts")
      }
    ];
    sections.forEach((section) => {
      const list = card.querySelector(
        `.inherited-list[data-module="${section.key}"]`
      );
      if (!list) return;
      replaceInheritedList(
        list,
        section.key,
        section.parent,
        section.container
      );
    });
  });
  refreshInheritedSourceLabels();
}

function refreshSiteInheritedLists() {
  const siteCards = document.querySelectorAll(".site-card");
  siteCards.forEach((card) => {
    const workspaceId = card.querySelector(".site-workspace")?.value || "global";
    const workspaceCard = document.querySelector(
      `.workspace-card[data-id="${workspaceId}"]`
    );
    const workspaceScope = workspaceCard
      ? getWorkspaceScopeData(workspaceCard)
      : {
          envs: collectEnvConfigs(),
          profiles: collectProfiles(),
          tasks: collectTasks(),
          shortcuts: collectShortcuts()
        };
    const sections = [
      {
        key: "envs",
        parent: workspaceScope.envs,
        container: card.querySelector(".site-envs")
      },
      {
        key: "profiles",
        parent: workspaceScope.profiles,
        container: card.querySelector(".site-profiles")
      },
      {
        key: "tasks",
        parent: workspaceScope.tasks,
        container: card.querySelector(".site-tasks")
      },
      {
        key: "shortcuts",
        parent: workspaceScope.shortcuts,
        container: card.querySelector(".site-shortcuts")
      }
    ];
    sections.forEach((section) => {
      const list = card.querySelector(
        `.inherited-list[data-module="${section.key}"]`
      );
      if (!list) return;
      replaceInheritedList(list, section.key, section.parent, section.container);
    });
  });
  refreshInheritedSourceLabels();
}

function getWorkspaceApiConfigs(workspaceCard) {
  const apiConfigs = collectApiConfigs().filter((config) => isEnabled(config.enabled));
  if (!workspaceCard) return apiConfigs;
  const disabled = collectDisabledInherited(
    workspaceCard.querySelector('.inherited-list[data-module="apiConfigs"]')
  );
  return apiConfigs.filter((config) => !disabled.includes(config.id));
}

function getSiteApiConfigs(siteCard) {
  const apiConfigs = collectApiConfigs().filter((config) => isEnabled(config.enabled));
  if (!siteCard) return apiConfigs;
  const workspaceId =
    siteCard.querySelector(".site-workspace")?.value || "global";
  const workspaceCard = document.querySelector(
    `.workspace-card[data-id="${workspaceId}"]`
  );
  const workspaceDisabled = collectDisabledInherited(
    workspaceCard?.querySelector('.inherited-list[data-module="apiConfigs"]')
  );
  const siteDisabled = collectDisabledInherited(
    siteCard.querySelector('.inherited-list[data-module="apiConfigs"]')
  );
  return apiConfigs.filter(
    (config) =>
      !workspaceDisabled.includes(config.id) &&
      !siteDisabled.includes(config.id)
  );
}

function getWorkspaceAvailableApiConfigsForSite(siteCard) {
  const apiConfigs = collectApiConfigs().filter((config) => isEnabled(config.enabled));
  if (!siteCard) return apiConfigs;
  const workspaceId =
    siteCard.querySelector(".site-workspace")?.value || "global";
  const workspaceCard = document.querySelector(
    `.workspace-card[data-id="${workspaceId}"]`
  );
  const workspaceDisabled = collectDisabledInherited(
    workspaceCard?.querySelector('.inherited-list[data-module="apiConfigs"]')
  );
  return apiConfigs.filter((config) => !workspaceDisabled.includes(config.id));
}

function getApiConfigsForEnvContainer(container) {
  if (!container) {
    return collectApiConfigs().filter((config) => isEnabled(config.enabled));
  }
  const workspaceCard = container.closest(".workspace-card");
  if (workspaceCard) {
    return getWorkspaceApiConfigs(workspaceCard);
  }
  const siteCard = container.closest(".site-card");
  if (siteCard) {
    return getSiteApiConfigs(siteCard);
  }
  return collectApiConfigs().filter((config) => isEnabled(config.enabled));
}

function getTaskScopeForContainer(container) {
  if (!container) {
    return {
      envs: collectEnvConfigs().filter((env) => isEnabled(env.enabled)),
      profiles: collectProfiles().filter((profile) => isEnabled(profile.enabled))
    };
  }
  const siteCard = container.closest(".site-card");
  if (siteCard) {
    const scope = getSiteScopeData(siteCard);
    return { envs: scope.envs, profiles: scope.profiles };
  }
  const workspaceCard = container.closest(".workspace-card");
  if (workspaceCard) {
    const scope = getWorkspaceScopeData(workspaceCard);
    return { envs: scope.envs, profiles: scope.profiles };
  }
  return {
    envs: collectEnvConfigs().filter((env) => isEnabled(env.enabled)),
    profiles: collectProfiles().filter((profile) => isEnabled(profile.enabled))
  };
}

function updateEnvApiOptions() {
  refreshWorkspaceApiConfigLists();
  refreshSiteApiConfigLists();

  const apiConfigs = collectApiConfigs().filter((config) => isEnabled(config.enabled));
  updateEnvApiOptionsForContainer(envConfigsContainer, apiConfigs);

  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const scopedConfigs = getWorkspaceApiConfigs(card);
    updateEnvApiOptionsForContainer(
      card.querySelector(".workspace-envs"),
      scopedConfigs
    );
  });

  const siteCards = document.querySelectorAll(".site-card");
  siteCards.forEach((card) => {
    const scopedConfigs = getSiteApiConfigs(card);
    updateEnvApiOptionsForContainer(
      card.querySelector(".site-envs"),
      scopedConfigs
    );
  });

  updateTaskEnvOptions();
  refreshWorkspaceInheritedLists();
  refreshSiteInheritedLists();
}

function updateShortcutOptionsForContainer(container, options = {}) {
  if (!container) return;
  const envs = options.envs || [];
  const profiles = options.profiles || [];
  const tasks = options.tasks || [];
  const cards = container.querySelectorAll(".shortcut-card");
  cards.forEach((card) => {
    const envSelect = card.querySelector(".shortcut-env");
    const profileSelect = card.querySelector(".shortcut-profile");
    const taskSelect = card.querySelector(".shortcut-task");
    if (envSelect) {
      envSelect.dataset.preferred = envSelect.value;
      populateSelect(envSelect, envs, "No environments configured");
    }
    if (profileSelect) {
      profileSelect.dataset.preferred = profileSelect.value;
      populateSelect(profileSelect, profiles, "No profiles configured");
    }
    if (taskSelect) {
      taskSelect.dataset.preferred = taskSelect.value;
      populateSelect(taskSelect, tasks, "No tasks configured");
    }
  });
  updateShortcutControls(container);
}

function updateShortcutOptions() {
  const envs = collectEnvConfigs().filter((env) => isEnabled(env.enabled));
  const profiles = collectProfiles().filter((profile) => isEnabled(profile.enabled));
  const tasks = collectTasks().filter((task) => isEnabled(task.enabled));
  updateShortcutOptionsForContainer(shortcutsContainer, { envs, profiles, tasks });

  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const scope = getWorkspaceScopeData(card);
    updateShortcutOptionsForContainer(card.querySelector(".workspace-shortcuts"), {
      envs: scope.envs,
      profiles: scope.profiles,
      tasks: scope.tasks
    });
  });

  const siteCards = document.querySelectorAll(".site-card");
  siteCards.forEach((card) => {
    const scope = getSiteScopeData(card);
    updateShortcutOptionsForContainer(card.querySelector(".site-shortcuts"), {
      envs: scope.envs,
      profiles: scope.profiles,
      tasks: scope.tasks
    });
  });
  refreshWorkspaceInheritedLists();
  refreshSiteInheritedLists();
  scheduleSidebarErrors();
}

function collectWorkspaces() {
  const cards = [...workspacesContainer.querySelectorAll(".workspace-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".workspace-name");
    const themeSelect = card.querySelector(".appearance-theme");
    const toolbarSelect = card.querySelector(".appearance-toolbar-position");
    
    // Collect nested resources
    const envsContainer = card.querySelector(".workspace-envs");
    const profilesContainer = card.querySelector(".workspace-profiles");
    const tasksContainer = card.querySelector(".workspace-tasks");
    const shortcutsContainer = card.querySelector(".workspace-shortcuts");
    const envsInherited = card.querySelector('.inherited-list[data-module="envs"]');
    const profilesInherited = card.querySelector('.inherited-list[data-module="profiles"]');
    const tasksInherited = card.querySelector('.inherited-list[data-module="tasks"]');
    const shortcutsInherited = card.querySelector('.inherited-list[data-module="shortcuts"]');
    const apiConfigsInherited = card.querySelector('.inherited-list[data-module="apiConfigs"]');

    // We can reuse collect functions if they accept a container!
    // But collectEnvConfigs currently returns objects with flat IDs. 
    // We'll need to ensure we don't lose the nested nature or we handle it during save.
    
    // Actually, saveSettings stores workspaces array. If we put the resources inside, it works.
    
    return {
      id: card.dataset.id || newWorkspaceId(),
      name: (nameInput?.value || "Untitled Workspace").trim(),
      theme: themeSelect?.value || "inherit",
      toolbarPosition: toolbarSelect?.value || "inherit",
      envConfigs: envsContainer ? collectEnvConfigs(envsContainer) : [],
      profiles: profilesContainer ? collectProfiles(profilesContainer) : [],
      tasks: tasksContainer ? collectTasks(tasksContainer) : [],
      shortcuts: shortcutsContainer ? collectShortcuts(shortcutsContainer) : [],
      disabledInherited: {
        envs: collectDisabledInherited(envsInherited),
        profiles: collectDisabledInherited(profilesInherited),
        tasks: collectDisabledInherited(tasksInherited),
        shortcuts: collectDisabledInherited(shortcutsInherited),
        apiConfigs: collectDisabledInherited(apiConfigsInherited)
      }
    };
  });
}

function collectShortcuts(container = shortcutsContainer) {
  if (!container) return [];
  const cards = [...container.querySelectorAll(".shortcut-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".shortcut-name");
    const envSelect = card.querySelector(".shortcut-env");
    const profileSelect = card.querySelector(".shortcut-profile");
    const taskSelect = card.querySelector(".shortcut-task");
    const enabledInput = card.querySelector(".config-enabled");
    return {
      id: card.dataset.id || newShortcutId(),
      name: (nameInput?.value || "Untitled Shortcut").trim(),
      envId: envSelect?.value || "",
      profileId: profileSelect?.value || "",
      taskId: taskSelect?.value || "",
      enabled: enabledInput ? enabledInput.checked : true
    };
  });
}

function collectEnvConfigs(container = envConfigsContainer) {
  if (!container) return [];
  const cards = [...container.querySelectorAll(".env-config-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".env-config-name");
    const apiSelect = card.querySelector(".env-config-api-select");
    const promptInput = card.querySelector(".env-config-prompt");
    const enabledInput = card.querySelector(".config-enabled");
    return {
      id: card.dataset.id || newEnvConfigId(),
      name: (nameInput?.value || "Default").trim(),
      apiConfigId: apiSelect?.value || "",
      systemPrompt: (promptInput?.value || "").trim(),
      enabled: enabledInput ? enabledInput.checked : true
    };
  });
}

function renderWorkspaceSection(title, containerClass, items, builder, newItemFactory) {
  const details = document.createElement("details");
  details.className = "panel sub-panel";
  details.style.marginTop = "10px";
  details.style.border = "1px solid var(--border)";
  details.style.borderRadius = "8px";
  details.style.padding = "8px";
  
  const summary = document.createElement("summary");
  summary.className = "panel-summary";
  summary.style.cursor = "pointer";
  const summaryRow = document.createElement("div");
  summaryRow.className = "panel-summary-row";
  const summaryLeft = document.createElement("div");
  summaryLeft.className = "panel-summary-left";
  const summaryRight = document.createElement("div");
  summaryRight.className = "panel-summary-right";
  const summaryTitle = document.createElement("h3");
  summaryTitle.textContent = title;
  summaryTitle.style.display = "inline";
  summaryTitle.style.fontSize = "13px";
  summaryTitle.style.fontWeight = "600";
  summaryTitle.style.margin = "0";
  summaryLeft.appendChild(summaryTitle);
  summaryRow.appendChild(summaryLeft);
  summaryRow.appendChild(summaryRight);
  summary.appendChild(summaryRow);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "panel-body panel-body-inherited";
  body.style.paddingTop = "10px";
  
  const listContainer = document.createElement("div");
  listContainer.className = containerClass;
  
  if (items && Array.isArray(items)) {
    for (const item of items) {
      listContainer.appendChild(builder(item, listContainer));
    }
  }

  const addBtn = document.createElement("button");
  addBtn.className = "accent";
  addBtn.type = "button";
  addBtn.textContent = "Add";
  addBtn.addEventListener("click", () => {
    openDetails(details);
    const newItem = newItemFactory(listContainer);
    const newCard = builder(newItem, listContainer);
    listContainer.appendChild(newCard);
    openDetails(newCard);
    centerCardInView(newCard);
    scheduleSidebarErrors();
  });
  
  summaryRight.appendChild(addBtn);
  body.appendChild(listContainer);
  details.appendChild(body);
  
  return details;
}

function buildAppearanceSection(
  { theme = "inherit", toolbarPosition = "inherit" } = {},
  { stateKey } = {}
) {
  const details = document.createElement("details");
  details.className = "panel sub-panel";
  if (stateKey) {
    details.dataset.stateKey = stateKey;
  }

  const summary = document.createElement("summary");
  summary.className = "panel-summary";
  const summaryRow = document.createElement("div");
  summaryRow.className = "panel-summary-row";
  const summaryLeft = document.createElement("div");
  summaryLeft.className = "panel-summary-left";
  const summaryRight = document.createElement("div");
  summaryRight.className = "panel-summary-right";
  const summaryTitle = document.createElement("h3");
  summaryTitle.textContent = "Appearance";
  summaryTitle.style.display = "inline";
  summaryTitle.style.fontSize = "13px";
  summaryTitle.style.fontWeight = "600";
  summaryTitle.style.margin = "0";
  summaryLeft.appendChild(summaryTitle);
  summaryRow.appendChild(summaryLeft);
  summaryRow.appendChild(summaryRight);
  summary.appendChild(summaryRow);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "panel-body";

  const themeField = document.createElement("div");
  themeField.className = "field";
  const themeLabel = document.createElement("label");
  themeLabel.textContent = "Theme";
  const themeSelect = document.createElement("select");
  themeSelect.className = "appearance-theme";
  const themes = ["inherit", "system", "light", "dark"];
  for (const t of themes) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    themeSelect.appendChild(opt);
  }
  themeSelect.value = theme || "inherit";
  themeField.appendChild(themeLabel);
  themeField.appendChild(themeSelect);

  const toolbarField = document.createElement("div");
  toolbarField.className = "field";
  const toolbarLabel = document.createElement("label");
  toolbarLabel.textContent = "Toolbar position";
  const toolbarSelect = document.createElement("select");
  toolbarSelect.className = "appearance-toolbar-position";
  const positions = [
    "inherit",
    "bottom-right",
    "bottom-left",
    "top-right",
    "top-left",
    "bottom-center"
  ];
  const positionLabels = {
    inherit: "Inherit",
    "bottom-right": "Bottom Right",
    "bottom-left": "Bottom Left",
    "top-right": "Top Right",
    "top-left": "Top Left",
    "bottom-center": "Bottom Center"
  };
  for (const pos of positions) {
    const opt = document.createElement("option");
    opt.value = pos;
    opt.textContent = positionLabels[pos] || pos;
    toolbarSelect.appendChild(opt);
  }
  toolbarSelect.value = toolbarPosition || "inherit";
  toolbarField.appendChild(toolbarLabel);
  toolbarField.appendChild(toolbarSelect);

  const appearanceRow = document.createElement("div");
  appearanceRow.className = "inline-fields two appearance-fields";
  appearanceRow.appendChild(themeField);
  appearanceRow.appendChild(toolbarField);
  body.appendChild(appearanceRow);
  details.appendChild(body);
  registerDetail(details, details.open);

  return details;
}

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
}

function buildRenameMap(previousItems, nextItems) {
  const previous = Array.isArray(previousItems) ? previousItems : [];
  const next = Array.isArray(nextItems) ? nextItems : [];
  const previousById = new Map();
  for (const item of previous) {
    const id = item?.id;
    const name = normalizeName(item?.name);
    if (id && name) previousById.set(id, name);
  }
  const map = new Map();
  for (const item of next) {
    const id = item?.id;
    if (!id || !previousById.has(id)) continue;
    const previousName = previousById.get(id);
    const nextName = normalizeName(item?.name);
    if (!previousName || !nextName || previousName === nextName) continue;
    map.set(previousName, nextName);
  }
  return map;
}

function applyRenameMap(list, map) {
  if (!Array.isArray(list) || !map || map.size === 0) {
    return Array.isArray(list) ? [...list] : [];
  }
  const output = [];
  const seen = new Set();
  for (const raw of list) {
    const normalized = normalizeName(raw);
    if (!normalized) continue;
    const next = map.get(normalized) || normalized;
    if (seen.has(next)) continue;
    seen.add(next);
    output.push(next);
  }
  return output;
}

function applyRenameMaps(list, maps) {
  let output = Array.isArray(list) ? [...list] : [];
  for (const map of maps) {
    if (map && map.size) {
      output = applyRenameMap(output, map);
    }
  }
  return output;
}

function filterDisabledIds(list, items) {
  if (!Array.isArray(list)) return [];
  const allowed = new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => item?.id)
      .filter(Boolean)
  );
  return list.filter((id) => allowed.has(id));
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
    if (!isEnabled(item.enabled)) return false;
    const key = normalizeName(item.name);
    if (!key) return false;
    if (localNameSet.has(key)) return false;
    if (disabledSet.has(key)) return false;
    return true;
  });
  const effective = [
    ...inherited,
    ...local.filter((item) => isEnabled(item.enabled))
  ];
  return { inherited, effective, localNameSet, disabledSet };
}

function buildInheritedList(parentItems, localItems, disabledNames) {
  const container = document.createElement("div");
  container.className = "inherited-list";
  const parent = Array.isArray(parentItems) ? parentItems : [];
  const local = Array.isArray(localItems) ? localItems : [];
  const localNameSet = new Set(
    local.map((item) => normalizeName(item.name)).filter(Boolean)
  );
  const disabledSet = new Set(
    (disabledNames || []).map((name) => normalizeName(name)).filter(Boolean)
  );

  const enabledParents = parent.filter((item) => isEnabled(item.enabled));
  if (!enabledParents.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No inherited items.";
    container.appendChild(empty);
    return container;
  }

  for (const item of enabledParents) {
    const key = normalizeName(item.name);
    if (!key) continue;
    const overridden = localNameSet.has(key);
    const disabled = overridden || disabledSet.has(key);
    const row = document.createElement("div");
    row.className = "inherited-item";
    row.dataset.key = key;
    row.dataset.overridden = overridden ? "true" : "false";
    row.classList.toggle("is-enabled", !disabled);
    row.classList.toggle("is-disabled", disabled);

    const label = document.createElement("label");
    label.className = "inherited-button";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "inherited-toggle";
    toggle.checked = !disabled;
    toggle.disabled = overridden;
    toggle.addEventListener("change", () => {
      const enabled = toggle.checked;
      row.classList.toggle("is-enabled", enabled);
      row.classList.toggle("is-disabled", !enabled);
    });
    label.appendChild(toggle);
    label.appendChild(document.createTextNode(item.name || "Untitled"));
    row.appendChild(label);

    if (overridden) {
      const helper = document.createElement("div");
      helper.className = "hint";
      helper.textContent = "Overridden by a local config.";
      row.appendChild(helper);
    }

    container.appendChild(row);
  }

  return container;
}

function buildApiConfigToggleList(apiConfigs, disabledIds) {
  const container = document.createElement("div");
  container.className = "inherited-list";
  const configs = (apiConfigs || []).filter((config) => isEnabled(config.enabled));
  const disabledSet = new Set(disabledIds || []);
  if (!configs.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No API configs available.";
    container.appendChild(empty);
    return container;
  }

  for (const config of configs) {
    const row = document.createElement("div");
    row.className = "inherited-item";
    row.dataset.key = config.id;
    const enabled = !disabledSet.has(config.id);
    row.classList.toggle("is-enabled", enabled);
    row.classList.toggle("is-disabled", !enabled);
    const label = document.createElement("label");
    label.className = "inherited-button";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "inherited-toggle";
    toggle.checked = enabled;
    toggle.addEventListener("change", () => {
      row.classList.toggle("is-enabled", toggle.checked);
      row.classList.toggle("is-disabled", !toggle.checked);
      updateEnvApiOptions();
      scheduleSidebarErrors();
    });
    label.appendChild(toggle);
    label.appendChild(document.createTextNode(config.name || "Default"));
    row.appendChild(label);
    container.appendChild(row);
  }

  return container;
}

function setInheritedSource(group, source) {
  if (!group) return;
  const heading = group.querySelector(".scope-title");
  if (!heading) return;
  let meta = heading.querySelector(".scope-meta-link");
  if (!source || !source.label) {
    if (meta) meta.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement("button");
    meta.type = "button";
    meta.className = "scope-meta-link hint-accent";
    heading.appendChild(meta);
  }
  meta.textContent = source.label;
  meta.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof source.onClick === "function") {
      source.onClick();
    }
  };
}

function refreshInheritedSourceLabels() {
  const groups = document.querySelectorAll(".scope-group-inherited");
  groups.forEach((group) => {
    const resolver = group._resolveInheritedSource;
    if (!resolver) return;
    const source = typeof resolver === "function" ? resolver() : resolver;
    setInheritedSource(group, source);
  });
}

function getTocLevel(link) {
  if (link.closest(".toc-cards")) return 2;
  if (link.closest(".toc-sub")) return 1;
  return 0;
}

function isElementVisibleForHighlight(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return false;
  }
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  let node = element;
  while (node) {
    if (node.tagName === "DETAILS" && !node.open) {
      const summary = node.querySelector(":scope > summary");
      if (!summary || !summary.contains(element)) {
        return false;
      }
    }
    node = node.parentElement;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.height <= 0 || rect.width <= 0) return false;
  if (rect.bottom <= 0 || rect.top >= viewportHeight) return false;
  if (rect.right <= 0 || rect.left >= viewportWidth) return false;
  return true;
}

function resolveTocTarget(link) {
  const selector = link.dataset.tocTargetSelector;
  if (selector) {
    const target = document.querySelector(selector);
    if (target) return target;
  }
  const href = link.getAttribute("href");
  if (href && href.startsWith("#") && href.length > 1) {
    const target = document.querySelector(href);
    if (target) return target;
  }
  return null;
}

function resolveTocHeader(target) {
  if (!target) return null;
  const summary = target.querySelector(":scope > summary.panel-summary");
  if (summary) return summary;
  const heading = target.querySelector(".panel-summary h3, .panel-summary h2");
  if (heading) return heading.closest(".panel-summary") || heading;
  return target;
}

function findVisibleTocLinkInAncestors(target) {
  if (!target) return null;
  let node = target;
  let depth = 0;
  while (node && depth < 3) {
    const link = tocTargetMap.get(node);
    if (link && isElementVisibleForHighlight(link)) {
      return link;
    }
    node = node.parentElement?.closest("details") || null;
    depth += 1;
  }
  return null;
}

function setActiveTocLink(link) {
  if (activeTocLink === link) return;
  if (activeTocLink) activeTocLink.classList.remove("toc-active");
  activeTocLink = link || null;
  if (activeTocLink) activeTocLink.classList.add("toc-active");
}

function updateTocHighlight() {
  if (!tocTargets.length) {
    setActiveTocLink(null);
    return;
  }
  const visible = [];
  tocTargets.forEach((entry) => {
    const { link, header, level, order } = entry;
    if (!header || !header.isConnected) return;
    if (!isElementVisibleForHighlight(link)) return;
    if (!isElementVisibleForHighlight(header)) return;
    const rect = header.getBoundingClientRect();
    visible.push({ link, level, order, top: rect.top, entry });
  });
  if (!visible.length) {
    const bodyCandidates = [];
    tocTargets.forEach((entry) => {
      const { link, header, level, order } = entry;
      if (!header || !header.isConnected) return;
      if (!isElementVisibleForHighlight(header)) return;
      const rect = header.getBoundingClientRect();
      bodyCandidates.push({ link, level, order, top: rect.top, entry });
    });
    if (!bodyCandidates.length) {
      setActiveTocLink(null);
      return;
    }
    const maxLevel = Math.max(...bodyCandidates.map((item) => item.level));
    const sameLevel = bodyCandidates.filter((item) => item.level === maxLevel);
    sameLevel.sort((a, b) => {
      if (a.top !== b.top) return a.top - b.top;
      return a.order - b.order;
    });
    const candidate = sameLevel[0]?.entry;
    if (!candidate) {
      setActiveTocLink(null);
      return;
    }
    const fallback = findVisibleTocLinkInAncestors(candidate.target);
    setActiveTocLink(fallback);
    return;
  }
  const maxLevel = Math.max(...visible.map((item) => item.level));
  const sameLevel = visible.filter((item) => item.level === maxLevel);
  sameLevel.sort((a, b) => {
    if (a.top !== b.top) return a.top - b.top;
    return a.order - b.order;
  });
  setActiveTocLink(sameLevel[0]?.link || null);
}

function scheduleTocHighlight() {
  if (tocHighlightFrame) return;
  tocHighlightFrame = requestAnimationFrame(() => {
    tocHighlightFrame = null;
    updateTocHighlight();
  });
}

function refreshTocTargets() {
  tocTargets = [];
  tocTargetMap = new WeakMap();
  const links = document.querySelectorAll(".toc-links a");
  links.forEach((link, order) => {
    const target = resolveTocTarget(link);
    if (!target) return;
    const header = resolveTocHeader(target);
    if (!header) return;
    tocTargetMap.set(target, link);
    tocTargets.push({
      link,
      target,
      header,
      level: getTocLevel(link),
      order
    });
  });
  scheduleTocHighlight();
}

function buildScopeGroup(title, content, meta) {
  const wrapper = document.createElement("div");
  wrapper.className = "scope-group";
  const heading = document.createElement("div");
  heading.className = "scope-title hint-accent";
  const titleSpan = document.createElement("span");
  titleSpan.className = "scope-title-text";
  titleSpan.textContent = title;
  heading.appendChild(titleSpan);
  wrapper.appendChild(heading);
  wrapper.appendChild(content);
  if (meta) {
    setInheritedSource(wrapper, meta);
  }
  return wrapper;
}

function wireInheritedListHandlers(list, module) {
  list.addEventListener("change", (event) => {
    if (!event.target.classList.contains("inherited-toggle")) return;
    if (module === "envs") {
      updateTaskEnvOptions();
      updateShortcutOptions();
    } else if (module === "profiles") {
      updateTaskProfileOptions();
      updateShortcutOptions();
    } else if (module === "tasks") {
      updateShortcutOptions();
    }
    scheduleSidebarErrors();
  });
}

function replaceInheritedList(list, module, parentItems, localContainer) {
  const disabled = collectDisabledInherited(list);
  const resolvedParents =
    typeof parentItems === "function" ? parentItems() : parentItems;
  const locals = collectLocalItemsForModule(module, localContainer);
  const nextList = buildInheritedList(resolvedParents, locals, disabled);
  nextList.dataset.module = module;
  wireInheritedListHandlers(nextList, module);
  list.replaceWith(nextList);
  return nextList;
}

function collectLocalItemsForModule(module, container) {
  if (!container) return [];
  if (module === "envs") return collectEnvConfigs(container);
  if (module === "profiles") return collectProfiles(container);
  if (module === "tasks") return collectTasks(container);
  if (module === "shortcuts") return collectShortcuts(container);
  return [];
}

function buildScopedModuleSection({
  title,
  module,
  parentItems,
  localItems,
  disabledNames,
  localLabel,
  localContainerClass,
  buildCard,
  newItemFactory,
  cardOptions,
  stateKey,
  inheritedFrom
}) {
  const details = document.createElement("details");
  details.className = "panel sub-panel";
  if (stateKey) {
    details.dataset.stateKey = stateKey;
  }
  const summary = document.createElement("summary");
  summary.className = "panel-summary";
  const summaryRow = document.createElement("div");
  summaryRow.className = "panel-summary-row";
  const summaryLeft = document.createElement("div");
  summaryLeft.className = "panel-summary-left";
  const summaryRight = document.createElement("div");
  summaryRight.className = "panel-summary-right";
  const summaryTitle = document.createElement("h3");
  summaryTitle.textContent = title;
  summaryTitle.style.display = "inline";
  summaryTitle.style.fontSize = "13px";
  summaryTitle.style.fontWeight = "600";
  summaryTitle.style.margin = "0";
  summaryLeft.appendChild(summaryTitle);
  summaryRow.appendChild(summaryLeft);
  summaryRow.appendChild(summaryRight);
  summary.appendChild(summaryRow);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "panel-body";

  const resolvedParents =
    typeof parentItems === "function" ? parentItems() : parentItems;
  let inheritedList = buildInheritedList(
    resolvedParents,
    localItems,
    disabledNames
  );
  inheritedList.dataset.module = module;
  wireInheritedListHandlers(inheritedList, module);

  const refreshInherited = () => {
    inheritedList = replaceInheritedList(
      inheritedList,
      module,
      parentItems,
      localContainer
    );
  };

  const inheritedSource =
    typeof inheritedFrom === "function" ? inheritedFrom() : inheritedFrom;
  const inheritedGroup = buildScopeGroup(
    "Inherited",
    inheritedList,
    inheritedSource
  );
  inheritedGroup.classList.add("scope-group-inherited");
  if (inheritedFrom) {
    inheritedGroup._resolveInheritedSource = inheritedFrom;
  }
  body.appendChild(inheritedGroup);

  const localContainer = document.createElement("div");
  localContainer.className = localContainerClass;
  const items = Array.isArray(localItems) ? localItems : [];
  for (const item of items) {
    const options =
      typeof cardOptions === "function" ? cardOptions() : cardOptions;
    localContainer.appendChild(buildCard(item, localContainer, options));
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "accent";
  addBtn.textContent = "Add";
  addBtn.addEventListener("click", () => {
    openDetails(details);
    const newItem = newItemFactory(localContainer);
    const options =
      typeof cardOptions === "function" ? cardOptions() : cardOptions;
    const newCard = buildCard(newItem, localContainer, options);
    const first = localContainer.firstElementChild;
    if (first) {
      localContainer.insertBefore(newCard, first);
    } else {
      localContainer.appendChild(newCard);
    }
    openDetails(newCard);
    centerCardInView(newCard);
    if (module === "envs") {
      updateEnvApiOptions();
    } else if (module === "profiles") {
      updateTaskProfileOptions();
    } else if (module === "tasks") {
      updateShortcutOptions();
    }
    refreshInherited();
    scheduleSidebarErrors();
  });
  summaryRight.appendChild(addBtn);

  const localWrapper = document.createElement("div");
  localWrapper.appendChild(localContainer);
  body.appendChild(buildScopeGroup(localLabel, localWrapper));

  const nameSelector = {
    envs: ".env-config-name",
    profiles: ".profile-name",
    tasks: ".task-name",
    shortcuts: ".shortcut-name"
  }[module];
  if (nameSelector) {
    localContainer.addEventListener("input", (event) => {
      if (event.target.matches(nameSelector)) {
        refreshInherited();
      }
    });
  }
  localContainer.addEventListener("click", (event) => {
    if (event.target.closest(".delete")) {
      setTimeout(refreshInherited, 0);
    }
  });

  refreshInherited();

  details.appendChild(body);
  registerDetail(details, details.open);
  return { details, localContainer };
}

function collectDisabledInherited(listContainer) {
  if (!listContainer) return [];
  const disabled = [];
  const items = listContainer.querySelectorAll(".inherited-item");
  items.forEach((item) => {
    if (item.dataset.overridden === "true") return;
    const toggle = item.querySelector(".inherited-toggle");
    if (toggle && !toggle.checked) {
      disabled.push(item.dataset.key);
    }
  });
  return disabled;
}

function listWorkspaceTargets() {
  return [...workspacesContainer.querySelectorAll(".workspace-card")].map(
    (card) => ({
      id: card.dataset.id || "",
      name: card.querySelector(".workspace-name")?.value || "Untitled Workspace"
    })
  );
}

function listSiteTargets() {
  return [...sitesContainer.querySelectorAll(".site-card")].map((card) => ({
    id: card.dataset.id || "",
    name:
      card.querySelector(".site-name")?.value ||
      card.querySelector(".site-pattern")?.value ||
      "Untitled Site"
  }));
}

function fillTargetSelect(select, options, placeholder) {
  select.innerHTML = "";
  const initial = document.createElement("option");
  initial.value = "";
  initial.textContent = placeholder;
  select.appendChild(initial);
  for (const option of options) {
    const opt = document.createElement("option");
    opt.value = option.id;
    opt.textContent = option.name;
    select.appendChild(opt);
  }
}

function getWorkspaceScopeData(workspaceCard) {
  const globalEnvs = collectEnvConfigs();
  const globalProfiles = collectProfiles();
  const globalTasks = collectTasks();
  const globalShortcuts = collectShortcuts();
  const envs = collectEnvConfigs(
    workspaceCard.querySelector(".workspace-envs")
  );
  const profiles = collectProfiles(
    workspaceCard.querySelector(".workspace-profiles")
  );
  const tasks = collectTasks(workspaceCard.querySelector(".workspace-tasks"));
  const shortcuts = collectShortcuts(
    workspaceCard.querySelector(".workspace-shortcuts")
  );
  const envDisabled = collectDisabledInherited(
    workspaceCard.querySelector('.inherited-list[data-module="envs"]')
  );
  const profileDisabled = collectDisabledInherited(
    workspaceCard.querySelector('.inherited-list[data-module="profiles"]')
  );
  const taskDisabled = collectDisabledInherited(
    workspaceCard.querySelector('.inherited-list[data-module="tasks"]')
  );
  const shortcutDisabled = collectDisabledInherited(
    workspaceCard.querySelector('.inherited-list[data-module="shortcuts"]')
  );

  const envScope = resolveScopedItems(globalEnvs, envs, envDisabled);
  const profileScope = resolveScopedItems(
    globalProfiles,
    profiles,
    profileDisabled
  );
  const taskScope = resolveScopedItems(globalTasks, tasks, taskDisabled);
  const shortcutScope = resolveScopedItems(
    globalShortcuts,
    shortcuts,
    shortcutDisabled
  );
  return {
    envs: envScope.effective,
    profiles: profileScope.effective,
    tasks: taskScope.effective,
    shortcuts: shortcutScope.effective
  };
}

function getSiteScopeData(siteCard) {
  const workspaceId = siteCard.querySelector(".site-workspace")?.value || "global";
  const workspaceCard = document.querySelector(
    `.workspace-card[data-id="${workspaceId}"]`
  );
  const workspaceScope = workspaceCard
    ? getWorkspaceScopeData(workspaceCard)
    : {
        envs: collectEnvConfigs(),
        profiles: collectProfiles(),
        tasks: collectTasks(),
        shortcuts: collectShortcuts()
      };

  const envs = collectEnvConfigs(siteCard.querySelector(".site-envs"));
  const profiles = collectProfiles(siteCard.querySelector(".site-profiles"));
  const tasks = collectTasks(siteCard.querySelector(".site-tasks"));
  const shortcuts = collectShortcuts(siteCard.querySelector(".site-shortcuts"));
  const envDisabled = collectDisabledInherited(
    siteCard.querySelector('.inherited-list[data-module="envs"]')
  );
  const profileDisabled = collectDisabledInherited(
    siteCard.querySelector('.inherited-list[data-module="profiles"]')
  );
  const taskDisabled = collectDisabledInherited(
    siteCard.querySelector('.inherited-list[data-module="tasks"]')
  );
  const shortcutDisabled = collectDisabledInherited(
    siteCard.querySelector('.inherited-list[data-module="shortcuts"]')
  );

  const envScope = resolveScopedItems(
    workspaceScope.envs,
    envs,
    envDisabled
  );
  const profileScope = resolveScopedItems(
    workspaceScope.profiles,
    profiles,
    profileDisabled
  );
  const taskScope = resolveScopedItems(
    workspaceScope.tasks,
    tasks,
    taskDisabled
  );
  const shortcutScope = resolveScopedItems(
    workspaceScope.shortcuts || [],
    shortcuts,
    shortcutDisabled
  );

  return {
    envs: envScope.effective,
    profiles: profileScope.effective,
    tasks: taskScope.effective,
    shortcuts: shortcutScope.effective
  };
}

function buildDuplicateCard(module, source, container, options) {
  const nameValue = source.name || "Untitled";
  if (module === "envs") {
    const names = collectNames(container, ".env-config-name");
    const copy = {
      ...source,
      id: newEnvConfigId(),
      name: ensureUniqueName(`${nameValue} Copy`, names),
      enabled: source.enabled !== false
    };
    return buildEnvConfigCard(copy, container);
  }
  if (module === "profiles") {
    const names = collectNames(container, ".profile-name");
    const copy = {
      ...source,
      id: newProfileId(),
      name: ensureUniqueName(`${nameValue} Copy`, names),
      enabled: source.enabled !== false
    };
    return buildProfileCard(copy, container);
  }
  if (module === "tasks") {
    const names = collectNames(container, ".task-name");
    const envs = options?.envs || [];
    const profiles = options?.profiles || [];
    const copy = {
      ...source,
      id: newTaskId(),
      name: ensureUniqueName(`${nameValue} Copy`, names),
      enabled: source.enabled !== false,
      defaultEnvId: envs.some((env) => env.id === source.defaultEnvId)
        ? source.defaultEnvId
        : envs[0]?.id || "",
      defaultProfileId: profiles.some(
        (profile) => profile.id === source.defaultProfileId
      )
        ? source.defaultProfileId
        : profiles[0]?.id || ""
    };
    return buildTaskCard(copy, container, { envs, profiles });
  }
  if (module === "shortcuts") {
    const names = collectNames(container, ".shortcut-name");
    const envs = options?.envs || [];
    const profiles = options?.profiles || [];
    const tasks = options?.tasks || [];
    const copy = {
      ...source,
      id: newShortcutId(),
      name: ensureUniqueName(`${nameValue} Copy`, names),
      enabled: source.enabled !== false,
      envId: envs.some((env) => env.id === source.envId)
        ? source.envId
        : envs[0]?.id || "",
      profileId: profiles.some((profile) => profile.id === source.profileId)
        ? source.profileId
        : profiles[0]?.id || "",
      taskId: tasks.some((task) => task.id === source.taskId)
        ? source.taskId
        : tasks[0]?.id || ""
    };
    return buildShortcutCard(copy, container, { envs, profiles, tasks });
  }
  return null;
}

function insertCardAtTop(container, card) {
  if (!container || !card) return;
  const first = container.firstElementChild;
  if (first) {
    container.insertBefore(card, first);
  } else {
    container.appendChild(card);
  }
}

function openScopedSection(scopeCard, prefix, module) {
  if (!scopeCard || !module) return;
  const id = scopeCard.dataset.id;
  if (!id) return;
  const section = scopeCard.querySelector(
    `details[data-state-key="${prefix}:${id}:${module}"]`
  );
  if (section) openDetails(section);
}

function refreshAfterModuleChange(module) {
  if (module === "envs") {
    updateEnvApiOptions();
    updateTaskEnvOptions();
  } else if (module === "profiles") {
    updateTaskProfileOptions();
  } else if (module === "tasks") {
    updateShortcutOptions();
  } else if (module === "shortcuts") {
    updateShortcutOptions();
  }
  scheduleSidebarErrors();
}

const MOTION_DURATION_MS = 420;
const MOTION_EASING = "cubic-bezier(0.2, 0, 0.2, 1)";
let activeScrollToken = 0;

function cubicBezierAtTime(t, p1x, p1y, p2x, p2y) {
  if (p1x === p1y && p2x === p2y) return t;
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const sampleX = (tVal) => ((ax * tVal + bx) * tVal + cx) * tVal;
  const sampleY = (tVal) => ((ay * tVal + by) * tVal + cy) * tVal;
  let start = 0;
  let end = 1;
  let current = t;
  for (let i = 0; i < 20; i += 1) {
    const x = sampleX(current);
    const delta = x - t;
    if (Math.abs(delta) < 1e-4) break;
    if (delta > 0) {
      end = current;
      current = (start + current) / 2;
    } else {
      start = current;
      current = (current + end) / 2;
    }
  }
  return sampleY(current);
}

function motionEase(t) {
  return cubicBezierAtTime(t, 0.2, 0, 0.2, 1);
}

function animateScrollTo(target) {
  const start = window.scrollY || 0;
  const delta = target - start;
  if (!delta) return;
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    window.scrollTo(0, target);
    return;
  }
  const token = (activeScrollToken += 1);
  const startTime = performance.now();
  const step = (now) => {
    if (token !== activeScrollToken) return;
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / MOTION_DURATION_MS, 1);
    const eased = motionEase(progress);
    window.scrollTo(0, start + delta * eased);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

function scrollCardToCenter(card) {
  if (!card || typeof card.getBoundingClientRect !== "function") return;
  const rect = card.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const target =
    rect.top + window.scrollY - (viewportHeight / 2 - rect.height / 2);
  animateScrollTo(Math.max(0, target));
}

function updateModuleControls(module, container) {
  if (!container) return;
  if (module === "envs") updateEnvControls(container);
  else if (module === "profiles") updateProfileControls(container);
  else if (module === "tasks") updateTaskControls(container);
  else if (module === "shortcuts") updateShortcutControls(container);
}

function isElementInViewport(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") return false;
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  return (
    rect.bottom > 0 &&
    rect.top < viewportHeight &&
    rect.right > 0 &&
    rect.left < viewportWidth
  );
}

function runWhenVisible(element, callback, options = {}) {
  if (!element || typeof callback !== "function") return;
  const { scrollToCenter = false } = options;
  if (isElementInViewport(element)) {
    callback();
    return;
  }
  if (scrollToCenter) {
    scrollCardToCenter(element);
    requestAnimationFrame(() => {
      if (!element.isConnected) return;
      callback();
    });
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.disconnect();
        callback();
        break;
      }
    }
  }, { threshold: 0.1 });
  observer.observe(element);
}

function applyFlipAnimation(card, deltaX, deltaY) {
  if (!card) return;
  if (!deltaX && !deltaY) return;
  card.style.transition = "none";
  card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  card.style.willChange = "transform";
  card.getBoundingClientRect();
  requestAnimationFrame(() => {
    card.style.transition = `transform ${MOTION_DURATION_MS}ms ${MOTION_EASING}`;
    card.style.transform = "translate(0, 0)";
    const cleanup = () => {
      card.style.transition = "";
      card.style.transform = "";
      card.style.willChange = "";
      card.removeEventListener("transitionend", cleanup);
    };
    card.addEventListener("transitionend", cleanup);
  });
}

function animateDuplicateFromRect(card, sourceRect) {
  if (!card || !sourceRect) return;
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;
  const sourceScrollX = window.scrollX || 0;
  const sourceScrollY = window.scrollY || 0;
  const sourcePage = {
    left: sourceRect.left + sourceScrollX,
    top: sourceRect.top + sourceScrollY
  };
  requestAnimationFrame(() => {
    runWhenVisible(
      card,
      () => {
        if (!card.isConnected) return;
        const destRect = card.getBoundingClientRect();
        const currentScrollX = window.scrollX || 0;
        const currentScrollY = window.scrollY || 0;
        const sourceViewport = {
          left: sourcePage.left - currentScrollX,
          top: sourcePage.top - currentScrollY
        };
        const deltaX = sourceViewport.left - destRect.left;
        const deltaY = sourceViewport.top - destRect.top;
        applyFlipAnimation(card, deltaX, deltaY);
      },
      { scrollToCenter: true }
    );
  });
}

function animateCardMove(card, applyMove, options = {}) {
  if (!card || typeof applyMove !== "function") return;
  const firstRect = card.getBoundingClientRect();
  applyMove();
  const lastRect = card.getBoundingClientRect();
  const deltaX = firstRect.left - lastRect.left;
  const deltaY = firstRect.top - lastRect.top;
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced || (!deltaX && !deltaY)) {
    return;
  }
  runWhenVisible(card, () => applyFlipAnimation(card, deltaX, deltaY), {
    scrollToCenter: Boolean(options.scrollToCenter)
  });
}

function moveCardToContainer(card, container) {
  if (!card || !container) return;
  animateCardMove(card, () => insertCardAtTop(container, card), {
    scrollToCenter: true
  });
}

function moveCardToWorkspace(module, card, workspaceId) {
  const workspaceCard = document.querySelector(
    `.workspace-card[data-id="${workspaceId}"]`
  );
  if (!workspaceCard) return;
  const container = workspaceCard.querySelector(`.workspace-${module}`);
  if (!container) return;
  const origin = card.parentElement;
  moveCardToContainer(card, container);
  if (origin && origin !== container) {
    updateModuleControls(module, origin);
  }
  updateModuleControls(module, container);
  openDetailsChain(workspaceCard);
  openScopedSection(workspaceCard, "workspace", module);
  openDetails(card);
  refreshAfterModuleChange(module);
}

function moveCardToSite(module, card, siteId) {
  const siteCard = document.querySelector(`.site-card[data-id="${siteId}"]`);
  if (!siteCard) return;
  const container = siteCard.querySelector(`.site-${module}`);
  if (!container) return;
  const origin = card.parentElement;
  moveCardToContainer(card, container);
  if (origin && origin !== container) {
    updateModuleControls(module, origin);
  }
  updateModuleControls(module, container);
  openDetailsChain(siteCard);
  openScopedSection(siteCard, "site", module);
  openDetails(card);
  refreshAfterModuleChange(module);
}

function getGlobalContainerForModule(module) {
  if (module === "envs") return envConfigsContainer;
  if (module === "profiles") return profilesContainer;
  if (module === "tasks") return tasksContainer;
  if (module === "shortcuts") return shortcutsContainer;
  return null;
}

function getGlobalScopeForModule(module) {
  if (module === "tasks") {
    return {
      envs: collectEnvConfigs().filter((env) => isEnabled(env.enabled)),
      profiles: collectProfiles().filter((profile) => isEnabled(profile.enabled))
    };
  }
  if (module === "shortcuts") {
    return {
      envs: collectEnvConfigs().filter((env) => isEnabled(env.enabled)),
      profiles: collectProfiles().filter((profile) => isEnabled(profile.enabled)),
      tasks: collectTasks().filter((task) => isEnabled(task.enabled))
    };
  }
  return null;
}

function openGlobalSectionForModule(module) {
  const globalPanel = document.getElementById("global-config-panel");
  const sectionId = {
    envs: "environment-panel",
    profiles: "profiles-panel",
    tasks: "tasks-panel",
    shortcuts: "shortcuts-panel"
  }[module];
  if (sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
      openDetailsChain(section);
      openDetails(section);
      return;
    }
  }
  if (globalPanel) {
    openDetailsChain(globalPanel);
    openDetails(globalPanel);
  }
}

function focusGlobalModule(module) {
  const sectionId = {
    envs: "environment-panel",
    profiles: "profiles-panel",
    tasks: "tasks-panel",
    shortcuts: "shortcuts-panel"
  }[module];
  if (sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
      openDetailsChain(section);
      openDetails(section);
      centerCardInView(section);
      return;
    }
  }
  const globalPanel = document.getElementById("global-config-panel");
  if (globalPanel) {
    openDetailsChain(globalPanel);
    openDetails(globalPanel);
    centerCardInView(globalPanel);
  }
}

function focusGlobalApiConfigSection() {
  const section = document.getElementById("api-panel");
  if (section) {
    openDetailsChain(section);
    openDetails(section);
    centerCardInView(section);
    return;
  }
  const globalPanel = document.getElementById("global-config-panel");
  if (globalPanel) {
    openDetailsChain(globalPanel);
    openDetails(globalPanel);
    centerCardInView(globalPanel);
  }
}

function focusWorkspaceModule(workspaceId, module) {
  if (!workspaceId || workspaceId === "global") {
    focusGlobalModule(module);
    return;
  }
  const workspaceCard = document.querySelector(
    `.workspace-card[data-id="${workspaceId}"]`
  );
  if (!workspaceCard) return;
  openDetailsChain(workspaceCard);
  openScopedSection(workspaceCard, "workspace", module);
  const section = workspaceCard.querySelector(
    `details[data-state-key="workspace:${workspaceId}:${module}"]`
  );
  if (section) {
    openDetails(section);
    centerCardInView(section);
    return;
  }
  centerCardInView(workspaceCard);
}

function getWorkspaceNameById(workspaceId) {
  if (!workspaceId || workspaceId === "global") return "Global";
  const workspaceCard = document.querySelector(
    `.workspace-card[data-id="${workspaceId}"]`
  );
  const name =
    workspaceCard?.querySelector(".workspace-name")?.value?.trim() || "";
  return name || "Untitled Workspace";
}

function moveCardToGlobal(module, card) {
  const container = getGlobalContainerForModule(module);
  if (!container) return;
  const origin = card.parentElement;
  moveCardToContainer(card, container);
  if (origin && origin !== container) {
    updateModuleControls(module, origin);
  }
  updateModuleControls(module, container);
  openGlobalSectionForModule(module);
  openDetails(card);
  refreshAfterModuleChange(module);
}

function duplicateToWorkspace(module, source, workspaceId, sourceRect) {
  const workspaceCard = document.querySelector(
    `.workspace-card[data-id="${workspaceId}"]`
  );
  if (!workspaceCard) return;
  const container = workspaceCard.querySelector(`.workspace-${module}`);
  if (!container) return;
  const scope = getWorkspaceScopeData(workspaceCard);
  const card = buildDuplicateCard(module, source, container, scope);
  if (card) {
    insertCardAtTop(container, card);
    openDetailsChain(workspaceCard);
    openScopedSection(workspaceCard, "workspace", module);
    openDetails(card);
    animateDuplicateFromRect(card, sourceRect);
    updateModuleControls(module, container);
    refreshAfterModuleChange(module);
    centerCardInViewAfterLayout(card);
  }
}

function duplicateToSite(module, source, siteId, sourceRect) {
  const siteCard = document.querySelector(`.site-card[data-id="${siteId}"]`);
  if (!siteCard) return;
  const container = siteCard.querySelector(`.site-${module}`);
  if (!container) return;
  const scope = getSiteScopeData(siteCard);
  const card = buildDuplicateCard(module, source, container, scope);
  if (card) {
    insertCardAtTop(container, card);
    openDetailsChain(siteCard);
    openScopedSection(siteCard, "site", module);
    openDetails(card);
    animateDuplicateFromRect(card, sourceRect);
    updateModuleControls(module, container);
    refreshAfterModuleChange(module);
    centerCardInViewAfterLayout(card);
  }
}

function duplicateToGlobal(module, source, sourceRect) {
  const container = getGlobalContainerForModule(module);
  if (!container) return;
  const scope = getGlobalScopeForModule(module);
  const card = buildDuplicateCard(module, source, container, scope);
  if (card) {
    insertCardAtTop(container, card);
    openGlobalSectionForModule(module);
    openDetails(card);
    animateDuplicateFromRect(card, sourceRect);
    updateModuleControls(module, container);
    refreshAfterModuleChange(module);
    centerCardInViewAfterLayout(card);
  }
}

function buildScopedActionControls(label, handlers = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "dup-controls";
  const { onHere, onGlobal, onWorkspace, onSite } = handlers;

  const select = document.createElement("select");
  select.className = "dup-select";
  select.addEventListener("click", (event) => event.stopPropagation());
  select.addEventListener("mousedown", (event) => event.stopPropagation());

  const placeholderValue = "__placeholder__";
  let menuMode = "root";
  let outsideHandler = null;

  const setOptions = (options, placeholderLabel) => {
    select.innerHTML = "";
    if (placeholderLabel) {
      const placeholder = document.createElement("option");
      placeholder.value = placeholderValue;
      placeholder.textContent = placeholderLabel;
      select.appendChild(placeholder);
    }
    for (const option of options) {
      const entry = document.createElement("option");
      entry.value = option.value;
      entry.textContent = option.label;
      if (option.disabled) entry.disabled = true;
      if (option.kind === "cancel") {
        entry.className = "dup-option-cancel";
        entry.style.color = "#c0392b";
        entry.style.fontWeight = "600";
      }
      select.appendChild(entry);
    }
    if (placeholderLabel) {
      select.value = placeholderValue;
    }
  };

  const attachOutsideHandler = () => {
    if (outsideHandler) return;
    outsideHandler = (event) => {
      if (wrapper.contains(event.target)) return;
      hideMenu();
    };
    document.addEventListener("mousedown", outsideHandler);
    document.addEventListener("touchstart", outsideHandler);
  };

  const detachOutsideHandler = () => {
    if (!outsideHandler) return;
    document.removeEventListener("mousedown", outsideHandler);
    document.removeEventListener("touchstart", outsideHandler);
    outsideHandler = null;
  };

  const showMenu = (mode) => {
    menuMode = mode;
    if (mode === "root") {
      setOptions([
        { value: "here", label: "Here" },
        { value: "global", label: "Global" },
        { value: "workspace", label: "Workspace" },
        { value: "site", label: "Site" },
        { value: "cancel", label: "Cancel", kind: "cancel" }
      ], label);
      detachOutsideHandler();
    } else if (mode === "workspace") {
      const targets = listWorkspaceTargets();
      const options = [
        { value: "back", label: "Back" },
        { value: "cancel", label: "Cancel", kind: "cancel" }
      ];
      if (!targets.length) {
        options.push({ value: "", label: "No workspaces", disabled: true });
      } else {
        targets.forEach((target) => {
          options.push({ value: target.id, label: target.name });
        });
      }
      setOptions(options, "Select Destination");
      attachOutsideHandler();
    } else if (mode === "site") {
      const targets = listSiteTargets();
      const options = [
        { value: "back", label: "Back" },
        { value: "cancel", label: "Cancel", kind: "cancel" }
      ];
      if (!targets.length) {
        options.push({ value: "", label: "No sites", disabled: true });
      } else {
        targets.forEach((target) => {
          options.push({ value: target.id, label: target.name });
        });
      }
      setOptions(options, "Select Destination");
      attachOutsideHandler();
    }
  };

  const resetMenu = () => {
    menuMode = "root";
    showMenu("root");
  };

  showMenu("root");

  select.addEventListener("change", () => {
    const value = select.value;
    if (!value || value === placeholderValue) return;
    if (menuMode === "root") {
      if (value === "cancel") {
        resetMenu();
        return;
      }
      if (value === "here") {
        if (typeof onHere === "function") {
          onHere();
        }
        resetMenu();
        return;
      }
      if (value === "global") {
        if (typeof onGlobal === "function") {
          onGlobal();
        }
        resetMenu();
        return;
      }
      if (value === "workspace" || value === "site") {
        showMenu(value);
      }
      return;
    }
    if (menuMode === "workspace") {
      if (value === "cancel") {
        resetMenu();
        return;
      }
      if (value === "back") {
        showMenu("root");
        return;
      }
      if (typeof onWorkspace === "function") {
        onWorkspace(value);
      }
      resetMenu();
      return;
    }
    if (menuMode === "site") {
      if (value === "cancel") {
        resetMenu();
        return;
      }
      if (value === "back") {
        showMenu("root");
        return;
      }
      if (typeof onSite === "function") {
        onSite(value);
      }
      resetMenu();
    }
  });

  select.addEventListener("blur", () => {
    resetMenu();
  });

  wrapper.appendChild(select);
  return wrapper;
}

function buildDuplicateControls(module, getSourceData, options = {}) {
  const { onHere, sourceCard } = options;
  const getSourceRect = () =>
    sourceCard && typeof sourceCard.getBoundingClientRect === "function"
      ? sourceCard.getBoundingClientRect()
      : null;
  return buildScopedActionControls("Duplicate", {
    onHere,
    onGlobal: () => duplicateToGlobal(module, getSourceData(), getSourceRect()),
    onWorkspace: (workspaceId) =>
      duplicateToWorkspace(module, getSourceData(), workspaceId, getSourceRect()),
    onSite: (siteId) =>
      duplicateToSite(module, getSourceData(), siteId, getSourceRect())
  });
}

function buildMoveControls(module, card, container) {
  return buildScopedActionControls("Move", {
    onHere: () => {
      const origin = card.parentElement;
      moveCardToContainer(card, container);
      if (origin) updateModuleControls(module, origin);
      updateModuleControls(module, container);
      openDetails(card);
      refreshAfterModuleChange(module);
    },
    onGlobal: () => moveCardToGlobal(module, card),
    onWorkspace: (workspaceId) => moveCardToWorkspace(module, card, workspaceId),
    onSite: (siteId) => moveCardToSite(module, card, siteId)
  });
}

function buildWorkspaceCard(ws, allWorkspaces = [], allSites = []) {
  const card = document.createElement("details");
  card.className = "workspace-card";
  card.dataset.id = ws.id || newWorkspaceId();
  card.dataset.stateKey = `workspace:${card.dataset.id}`;

  const nameField = document.createElement("div");
  nameField.className = "field";
  nameField.style.flex = "1";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Workspace name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = ws.name || "";
  nameInput.className = "workspace-name";
  nameInput.placeholder = "Workspace Name";
  nameInput.addEventListener("input", () => {
    updateToc(collectWorkspaces(), collectSites());
    scheduleSidebarErrors();
  });
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const { body, summaryRight } = setupCardPanel(
    card,
    nameInput,
    "Untitled Workspace",
    { subPanel: false }
  );

  const header = document.createElement("div");
  header.className = "row workspace-header";
  header.style.alignItems = "flex-end";
  header.appendChild(nameField);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    if (confirm(`Delete workspace "${ws.name}"? All items will move to global.`)) {
      card.remove();
      scheduleSidebarErrors();
      updateToc(collectWorkspaces(), collectSites());
    }
  });

  summaryRight.appendChild(deleteBtn);
  body.appendChild(header);

  const appearanceSection = buildAppearanceSection(
    {
      theme: ws.theme || "inherit",
      toolbarPosition: ws.toolbarPosition || "inherit"
    },
    { stateKey: `workspace:${card.dataset.id}:appearance` }
  );
  body.appendChild(appearanceSection);

  const disabledInherited = ws.disabledInherited || {};
  const globalApiConfigs = collectApiConfigs();
  const apiConfigSection = document.createElement("details");
  apiConfigSection.className = "panel sub-panel";
  apiConfigSection.dataset.stateKey = `workspace:${card.dataset.id}:apiConfigs`;
  const apiSummary = document.createElement("summary");
  apiSummary.className = "panel-summary";
  const apiSummaryRow = document.createElement("div");
  apiSummaryRow.className = "panel-summary-row";
  const apiSummaryLeft = document.createElement("div");
  apiSummaryLeft.className = "panel-summary-left";
  const apiSummaryRight = document.createElement("div");
  apiSummaryRight.className = "panel-summary-right";
  const apiSummaryTitle = document.createElement("h3");
  apiSummaryTitle.textContent = "API Configurations";
  apiSummaryTitle.style.display = "inline";
  apiSummaryTitle.style.fontSize = "13px";
  apiSummaryTitle.style.fontWeight = "600";
  apiSummaryTitle.style.margin = "0";
  const apiSummaryLink = document.createElement("button");
  apiSummaryLink.type = "button";
  apiSummaryLink.className = "panel-meta-link hint-accent";
  apiSummaryLink.textContent = "Global";
  apiSummaryLink.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    focusGlobalApiConfigSection();
  });
  apiSummaryLeft.appendChild(apiSummaryTitle);
  apiSummaryLeft.appendChild(apiSummaryLink);
  apiSummaryRow.appendChild(apiSummaryLeft);
  apiSummaryRow.appendChild(apiSummaryRight);
  apiSummary.appendChild(apiSummaryRow);
  apiConfigSection.appendChild(apiSummary);
  const apiBody = document.createElement("div");
  apiBody.className = "panel-body";
  const apiList = buildApiConfigToggleList(
    globalApiConfigs,
    disabledInherited.apiConfigs || []
  );
  apiList.dataset.module = "apiConfigs";
  apiBody.appendChild(apiList);
  apiConfigSection.appendChild(apiBody);
  registerDetail(apiConfigSection, apiConfigSection.open);
  body.appendChild(apiConfigSection);

  const envSection = buildScopedModuleSection({
    title: "Environments",
    module: "envs",
    parentItems: () => collectEnvConfigs(),
    localItems: ws.envConfigs || [],
    disabledNames: disabledInherited.envs,
    localLabel: "Workspace-specific",
    localContainerClass: "workspace-envs",
    buildCard: buildEnvConfigCard,
    stateKey: `workspace:${card.dataset.id}:envs`,
    inheritedFrom: () => ({
      label: "Global",
      onClick: () => focusGlobalModule("envs")
    }),
    newItemFactory: (container) => ({
      id: newEnvConfigId(),
      name: buildUniqueNumberedName(
        "New Environment",
        collectNames(container, ".env-config-name")
      ),
      apiConfigId: getWorkspaceApiConfigs(card)[0]?.id || "",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      enabled: true
    })
  });
  body.appendChild(envSection.details);

  const profileSection = buildScopedModuleSection({
    title: "Profiles",
    module: "profiles",
    parentItems: () => collectProfiles(),
    localItems: ws.profiles || [],
    disabledNames: disabledInherited.profiles,
    localLabel: "Workspace-specific",
    localContainerClass: "workspace-profiles",
    buildCard: buildProfileCard,
    stateKey: `workspace:${card.dataset.id}:profiles`,
    inheritedFrom: () => ({
      label: "Global",
      onClick: () => focusGlobalModule("profiles")
    }),
    newItemFactory: (container) => ({
      id: newProfileId(),
      name: buildUniqueNumberedName(
        "New Profile",
        collectNames(container, ".profile-name")
      ),
      text: "",
      enabled: true
    })
  });
  body.appendChild(profileSection.details);

  const taskSection = buildScopedModuleSection({
    title: "Tasks",
    module: "tasks",
    parentItems: () => collectTasks(),
    localItems: ws.tasks || [],
    disabledNames: disabledInherited.tasks,
    localLabel: "Workspace-specific",
    localContainerClass: "workspace-tasks",
    buildCard: buildTaskCard,
    stateKey: `workspace:${card.dataset.id}:tasks`,
    inheritedFrom: () => ({
      label: "Global",
      onClick: () => focusGlobalModule("tasks")
    }),
    cardOptions: () => {
      const scope = getWorkspaceScopeData(card);
      return { envs: scope.envs, profiles: scope.profiles };
    },
    newItemFactory: (container) => {
      const scope = getWorkspaceScopeData(card);
      return {
        id: newTaskId(),
        name: buildUniqueNumberedName(
          "New Task",
          collectNames(container, ".task-name")
        ),
        text: "",
        defaultEnvId: scope.envs[0]?.id || "",
        defaultProfileId: scope.profiles[0]?.id || "",
        enabled: true
      };
    }
  });
  body.appendChild(taskSection.details);

  const shortcutSection = buildScopedModuleSection({
    title: "Toolbar Shortcuts",
    module: "shortcuts",
    parentItems: () => collectShortcuts(),
    localItems: ws.shortcuts || [],
    disabledNames: disabledInherited.shortcuts,
    localLabel: "Workspace-specific",
    localContainerClass: "workspace-shortcuts",
    buildCard: buildShortcutCard,
    stateKey: `workspace:${card.dataset.id}:shortcuts`,
    inheritedFrom: () => ({
      label: "Global",
      onClick: () => focusGlobalModule("shortcuts")
    }),
    cardOptions: () => {
      const scope = getWorkspaceScopeData(card);
      return { envs: scope.envs, profiles: scope.profiles, tasks: scope.tasks };
    },
    newItemFactory: (container) => {
      const scope = getWorkspaceScopeData(card);
      return {
        id: newShortcutId(),
        name: buildUniqueNumberedName(
          "New Shortcut",
          collectNames(container, ".shortcut-name")
        ),
        envId: scope.envs[0]?.id || "",
        profileId: scope.profiles[0]?.id || "",
        taskId: scope.tasks[0]?.id || "",
        enabled: true
      };
    }
  });
  body.appendChild(shortcutSection.details);

  const sitesSection = document.createElement("details");
  sitesSection.className = "panel sub-panel";
  sitesSection.dataset.stateKey = `workspace:${card.dataset.id}:sites`;
  const sitesSummary = document.createElement("summary");
  sitesSummary.className = "panel-summary";
  const sitesSummaryRow = document.createElement("div");
  sitesSummaryRow.className = "panel-summary-row";
  const sitesSummaryLeft = document.createElement("div");
  sitesSummaryLeft.className = "panel-summary-left";
  const sitesSummaryRight = document.createElement("div");
  sitesSummaryRight.className = "panel-summary-right";
  const sitesSummaryTitle = document.createElement("h3");
  sitesSummaryTitle.textContent = "Sites";
  sitesSummaryTitle.style.display = "inline";
  sitesSummaryTitle.style.fontSize = "13px";
  sitesSummaryTitle.style.fontWeight = "600";
  sitesSummaryTitle.style.margin = "0";
  sitesSummaryLeft.appendChild(sitesSummaryTitle);
  sitesSummaryRow.appendChild(sitesSummaryLeft);
  sitesSummaryRow.appendChild(sitesSummaryRight);
  sitesSummary.appendChild(sitesSummaryRow);
  sitesSection.appendChild(sitesSummary);
  const sitesBody = document.createElement("div");
  sitesBody.className = "panel-body";
  const siteList = document.createElement("div");
  siteList.className = "sites-list workspace-sites-list";
  siteList.dataset.workspaceId = card.dataset.id;
  renderWorkspaceSitesList(siteList, card.dataset.id, allSites);
  sitesBody.appendChild(siteList);
  sitesSection.appendChild(sitesBody);
  registerDetail(sitesSection, sitesSection.open);
  body.appendChild(sitesSection);

  return card;
}

function collectSites() {
  const cards = [...sitesContainer.querySelectorAll(".site-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".site-name");
    const patternInput = card.querySelector(".site-pattern");
    const workspaceSelect = card.querySelector(".site-workspace");
    const extractInput = card.querySelector(".site-extract-selector");
    const parsedTarget = parseExtractionTargetInput(extractInput?.value || "");
    const themeSelect = card.querySelector(".appearance-theme");
    const toolbarSelect = card.querySelector(".appearance-toolbar-position");
    const envsContainer = card.querySelector(".site-envs");
    const profilesContainer = card.querySelector(".site-profiles");
    const tasksContainer = card.querySelector(".site-tasks");
    const shortcutsContainer = card.querySelector(".site-shortcuts");
    const envsInherited = card.querySelector('.inherited-list[data-module="envs"]');
    const profilesInherited = card.querySelector('.inherited-list[data-module="profiles"]');
    const tasksInherited = card.querySelector('.inherited-list[data-module="tasks"]');
    const shortcutsInherited = card.querySelector('.inherited-list[data-module="shortcuts"]');
    const apiConfigsInherited = card.querySelector('.inherited-list[data-module="apiConfigs"]');
    return {
      id: card.dataset.id || newSiteId(),
      name: (nameInput?.value || "").trim(),
      urlPattern: (patternInput?.value || "").trim(),
      workspaceId: workspaceSelect?.value || "global",
      extractTarget: parsedTarget.target,
      theme: themeSelect?.value || "inherit",
      toolbarPosition: toolbarSelect?.value || "inherit",
      envConfigs: envsContainer ? collectEnvConfigs(envsContainer) : [],
      profiles: profilesContainer ? collectProfiles(profilesContainer) : [],
      tasks: tasksContainer ? collectTasks(tasksContainer) : [],
      shortcuts: shortcutsContainer ? collectShortcuts(shortcutsContainer) : [],
      disabledInherited: {
        envs: collectDisabledInherited(envsInherited),
        profiles: collectDisabledInherited(profilesInherited),
        tasks: collectDisabledInherited(tasksInherited),
        shortcuts: collectDisabledInherited(shortcutsInherited),
        apiConfigs: collectDisabledInherited(apiConfigsInherited)
      }
    };
  });
}

function buildSiteCard(site, allWorkspaces = []) {
  const card = document.createElement("details");
  card.className = "site-card";
  card.dataset.id = site.id || newSiteId();
  card.dataset.stateKey = `site:${card.dataset.id}`;

  const row = document.createElement("div");
  row.className = "row site-header";
  row.style.alignItems = "flex-end";

  const nameField = document.createElement("div");
  nameField.className = "field";
  nameField.style.flex = "3";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Site name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = site.name || "";
  nameInput.className = "site-name";
  nameInput.placeholder = "Site Name";
  nameInput.addEventListener("input", () => {
    updateToc(collectWorkspaces(), collectSites());
    scheduleSidebarErrors();
  });
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const { body, summaryRight } = setupCardPanel(
    card,
    nameInput,
    "Untitled Site",
    { subPanel: false }
  );

  const patternField = document.createElement("div");
  patternField.className = "field";
  patternField.style.flex = "3";
  const patternLabel = document.createElement("label");
  patternLabel.textContent = "URL Pattern";
  const patternInput = document.createElement("input");
  patternInput.type = "text";
  patternInput.value = site.urlPattern || "";
  patternInput.className = "site-pattern";
  patternInput.placeholder = "example.com/*";
  patternInput.addEventListener("input", () => {
    updateToc(collectWorkspaces(), collectSites());
    scheduleSidebarErrors();
  });
  patternField.appendChild(patternLabel);
  patternField.appendChild(patternInput);

  const wsField = document.createElement("div");
  wsField.className = "field";
  wsField.style.flex = "2";
  const wsLabel = document.createElement("label");
  wsLabel.textContent = "Workspace";
  const wsSelect = document.createElement("select");
  wsSelect.className = "site-workspace";
  const globalOpt = document.createElement("option");
  globalOpt.value = "global";
  globalOpt.textContent = "Global";
  wsSelect.appendChild(globalOpt);
  for (const ws of allWorkspaces) {
    const opt = document.createElement("option");
    opt.value = ws.id;
    opt.textContent = ws.name || "Untitled Workspace";
    wsSelect.appendChild(opt);
  }
  wsSelect.value = site.workspaceId || "global";
  wsField.appendChild(wsLabel);
  wsField.appendChild(wsSelect);

  const getSiteInheritedSource = (module) => () => {
    const workspaceId = wsSelect.value || "global";
    return {
      label: getWorkspaceNameById(workspaceId),
      onClick: () => focusWorkspaceModule(workspaceId, module)
    };
  };

  wsSelect.addEventListener("change", () => {
    const currentSites = collectSites();
    const current = currentSites.find((entry) => entry.id === card.dataset.id);
    if (!current) return;
    const refreshed = {
      ...current,
      workspaceId: wsSelect.value || "global",
      disabledInherited: normalizeDisabledInherited()
    };
    const replacement = buildSiteCard(refreshed, collectWorkspaces());
    card.replaceWith(replacement);
    scheduleSidebarErrors();
    updateEnvApiOptions();
    updateTaskEnvOptions();
    updateTaskProfileOptions();
    updateShortcutOptions();
    updateToc(collectWorkspaces(), collectSites());
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    scheduleSidebarErrors();
    updateToc(collectWorkspaces(), collectSites());
  });

  row.appendChild(nameField);
  row.appendChild(patternField);
  row.appendChild(wsField);
  summaryRight.appendChild(deleteBtn);
  body.appendChild(row);

  const extractField = document.createElement("div");
  extractField.className = "field";
  const extractLabel = document.createElement("label");
  extractLabel.textContent = "Site Text Selector";
  const extractInput = document.createElement("input");
  extractInput.type = "text";
  extractInput.value = serializeExtractionTarget(site.extractTarget);
  extractInput.className = "site-extract-selector";
  extractInput.placeholder = "body";
  extractInput.addEventListener("input", () => {
    scheduleSidebarErrors();
  });
  extractField.appendChild(extractLabel);
  extractField.appendChild(extractInput);
  body.appendChild(extractField);

  const appearanceSection = buildAppearanceSection(
    {
      theme: site.theme || "inherit",
      toolbarPosition: site.toolbarPosition || "inherit"
    },
    { stateKey: `site:${card.dataset.id}:appearance` }
  );
  body.appendChild(appearanceSection);

  const disabledInherited = site.disabledInherited || {};
  const globalApiConfigs = collectApiConfigs();
  const workspace =
    allWorkspaces.find((ws) => ws.id === wsSelect.value) || null;
  const workspaceDisabled = workspace?.disabledInherited || {};

  const apiConfigSection = document.createElement("details");
  apiConfigSection.className = "panel sub-panel";
  apiConfigSection.dataset.stateKey = `site:${card.dataset.id}:apiConfigs`;
  const apiSummary = document.createElement("summary");
  apiSummary.className = "panel-summary";
  const apiSummaryRow = document.createElement("div");
  apiSummaryRow.className = "panel-summary-row";
  const apiSummaryLeft = document.createElement("div");
  apiSummaryLeft.className = "panel-summary-left";
  const apiSummaryRight = document.createElement("div");
  apiSummaryRight.className = "panel-summary-right";
  const apiSummaryTitle = document.createElement("h3");
  apiSummaryTitle.textContent = "API Configurations";
  apiSummaryTitle.style.display = "inline";
  apiSummaryTitle.style.fontSize = "13px";
  apiSummaryTitle.style.fontWeight = "600";
  apiSummaryTitle.style.margin = "0";
  const apiSummaryLink = document.createElement("button");
  apiSummaryLink.type = "button";
  apiSummaryLink.className = "panel-meta-link hint-accent";
  apiSummaryLink.textContent = "Global";
  apiSummaryLink.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    focusGlobalApiConfigSection();
  });
  apiSummaryLeft.appendChild(apiSummaryTitle);
  apiSummaryLeft.appendChild(apiSummaryLink);
  apiSummaryRow.appendChild(apiSummaryLeft);
  apiSummaryRow.appendChild(apiSummaryRight);
  apiSummary.appendChild(apiSummaryRow);
  apiConfigSection.appendChild(apiSummary);
  const apiBody = document.createElement("div");
  apiBody.className = "panel-body";
  const workspaceApiEnabled = globalApiConfigs.filter(
    (config) =>
      isEnabled(config.enabled) &&
      !(workspaceDisabled.apiConfigs || []).includes(config.id)
  );
  const apiList = buildApiConfigToggleList(
    workspaceApiEnabled,
    disabledInherited.apiConfigs || []
  );
  apiList.dataset.module = "apiConfigs";
  apiBody.appendChild(apiList);
  apiConfigSection.appendChild(apiBody);
  registerDetail(apiConfigSection, apiConfigSection.open);
  body.appendChild(apiConfigSection);

  const resolveWorkspaceScope = () => {
    const selectedWorkspaceId = wsSelect.value || "global";
    const workspaceCard = document.querySelector(
      `.workspace-card[data-id="${selectedWorkspaceId}"]`
    );
    if (workspaceCard) {
      return getWorkspaceScopeData(workspaceCard);
    }
    return {
      envs: collectEnvConfigs(),
      profiles: collectProfiles(),
      tasks: collectTasks(),
      shortcuts: collectShortcuts()
    };
  };

  const envSection = buildScopedModuleSection({
    title: "Environments",
    module: "envs",
    parentItems: () => resolveWorkspaceScope().envs,
    localItems: site.envConfigs || [],
    disabledNames: disabledInherited.envs,
    localLabel: "Site-specific",
    localContainerClass: "site-envs",
    buildCard: buildEnvConfigCard,
    stateKey: `site:${card.dataset.id}:envs`,
    inheritedFrom: getSiteInheritedSource("envs"),
    newItemFactory: (container) => ({
      id: newEnvConfigId(),
      name: buildUniqueNumberedName(
        "New Environment",
        collectNames(container, ".env-config-name")
      ),
      apiConfigId: getSiteApiConfigs(card)[0]?.id || "",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      enabled: true
    })
  });
  body.appendChild(envSection.details);

  const profileSection = buildScopedModuleSection({
    title: "Profiles",
    module: "profiles",
    parentItems: () => resolveWorkspaceScope().profiles,
    localItems: site.profiles || [],
    disabledNames: disabledInherited.profiles,
    localLabel: "Site-specific",
    localContainerClass: "site-profiles",
    buildCard: buildProfileCard,
    stateKey: `site:${card.dataset.id}:profiles`,
    inheritedFrom: getSiteInheritedSource("profiles"),
    newItemFactory: (container) => ({
      id: newProfileId(),
      name: buildUniqueNumberedName(
        "New Profile",
        collectNames(container, ".profile-name")
      ),
      text: "",
      enabled: true
    })
  });
  body.appendChild(profileSection.details);

  const taskSection = buildScopedModuleSection({
    title: "Tasks",
    module: "tasks",
    parentItems: () => resolveWorkspaceScope().tasks,
    localItems: site.tasks || [],
    disabledNames: disabledInherited.tasks,
    localLabel: "Site-specific",
    localContainerClass: "site-tasks",
    buildCard: buildTaskCard,
    stateKey: `site:${card.dataset.id}:tasks`,
    inheritedFrom: getSiteInheritedSource("tasks"),
    cardOptions: () => {
      const scope = getSiteScopeData(card);
      return { envs: scope.envs, profiles: scope.profiles };
    },
    newItemFactory: (container) => {
      const scope = getSiteScopeData(card);
      return {
        id: newTaskId(),
        name: buildUniqueNumberedName(
          "New Task",
          collectNames(container, ".task-name")
        ),
        text: "",
        defaultEnvId: scope.envs[0]?.id || "",
        defaultProfileId: scope.profiles[0]?.id || "",
        enabled: true
      };
    }
  });
  body.appendChild(taskSection.details);

  const shortcutSection = buildScopedModuleSection({
    title: "Toolbar Shortcuts",
    module: "shortcuts",
    parentItems: () => resolveWorkspaceScope().shortcuts,
    localItems: site.shortcuts || [],
    disabledNames: disabledInherited.shortcuts,
    localLabel: "Site-specific",
    localContainerClass: "site-shortcuts",
    buildCard: buildShortcutCard,
    stateKey: `site:${card.dataset.id}:shortcuts`,
    inheritedFrom: getSiteInheritedSource("shortcuts"),
    cardOptions: () => {
      const scope = getSiteScopeData(card);
      return { envs: scope.envs, profiles: scope.profiles, tasks: scope.tasks };
    },
    newItemFactory: (container) => {
      const scope = getSiteScopeData(card);
      return {
        id: newShortcutId(),
        name: buildUniqueNumberedName(
          "New Shortcut",
          collectNames(container, ".shortcut-name")
        ),
        envId: scope.envs[0]?.id || "",
        profileId: scope.profiles[0]?.id || "",
        taskId: scope.tasks[0]?.id || "",
        enabled: true
      };
    }
  });
  body.appendChild(shortcutSection.details);

  return card;
}

function buildTaskCard(task, container = tasksContainer, options = {}) {
  const card = document.createElement("details");
  card.className = "task-card";
  card.dataset.id = task.id || newTaskId();
  card.dataset.stateKey = `task:${card.dataset.id}`;
  const taskKey = String(card.dataset.id || "").replace(/[^a-zA-Z0-9_-]/g, "_");

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = task.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateShortcutOptions();
    scheduleSidebarErrors();
  });
  enabledInput.classList.add("hidden");

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = `task-name-${taskKey}`;
  nameInput.value = task.name || "";
  nameInput.className = "task-name task-field-input";
  nameLabel.htmlFor = nameInput.id;
  nameLabel.className = "task-field-label";
  const { body, summaryLeft, summaryRight } = setupCardPanel(
    card,
    nameInput,
    "Untitled"
  );
  const enabledToggle = buildEnabledToggleButton(enabledInput);
  summaryLeft.prepend(enabledToggle);
  summaryLeft.appendChild(enabledInput);

  const envLabel = document.createElement("label");
  envLabel.textContent = "Default environment";
  const envSelect = document.createElement("select");
  envSelect.id = `task-env-${taskKey}`;
  envSelect.className = "task-env-select task-field-input";
  envSelect.dataset.preferred = task.defaultEnvId || "";
  envLabel.htmlFor = envSelect.id;
  envLabel.className = "task-field-label";

  const profileLabel = document.createElement("label");
  profileLabel.textContent = "Default profile";
  const profileSelect = document.createElement("select");
  profileSelect.id = `task-profile-${taskKey}`;
  profileSelect.className = "task-profile-select task-field-input";
  profileSelect.dataset.preferred = task.defaultProfileId || "";
  profileLabel.htmlFor = profileSelect.id;
  profileLabel.className = "task-field-label";

  const textField = document.createElement("div");
  textField.className = "field";
  const textLabel = document.createElement("label");
  textLabel.textContent = "Task template";
  const textArea = document.createElement("textarea");
  textArea.rows = 6;
  textArea.value = task.text || "";
  textArea.className = "task-text";
  textField.appendChild(textLabel);
  textField.appendChild(textArea);

  const envOptions = options.envs
    ? options.envs
    : collectEnvConfigs().filter((env) => isEnabled(env.enabled));
  const profileOptions = options.profiles
    ? options.profiles
    : collectProfiles().filter((profile) => isEnabled(profile.enabled));
  populateSelect(envSelect, envOptions, "No environments configured");
  populateSelect(profileSelect, profileOptions, "No profiles configured");

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const moveTopBtn = document.createElement("button");
  moveTopBtn.type = "button";
  moveTopBtn.className = "ghost move-top";
  moveTopBtn.textContent = "Top";
  const moveUpBtn = document.createElement("button");
  moveUpBtn.type = "button";
  moveUpBtn.className = "ghost move-up";
  moveUpBtn.textContent = "Up";
  const moveDownBtn = document.createElement("button");
  moveDownBtn.type = "button";
  moveDownBtn.className = "ghost move-down";
  moveDownBtn.textContent = "Down";
  const addBelowBtn = document.createElement("button");
  addBelowBtn.type = "button";
  addBelowBtn.className = "accent add-below";
  addBelowBtn.textContent = "Add";
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";

  moveTopBtn.addEventListener("click", () => {
    const first = container.firstElementChild;
    if (!first || first === card) return;
    animateCardMove(card, () => {
      container.insertBefore(card, first);
    }, { scrollToCenter: true });
    updateTaskControls(container);
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    animateCardMove(card, () => {
      container.insertBefore(card, previous);
    });
    updateTaskControls(container);
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    animateCardMove(card, () => {
      container.insertBefore(card, next.nextElementSibling);
    });
    updateTaskControls(container);
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueNumberedName(
      "New Task",
      collectNames(container, ".task-name")
    );
    const defaultEnvId =
      envSelect.value || envSelect.options[0]?.value || "";
    const defaultProfileId =
      profileSelect.value || profileSelect.options[0]?.value || "";
    const scope = getTaskScopeForContainer(container);
    const newCard = buildTaskCard({
      id: newTaskId(),
      name,
      text: "",
      defaultEnvId,
      defaultProfileId
    }, container, scope);
    card.insertAdjacentElement("afterend", newCard);
    openDetails(newCard);
    centerCardInView(newCard);
    updateTaskControls(container);
    updateTaskEnvOptions();
    updateTaskProfileOptions();
  });

  const getSourceData = () => ({
    id: card.dataset.id,
    name: nameInput.value || "Untitled",
    text: textArea.value,
    defaultEnvId: envSelect.value || "",
    defaultProfileId: profileSelect.value || "",
    enabled: enabledInput.checked
  });
  const duplicateControls = buildDuplicateControls("tasks", getSourceData, {
    onHere: () => {
      const sourceRect = card.getBoundingClientRect();
      const scope = getTaskScopeForContainer(container);
      const newCard = buildDuplicateCard("tasks", getSourceData(), container, scope);
      if (!newCard) return;
      card.insertAdjacentElement("afterend", newCard);
      openDetails(newCard);
      animateDuplicateFromRect(newCard, sourceRect);
      updateTaskControls(container);
      updateTaskEnvOptions();
      updateTaskProfileOptions();
      scheduleSidebarErrors();
      centerCardInViewAfterLayout(newCard);
    },
    sourceCard: card
  });

  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateTaskControls(container);
    updateShortcutOptions();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  const moveControls = buildMoveControls("tasks", card, container);
  actions.appendChild(moveControls);
  actions.appendChild(duplicateControls);
  actions.appendChild(addBelowBtn);
  actions.appendChild(deleteBtn);

  const fieldsWrap = document.createElement("div");
  fieldsWrap.className = "task-fields";
  fieldsWrap.appendChild(nameLabel);
  fieldsWrap.appendChild(envLabel);
  fieldsWrap.appendChild(profileLabel);
  fieldsWrap.appendChild(nameInput);
  fieldsWrap.appendChild(envSelect);
  fieldsWrap.appendChild(profileSelect);

  body.appendChild(fieldsWrap);
  body.appendChild(textField);
  summaryRight.appendChild(actions);

  nameInput.addEventListener("input", () => updateShortcutOptions());

  return card;
}

function buildShortcutCard(shortcut, container = shortcutsContainer, options = {}) {
  const card = document.createElement("details");
  card.className = "shortcut-card";
  card.dataset.id = shortcut.id || newShortcutId();
  card.dataset.stateKey = `shortcut:${card.dataset.id}`;
  const shortcutKey = String(card.dataset.id || "").replace(/[^a-zA-Z0-9_-]/g, "_");

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = shortcut.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateShortcutOptions();
    scheduleSidebarErrors();
  });
  enabledInput.classList.add("hidden");

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = `shortcut-name-${shortcutKey}`;
  nameInput.value = shortcut.name || "";
  nameInput.className = "shortcut-name shortcut-field-input";
  nameInput.addEventListener("input", () => {
    updateShortcutOptions();
    scheduleSidebarErrors();
  });
  nameLabel.htmlFor = nameInput.id;
  nameLabel.className = "shortcut-field-label";
  const { body, summaryLeft, summaryRight } = setupCardPanel(
    card,
    nameInput,
    "Untitled"
  );
  const enabledToggle = buildEnabledToggleButton(enabledInput);
  summaryLeft.prepend(enabledToggle);
  summaryLeft.appendChild(enabledInput);
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const envLabel = document.createElement("label");
  envLabel.textContent = "Environment";
  const envSelect = document.createElement("select");
  envSelect.id = `shortcut-env-${shortcutKey}`;
  envSelect.className = "shortcut-env shortcut-field-input";
  envLabel.htmlFor = envSelect.id;
  envLabel.className = "shortcut-field-label";
  const envs = (options.envs || collectEnvConfigs()).filter((env) =>
    isEnabled(env.enabled)
  );
  for (const env of envs) {
    const opt = document.createElement("option");
    opt.value = env.id;
    opt.textContent = env.name;
    envSelect.appendChild(opt);
  }
  envSelect.value = shortcut.envId || (envs[0]?.id || "");

  const profileLabel = document.createElement("label");
  profileLabel.textContent = "Profile";
  const profileSelect = document.createElement("select");
  profileSelect.id = `shortcut-profile-${shortcutKey}`;
  profileSelect.className = "shortcut-profile shortcut-field-input";
  profileLabel.htmlFor = profileSelect.id;
  profileLabel.className = "shortcut-field-label";
  const profiles = (options.profiles || collectProfiles()).filter((profile) =>
    isEnabled(profile.enabled)
  );
  for (const p of profiles) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    profileSelect.appendChild(opt);
  }
  profileSelect.value = shortcut.profileId || (profiles[0]?.id || "");

  const taskLabel = document.createElement("label");
  taskLabel.textContent = "Task";
  const taskSelect = document.createElement("select");
  taskSelect.id = `shortcut-task-${shortcutKey}`;
  taskSelect.className = "shortcut-task shortcut-field-input";
  taskLabel.htmlFor = taskSelect.id;
  taskLabel.className = "shortcut-field-label";
  const tasks = (options.tasks || collectTasks()).filter((task) =>
    isEnabled(task.enabled)
  );
  for (const t of tasks) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    taskSelect.appendChild(opt);
  }
  taskSelect.value = shortcut.taskId || (tasks[0]?.id || "");
  const fieldsWrap = document.createElement("div");
  fieldsWrap.className = "shortcut-fields";
  fieldsWrap.appendChild(nameLabel);
  fieldsWrap.appendChild(envLabel);
  fieldsWrap.appendChild(profileLabel);
  fieldsWrap.appendChild(taskLabel);
  fieldsWrap.appendChild(nameInput);
  fieldsWrap.appendChild(envSelect);
  fieldsWrap.appendChild(profileSelect);
  fieldsWrap.appendChild(taskSelect);

  const actions = document.createElement("div");
  actions.className = "shortcut-actions";

  const moveTopBtn = document.createElement("button");
  moveTopBtn.type = "button";
  moveTopBtn.className = "ghost move-top";
  moveTopBtn.textContent = "Top";
  const moveUpBtn = document.createElement("button");
  moveUpBtn.type = "button";
  moveUpBtn.className = "ghost move-up";
  moveUpBtn.textContent = "Up";
  const moveDownBtn = document.createElement("button");
  moveDownBtn.type = "button";
  moveDownBtn.className = "ghost move-down";
  moveDownBtn.textContent = "Down";
  const addBelowBtn = document.createElement("button");
  addBelowBtn.type = "button";
  addBelowBtn.className = "accent add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = container.firstElementChild;
    if (!first || first === card) return;
    animateCardMove(card, () => {
      container.insertBefore(card, first);
    }, { scrollToCenter: true });
    updateShortcutControls(container);
    updateShortcutOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    animateCardMove(card, () => {
      container.insertBefore(card, previous);
    });
    updateShortcutControls(container);
    updateShortcutOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    animateCardMove(card, () => {
      container.insertBefore(card, next.nextElementSibling);
    });
    updateShortcutControls(container);
    updateShortcutOptions();
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueNumberedName(
      "New Shortcut",
      collectNames(container, ".shortcut-name")
    );
    const newCard = buildShortcutCard({
      id: newShortcutId(),
      name,
      envId: envSelect.value || envs[0]?.id || "",
      profileId: profileSelect.value || profiles[0]?.id || "",
      taskId: taskSelect.value || tasks[0]?.id || "",
      enabled: true
    }, container, options);
    card.insertAdjacentElement("afterend", newCard);
    openDetails(newCard);
    centerCardInView(newCard);
    updateShortcutOptions();
    updateShortcutControls(container);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateShortcutControls(container);
    updateShortcutOptions();
    scheduleSidebarErrors();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  body.appendChild(fieldsWrap);
  const moveControls = buildMoveControls("shortcuts", card, container);
  const getSourceData = () => ({
    id: card.dataset.id,
    name: nameInput.value || "Untitled Shortcut",
    envId: envSelect.value || "",
    profileId: profileSelect.value || "",
    taskId: taskSelect.value || "",
    enabled: enabledInput.checked
  });
  const duplicateControls = buildDuplicateControls("shortcuts", getSourceData, {
    onHere: () => {
      const sourceRect = card.getBoundingClientRect();
      const siteCard = container.closest(".site-card");
      const workspaceCard = container.closest(".workspace-card");
      const scope = siteCard
        ? getSiteScopeData(siteCard)
        : workspaceCard
          ? getWorkspaceScopeData(workspaceCard)
          : {
              envs: collectEnvConfigs().filter((env) => isEnabled(env.enabled)),
              profiles: collectProfiles().filter((profile) => isEnabled(profile.enabled)),
              tasks: collectTasks().filter((task) => isEnabled(task.enabled))
            };
      const newCard = buildDuplicateCard("shortcuts", getSourceData(), container, scope);
      if (!newCard) return;
      card.insertAdjacentElement("afterend", newCard);
      openDetails(newCard);
      animateDuplicateFromRect(newCard, sourceRect);
      updateShortcutOptions();
      updateShortcutControls(container);
      scheduleSidebarErrors();
      centerCardInViewAfterLayout(newCard);
    },
    sourceCard: card
  });
  actions.appendChild(moveControls);
  actions.appendChild(duplicateControls);
  actions.appendChild(addBelowBtn);
  actions.appendChild(deleteBtn);
  summaryRight.appendChild(actions);

  return card;
}

function updateShortcutControls(container = shortcutsContainer) {
  if (!container) return;
  const cards = [...container.querySelectorAll(".shortcut-card")];
  cards.forEach((card, index) => {
    const moveTopBtn = card.querySelector(".move-top");
    const moveUpBtn = card.querySelector(".move-up");
    const moveDownBtn = card.querySelector(".move-down");
    if (moveTopBtn) moveTopBtn.disabled = index === 0;
    if (moveUpBtn) moveUpBtn.disabled = index === 0;
    if (moveDownBtn) moveDownBtn.disabled = index === cards.length - 1;
  });
  scheduleSidebarErrors();
}

function updateTaskControls(container = tasksContainer) {
  const cards = [...container.querySelectorAll(".task-card")];
  cards.forEach((card, index) => {
    const moveTopBtn = card.querySelector(".move-top");
    const moveUpBtn = card.querySelector(".move-up");
    const moveDownBtn = card.querySelector(".move-down");
    if (moveTopBtn) moveTopBtn.disabled = index === 0;
    if (moveUpBtn) moveUpBtn.disabled = index === 0;
    if (moveDownBtn) moveDownBtn.disabled = index === cards.length - 1;
  });
  scheduleSidebarErrors();
}

function collectTasks(container = tasksContainer) {
  if (!container) return [];
  const cards = [...container.querySelectorAll(".task-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".task-name");
    const textArea = card.querySelector(".task-text");
    const envSelect = card.querySelector(".task-env-select");
    const profileSelect = card.querySelector(".task-profile-select");
    const enabledInput = card.querySelector(".config-enabled");
    return {
      id: card.dataset.id || newTaskId(),
      name: (nameInput?.value || "Untitled Task").trim(),
      text: (textArea?.value || "").trim(),
      defaultEnvId: envSelect?.value || "",
      defaultProfileId: profileSelect?.value || "",
      enabled: enabledInput ? enabledInput.checked : true
    };
  });
}

function updateSidebarErrors() {
  if (!sidebarErrorsEl) return;
  const errors = [];

  const tasks = collectTasks();
  const envs = collectEnvConfigs();
  const profiles = collectProfiles();
  const apiConfigs = collectApiConfigs();
  const apiKeys = collectApiKeys();
  const enabledTasks = tasks.filter((task) => isEnabled(task.enabled));
  const enabledEnvs = envs.filter((env) => isEnabled(env.enabled));
  const enabledProfiles = profiles.filter((profile) => isEnabled(profile.enabled));
  const enabledApiConfigs = apiConfigs.filter((config) => isEnabled(config.enabled));
  const enabledApiKeys = apiKeys.filter((key) => isEnabled(key.enabled));

  const checkNameInputs = (container, selector, label) => {
    if (!container) return;
    const inputs = [...container.querySelectorAll(selector)];
    if (!inputs.length) return;
    const seen = new Map();
    let hasEmpty = false;
    for (const input of inputs) {
      const card = input.closest(
        ".task-card, .env-config-card, .profile-card, .api-config-card, .api-key-card, .shortcut-card"
      );
      const enabledToggle = card?.querySelector(".config-enabled");
      if (enabledToggle && !enabledToggle.checked) {
        continue;
      }
      const name = (input.value || "").trim();
      if (!name) {
        hasEmpty = true;
        continue;
      }
      const lower = name.toLowerCase();
      seen.set(lower, (seen.get(lower) || 0) + 1);
    }
    if (hasEmpty) {
      errors.push(`${label} has empty names.`);
    }
    for (const [name, count] of seen.entries()) {
      if (count > 1) {
        errors.push(`${label} has duplicate name: ${name}.`);
      }
    }
  };

  checkNameInputs(tasksContainer, ".task-name", "Tasks");
  checkNameInputs(envConfigsContainer, ".env-config-name", "Environments");
  checkNameInputs(profilesContainer, ".profile-name", "Profiles");
  checkNameInputs(shortcutsContainer, ".shortcut-name", "Toolbar shortcuts");
  checkNameInputs(apiConfigsContainer, ".api-config-name", "API configs");
  checkNameInputs(apiKeysContainer, ".api-key-name", "API keys");
  checkNameInputs(workspacesContainer, ".workspace-name", "Workspaces");

  const workspaceCards = [
    ...workspacesContainer.querySelectorAll(".workspace-card")
  ];
  workspaceCards.forEach((card) => {
    const name = card.querySelector(".workspace-name")?.value || "Workspace";
    checkNameInputs(
      card.querySelector(".workspace-envs"),
      ".env-config-name",
      `${name} environments`
    );
    checkNameInputs(
      card.querySelector(".workspace-profiles"),
      ".profile-name",
      `${name} profiles`
    );
    checkNameInputs(
      card.querySelector(".workspace-tasks"),
      ".task-name",
      `${name} tasks`
    );
    checkNameInputs(
      card.querySelector(".workspace-shortcuts"),
      ".shortcut-name",
      `${name} shortcuts`
    );
  });

  const siteCards = [...sitesContainer.querySelectorAll(".site-card")];
  siteCards.forEach((card) => {
    const label =
      card.querySelector(".site-name")?.value ||
      card.querySelector(".site-pattern")?.value ||
      "Site";
    checkNameInputs(
      card.querySelector(".site-envs"),
      ".env-config-name",
      `${label} environments`
    );
    checkNameInputs(
      card.querySelector(".site-profiles"),
      ".profile-name",
      `${label} profiles`
    );
    checkNameInputs(
      card.querySelector(".site-tasks"),
      ".task-name",
      `${label} tasks`
    );
    checkNameInputs(
      card.querySelector(".site-shortcuts"),
      ".shortcut-name",
      `${label} shortcuts`
    );
    const extractInput = card.querySelector(".site-extract-selector");
    const { error } = parseExtractionTargetInput(extractInput?.value || "");
    if (error) {
      errors.push(`${label} site text selector: ${error}`);
    }
  });

  checkNameInputs(sitesContainer, ".site-name", "Sites");

  if (!enabledTasks.length) errors.push("No tasks enabled.");
  if (!enabledEnvs.length) errors.push("No environments enabled.");
  if (!enabledProfiles.length) errors.push("No profiles enabled.");
  if (!enabledApiConfigs.length) errors.push("No API configs enabled.");
  if (!enabledApiKeys.length) errors.push("No API keys enabled.");

  const validateTaskDefaults = (label, taskList, envList, profileList) => {
    const enabledEnvIds = new Set(
      envList.filter((env) => isEnabled(env.enabled)).map((env) => env.id)
    );
    const enabledProfileIds = new Set(
      profileList
        .filter((profile) => isEnabled(profile.enabled))
        .map((profile) => profile.id)
    );
    taskList.filter((task) => isEnabled(task.enabled)).forEach((task) => {
      const taskName = task.name || "Untitled Task";
      if (enabledEnvIds.size && !task.defaultEnvId) {
        errors.push(`${label} task "${taskName}" is missing a default environment.`);
      } else if (
        task.defaultEnvId &&
        enabledEnvIds.size &&
        !enabledEnvIds.has(task.defaultEnvId)
      ) {
        errors.push(
          `${label} task "${taskName}" default environment is disabled or missing.`
        );
      }
      if (enabledProfileIds.size && !task.defaultProfileId) {
        errors.push(`${label} task "${taskName}" is missing a default profile.`);
      } else if (
        task.defaultProfileId &&
        enabledProfileIds.size &&
        !enabledProfileIds.has(task.defaultProfileId)
      ) {
        errors.push(
          `${label} task "${taskName}" default profile is disabled or missing.`
        );
      }
    });
  };

  if (enabledTasks.length) {
    const defaultTask = enabledTasks[0];
    if (!defaultTask.text) errors.push("Default task prompt is empty.");

    const defaultEnv =
      enabledEnvs.find((env) => env.id === defaultTask.defaultEnvId) ||
      enabledEnvs[0];
    if (!defaultEnv) {
      errors.push("Default task environment is missing.");
    }

    const defaultProfile =
      enabledProfiles.find((profile) => profile.id === defaultTask.defaultProfileId) ||
      enabledProfiles[0];
    if (!defaultProfile) {
      errors.push("Default task profile is missing.");
    } else if (!defaultProfile.text) {
      errors.push("Default profile text is empty.");
    }

    const defaultApiConfig = defaultEnv
      ? enabledApiConfigs.find((config) => config.id === defaultEnv.apiConfigId)
      : null;
    if (!defaultApiConfig) {
      errors.push("Default environment is missing an API config.");
    } else if (defaultApiConfig.advanced) {
      if (!isValidTemplateJson(defaultApiConfig.requestTemplate || "")) {
        errors.push("Default API config request template is invalid JSON.");
      }
    } else {
      if (!defaultApiConfig.apiBaseUrl) {
        errors.push("Default API config is missing a base URL.");
      }
      if (!defaultApiConfig.model) {
        errors.push("Default API config is missing a model name.");
      }
    }

    if (defaultApiConfig && !defaultApiConfig.advanced) {
      const key = enabledApiKeys.find(
        (entry) => entry.id === defaultApiConfig?.apiKeyId
      );
      if (!key || !key.key) {
        errors.push("Default API config is missing an API key.");
      }
    }
  }

  validateTaskDefaults("Global", tasks, envs, profiles);

  workspaceCards.forEach((card) => {
    const name =
      card.querySelector(".workspace-name")?.value || "Untitled Workspace";
    const scope = getWorkspaceScopeData(card);
    const scopedTasks = collectTasks(card.querySelector(".workspace-tasks"));
    validateTaskDefaults(`Workspace "${name}"`, scopedTasks, scope.envs, scope.profiles);
  });

  siteCards.forEach((card) => {
    const name =
      card.querySelector(".site-name")?.value ||
      card.querySelector(".site-pattern")?.value ||
      "Untitled Site";
    const scope = getSiteScopeData(card);
    const scopedTasks = collectTasks(card.querySelector(".site-tasks"));
    validateTaskDefaults(`Site "${name}"`, scopedTasks, scope.envs, scope.profiles);
  });

  const sites = collectSites();
  const patterns = siteCards
    .map((card) => (card.querySelector(".site-pattern")?.value || "").trim())
    .filter(Boolean);
  for (let i = 0; i < patterns.length; i += 1) {
    for (let j = 0; j < patterns.length; j += 1) {
      if (i === j) continue;
      if (patterns[j].includes(patterns[i])) {
        errors.push(
          `Site URL pattern "${patterns[i]}" is a substring of "${patterns[j]}".`
        );
        break;
      }
    }
  }

  workspaceCards.forEach((card) => {
    const list = card.querySelector(".workspace-sites-list");
    if (!list) return;
    renderWorkspaceSitesList(list, card.dataset.id, sites);
  });

  if (!errors.length) {
    sidebarErrorsEl.classList.add("hidden");
    sidebarErrorsEl.textContent = "";
    renderGlobalSitesList(sites);
    return;
  }

  sidebarErrorsEl.textContent = errors.map((error) => `- ${error}`).join("\n");
  sidebarErrorsEl.classList.remove("hidden");
  renderGlobalSitesList(sites);
}

async function loadSettings() {
  let {
    apiKey = "",
    apiKeys = [],
    activeApiKeyId = "",
    apiConfigs = [],
    activeApiConfigId = "",
    envConfigs = [],
    activeEnvConfigId = "",
    profiles = [],
    apiBaseUrl = "",
    model = "",
    systemPrompt = "",
    resume = "",
    tasks = [],
    shortcuts = [],
    presets: legacyPresets = [],
    theme = "system",
    workspaces = [],
    sites = [],
    toolbarPosition = "bottom-right",
    toolbarAutoHide: storedToolbarAutoHide = true,
    alwaysShowOutput: storedAlwaysShowOutput = false,
    sidebarWidth
  } = await getStorage([
    "apiKey",
    "apiKeys",
    "activeApiKeyId",
    "apiConfigs",
    "activeApiConfigId",
    "envConfigs",
    "activeEnvConfigId",
    "profiles",
    "apiBaseUrl",
    "model",
    "systemPrompt",
    "resume",
    "tasks",
    "shortcuts",
    "presets",
    "theme",
    "workspaces",
    "sites",
    "toolbarPosition",
    "toolbarAutoHide",
    SIDEBAR_WIDTH_KEY
  ]);

  themeSelect.value = theme;
  applyTheme(theme);
  
  if (toolbarPositionSelect) {
    toolbarPositionSelect.value = toolbarPosition;
  }
  if (toolbarAutoHide) {
    toolbarAutoHide.checked = Boolean(storedToolbarAutoHide);
  }
  if (alwaysShowOutput) {
    alwaysShowOutput.checked = Boolean(storedAlwaysShowOutput);
  }
  if (Number.isFinite(sidebarWidth)) {
    applySidebarWidth(sidebarWidth);
  }

  if (!shortcuts.length && Array.isArray(legacyPresets) && legacyPresets.length) {
    shortcuts = legacyPresets;
    await chrome.storage.local.set({ shortcuts });
    await chrome.storage.local.remove("presets");
  }

  if (Array.isArray(workspaces)) {
    let needsWorkspaceUpdate = false;
    const normalizedWorkspaces = workspaces.map((workspace) => {
      if (!workspace || typeof workspace !== "object") return workspace;
      const { presets, shortcuts: wsShortcuts, ...rest } = workspace;
      const resolvedShortcuts =
        Array.isArray(wsShortcuts) && wsShortcuts.length
          ? wsShortcuts
          : Array.isArray(presets)
            ? presets
            : [];
      if (presets !== undefined || wsShortcuts === undefined) {
        needsWorkspaceUpdate = true;
      }
      return { ...rest, shortcuts: resolvedShortcuts };
    });
    if (needsWorkspaceUpdate) {
      await chrome.storage.local.set({ workspaces: normalizedWorkspaces });
    }
    workspaces = normalizedWorkspaces.map((workspace) => {
      if (!workspace || typeof workspace !== "object") return workspace;
      return {
        ...workspace,
        theme: workspace.theme || "inherit",
        toolbarPosition: workspace.toolbarPosition || "inherit",
        envConfigs: normalizeConfigList(workspace.envConfigs),
        profiles: normalizeConfigList(workspace.profiles),
        tasks: normalizeConfigList(workspace.tasks),
        shortcuts: normalizeConfigList(workspace.shortcuts),
        disabledInherited: normalizeDisabledInherited(workspace.disabledInherited)
      };
    });
  }

  if (Array.isArray(sites)) {
    let needsSiteUpdate = false;
    sites = sites.map((site) => {
      if (!site || typeof site !== "object") return site;
      const normalizedTarget = normalizeStoredExtractionTarget(site);
      if (normalizedTarget.changed) {
        needsSiteUpdate = true;
      }
      return {
        ...site,
        name: site.name || site.urlPattern || "",
        workspaceId: site.workspaceId || "global",
        extractTarget: normalizedTarget.target,
        theme: site.theme || "inherit",
        toolbarPosition: site.toolbarPosition || "inherit",
        envConfigs: normalizeConfigList(site.envConfigs),
        profiles: normalizeConfigList(site.profiles),
        tasks: normalizeConfigList(site.tasks),
        shortcuts: normalizeConfigList(site.shortcuts),
        disabledInherited: normalizeDisabledInherited(site.disabledInherited)
      };
    });
    if (needsSiteUpdate) {
      await chrome.storage.local.set({ sites });
    }
  }
  initialSiteIds = new Set((sites || []).map((site) => site?.id).filter(Boolean));

  // Load basic resources first so they are available for shortcuts/workspaces
  envConfigsContainer.innerHTML = "";
  // ... (existing logic handles this later)

  // Wait, I need to make sure collectEnvConfigs etc work. 
  // loadSettings currently renders cards later in the function.
  // I need to ensure render order.
  
  // Actually, loadSettings renders cards in order. I should just add shortcuts rendering at the end.
  
  // I'll render shortcuts after tasks are rendered.
  
  let resolvedKeys = Array.isArray(apiKeys) ? apiKeys : [];
  let resolvedActiveId = activeApiKeyId;

  if (!resolvedKeys.length && apiKey) {
    const migrated = {
      id: newApiKeyId(),
      name: "Default",
      key: apiKey,
      enabled: true
    };
    resolvedKeys = [migrated];
    resolvedActiveId = migrated.id;
    await chrome.storage.local.set({
      apiKeys: resolvedKeys,
      activeApiKeyId: resolvedActiveId
    });
  } else if (resolvedKeys.length) {
    const normalized = resolvedKeys.map((entry) => ({
      ...entry,
      enabled: entry.enabled !== false
    }));
    if (normalized.some((entry, index) => entry.enabled !== resolvedKeys[index]?.enabled)) {
      resolvedKeys = normalized;
      await chrome.storage.local.set({ apiKeys: resolvedKeys });
    } else {
      resolvedKeys = normalized;
    }
    const hasActive = resolvedKeys.some((entry) => entry.id === resolvedActiveId);
    if (!hasActive) {
      resolvedActiveId = resolvedKeys[0].id;
      await chrome.storage.local.set({ activeApiKeyId: resolvedActiveId });
    }
  }

  apiKeysContainer.innerHTML = "";
  if (!resolvedKeys.length) {
    apiKeysContainer.appendChild(
      buildApiKeyCard({ id: newApiKeyId(), name: "", key: "" })
    );
  } else {
    for (const entry of resolvedKeys) {
      apiKeysContainer.appendChild(buildApiKeyCard(entry));
    }
  }
  updateApiKeyControls();

  let resolvedConfigs = Array.isArray(apiConfigs) ? apiConfigs : [];
  let resolvedActiveConfigId = activeApiConfigId;

  if (!resolvedConfigs.length) {
    const migrated = {
      id: newApiConfigId(),
      name: "Default",
      apiBaseUrl: apiBaseUrl || OPENAI_DEFAULTS.apiBaseUrl,
      model: model || DEFAULT_MODEL,
      apiKeyId: resolvedActiveId || resolvedKeys[0]?.id || "",
      apiUrl: "",
      requestTemplate: "",
      advanced: false,
      enabled: true
    };
    resolvedConfigs = [migrated];
    resolvedActiveConfigId = migrated.id;
    await chrome.storage.local.set({
      apiConfigs: resolvedConfigs,
      activeApiConfigId: resolvedActiveConfigId
    });
  } else {
    const fallbackKeyId = resolvedActiveId || resolvedKeys[0]?.id || "";
    const withKeys = resolvedConfigs.map((config) => ({
      ...config,
      apiKeyId: config.apiKeyId || fallbackKeyId,
      apiUrl: config.apiUrl || "",
      requestTemplate: config.requestTemplate || "",
      advanced: Boolean(config.advanced),
      enabled: config.enabled !== false
    }));
    if (
      withKeys.some(
        (config, index) =>
          config.apiKeyId !== resolvedConfigs[index].apiKeyId ||
          config.enabled !== resolvedConfigs[index].enabled
      )
    ) {
      resolvedConfigs = withKeys;
      await chrome.storage.local.set({ apiConfigs: resolvedConfigs });
    }
    const hasActive = resolvedConfigs.some(
      (config) => config.id === resolvedActiveConfigId
    );
    if (!hasActive) {
      resolvedActiveConfigId = resolvedConfigs[0].id;
      await chrome.storage.local.set({ activeApiConfigId: resolvedActiveConfigId });
    }
  }

  apiConfigsContainer.innerHTML = "";
  for (const config of resolvedConfigs) {
    apiConfigsContainer.appendChild(buildApiConfigCard(config));
  }
  updateApiConfigKeyOptions();
  updateApiConfigControls();

  let resolvedEnvConfigs = Array.isArray(envConfigs) ? envConfigs : [];
  const fallbackApiConfigId =
    resolvedActiveConfigId || resolvedConfigs[0]?.id || "";

  if (!resolvedEnvConfigs.length) {
    const migrated = {
      id: newEnvConfigId(),
      name: "Default",
      apiConfigId: fallbackApiConfigId,
      systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
      enabled: true
    };
    resolvedEnvConfigs = [migrated];
    await chrome.storage.local.set({
      envConfigs: resolvedEnvConfigs,
      activeEnvConfigId: migrated.id
    });
  } else {
    const withDefaults = resolvedEnvConfigs.map((config) => ({
      ...config,
      apiConfigId: config.apiConfigId || fallbackApiConfigId,
      systemPrompt: config.systemPrompt ?? "",
      enabled: config.enabled !== false
    }));
    const needsUpdate = withDefaults.some((config, index) => {
      const original = resolvedEnvConfigs[index];
      return (
        config.apiConfigId !== original.apiConfigId ||
        (config.systemPrompt || "") !== (original.systemPrompt || "") ||
        config.enabled !== original.enabled
      );
    });
    if (needsUpdate) {
      resolvedEnvConfigs = withDefaults;
      await chrome.storage.local.set({ envConfigs: resolvedEnvConfigs });
    }
    const hasActive = resolvedEnvConfigs.some(
      (config) => config.id === activeEnvConfigId
    );
    if (!hasActive && resolvedEnvConfigs.length) {
      await chrome.storage.local.set({
        activeEnvConfigId: resolvedEnvConfigs[0].id
      });
    }
  }

  envConfigsContainer.innerHTML = "";
  for (const config of resolvedEnvConfigs) {
    envConfigsContainer.appendChild(buildEnvConfigCard(config));
  }
  updateEnvApiOptions();
  updateEnvControls();

  let resolvedProfiles = Array.isArray(profiles) ? profiles : [];
  if (!resolvedProfiles.length) {
    const migrated = {
      id: newProfileId(),
      name: "Default",
      text: resume || "",
      type: "Resume",
      enabled: true
    };
    resolvedProfiles = [migrated];
    await chrome.storage.local.set({ profiles: resolvedProfiles });
  } else {
    const normalized = resolvedProfiles.map((profile) => ({
      ...profile,
      text: profile.text ?? "",
      type: profile.type === "Profile" ? "Profile" : "Resume",
      enabled: profile.enabled !== false
    }));
    const needsUpdate = normalized.some(
      (profile, index) =>
        (profile.text || "") !== (resolvedProfiles[index]?.text || "") ||
        (profile.type || "Resume") !== (resolvedProfiles[index]?.type || "Resume") ||
        profile.enabled !== resolvedProfiles[index]?.enabled
    );
    if (needsUpdate) {
      resolvedProfiles = normalized;
      await chrome.storage.local.set({ profiles: resolvedProfiles });
    }
  }

  profilesContainer.innerHTML = "";
  for (const profile of resolvedProfiles) {
    profilesContainer.appendChild(buildProfileCard(profile));
  }
  updateProfileControls();

  tasksContainer.innerHTML = "";
  const defaultEnvId = resolvedEnvConfigs[0]?.id || "";
  const defaultProfileId = resolvedProfiles[0]?.id || "";
  const normalizedTasks = Array.isArray(tasks)
    ? tasks.map((task) => ({
        ...task,
        defaultEnvId: task.defaultEnvId || defaultEnvId,
        defaultProfileId: task.defaultProfileId || defaultProfileId,
        enabled: task.enabled !== false
      }))
    : [];
  if (
    normalizedTasks.length &&
    normalizedTasks.some(
      (task, index) =>
        task.defaultEnvId !== tasks[index]?.defaultEnvId ||
        task.defaultProfileId !== tasks[index]?.defaultProfileId ||
        task.enabled !== tasks[index]?.enabled
    )
  ) {
    await chrome.storage.local.set({ tasks: normalizedTasks });
  }

  if (!normalizedTasks.length) {
    tasksContainer.appendChild(
      buildTaskCard({
        id: newTaskId(),
        name: "",
        text: "",
        defaultEnvId,
        defaultProfileId
      })
    );
    updateTaskControls();
    updateTaskEnvOptions();
    updateTaskProfileOptions();
    return;
  }

  for (const task of normalizedTasks) {
    tasksContainer.appendChild(buildTaskCard(task));
  }
  updateTaskControls();
  updateTaskEnvOptions();
  updateTaskProfileOptions();

  const normalizedShortcuts = Array.isArray(shortcuts)
    ? shortcuts.map((shortcut) => ({
        ...shortcut,
        enabled: shortcut.enabled !== false
      }))
    : [];
  shortcuts = normalizedShortcuts;
  if (
    normalizedShortcuts.length &&
    normalizedShortcuts.some(
      (shortcut, index) => shortcut.enabled !== shortcuts[index]?.enabled
    )
  ) {
    await chrome.storage.local.set({ shortcuts: normalizedShortcuts });
  }

  shortcutsContainer.innerHTML = "";
  for (const shortcut of normalizedShortcuts) {
    shortcutsContainer.appendChild(buildShortcutCard(shortcut));
  }
  updateShortcutControls();

  workspacesContainer.innerHTML = "";
  for (const ws of workspaces) {
    workspacesContainer.appendChild(buildWorkspaceCard(ws, workspaces, sites));
  }

  sitesContainer.innerHTML = "";
  for (const site of sites) {
    sitesContainer.appendChild(buildSiteCard(site, workspaces));
  }

  updateEnvApiOptions();
  refreshWorkspaceInheritedLists();
  refreshSiteInheritedLists();
  updateSidebarErrors();
  updateToc(workspaces, sites);
  renderGlobalSitesList(sites);
}

async function saveSettings() {
  try {
    const tasks = collectTasks();
    const shortcuts = collectShortcuts();
    const apiKeys = collectApiKeys();
    const apiConfigs = collectApiConfigs();
    const envConfigs = collectEnvConfigs();
    const profiles = collectProfiles();
    const workspaces = collectWorkspaces();
    const sites = collectSites();
    const previous = await getStorage([
      "apiConfigs",
      "envConfigs",
      "profiles",
      "tasks",
      "shortcuts",
      "workspaces",
      "sites"
    ]);
    const previousWorkspaces = Array.isArray(previous.workspaces)
      ? previous.workspaces
      : [];
    const globalRenameMaps = {
      envs: buildRenameMap(previous.envConfigs, envConfigs),
      profiles: buildRenameMap(previous.profiles, profiles),
      tasks: buildRenameMap(previous.tasks, tasks),
      shortcuts: buildRenameMap(previous.shortcuts, shortcuts)
    };
    const previousWorkspaceById = new Map(
      previousWorkspaces.map((workspace) => [workspace.id, workspace])
    );
    const workspaceRenameMaps = new Map(
      workspaces.map((workspace) => {
        const previousWorkspace = previousWorkspaceById.get(workspace.id);
        return [
          workspace.id,
          {
            envs: buildRenameMap(previousWorkspace?.envConfigs, workspace.envConfigs),
            profiles: buildRenameMap(previousWorkspace?.profiles, workspace.profiles),
            tasks: buildRenameMap(previousWorkspace?.tasks, workspace.tasks),
            shortcuts: buildRenameMap(
              previousWorkspace?.shortcuts,
              workspace.shortcuts
            )
          }
        ];
      })
    );
    const updatedWorkspaces = workspaces.map((workspace) => {
      const disabled = workspace.disabledInherited || {};
      return {
        ...workspace,
        disabledInherited: {
          ...disabled,
          envs: applyRenameMaps(disabled.envs, [globalRenameMaps.envs]),
          profiles: applyRenameMaps(disabled.profiles, [globalRenameMaps.profiles]),
          tasks: applyRenameMaps(disabled.tasks, [globalRenameMaps.tasks]),
          shortcuts: applyRenameMaps(disabled.shortcuts, [globalRenameMaps.shortcuts]),
          apiConfigs: filterDisabledIds(disabled.apiConfigs, apiConfigs)
        }
      };
    });
    const updatedSites = sites.map((site) => {
      const workspaceId = site.workspaceId || "global";
      const maps = workspaceRenameMaps.get(workspaceId) || {};
      const disabled = site.disabledInherited || {};
      return {
        ...site,
        disabledInherited: {
          ...disabled,
          envs: applyRenameMaps(disabled.envs, [
            globalRenameMaps.envs,
            maps.envs
          ]),
          profiles: applyRenameMaps(disabled.profiles, [
            globalRenameMaps.profiles,
            maps.profiles
          ]),
          tasks: applyRenameMaps(disabled.tasks, [
            globalRenameMaps.tasks,
            maps.tasks
          ]),
          shortcuts: applyRenameMaps(disabled.shortcuts, [
            globalRenameMaps.shortcuts,
            maps.shortcuts
          ]),
          apiConfigs: filterDisabledIds(disabled.apiConfigs, apiConfigs)
        }
      };
    });
    const storedSites = Array.isArray(previous.sites) ? previous.sites : [];
    const mergedSites = [...updatedSites];
    const mergedIds = new Set(updatedSites.map((site) => site.id));
    storedSites.forEach((site) => {
      if (!site?.id) return;
      if (mergedIds.has(site.id)) return;
      if (initialSiteIds.has(site.id)) return;
      mergedIds.add(site.id);
      mergedSites.push(site);
    });
    const activeEnvConfigId = envConfigs[0]?.id || "";
    const activeEnv = envConfigs[0];
    const activeApiConfigId =
      activeEnv?.apiConfigId || apiConfigs[0]?.id || "";
    const activeConfig = apiConfigs.find(
      (entry) => entry.id === activeApiConfigId
    );
    const activeApiKeyId =
      activeConfig?.apiKeyId ||
      apiKeys[0]?.id ||
      "";
    await chrome.storage.local.set({
      apiKeys,
      activeApiKeyId,
      apiConfigs,
      activeApiConfigId,
      envConfigs,
      activeEnvConfigId,
      systemPrompt: activeEnv?.systemPrompt || "",
      profiles,
      tasks,
      shortcuts,
      theme: themeSelect.value,
      toolbarPosition: toolbarPositionSelect
        ? toolbarPositionSelect.value
        : "bottom-right",
      toolbarAutoHide: toolbarAutoHide ? toolbarAutoHide.checked : true,
      alwaysShowOutput: alwaysShowOutput ? alwaysShowOutput.checked : false,
      workspaces: updatedWorkspaces,
      sites: mergedSites
    });
    await chrome.storage.local.remove("presets");
    captureSavedSnapshot();
    setStatus("Saved.");
  } catch (error) {
    console.error("Save failed:", error);
    setStatus("Save failed. Check console.");
  }
}

if (saveBtnSidebar) {
  saveBtnSidebar.addEventListener("click", () => void saveSettings());
}
addTaskBtn.addEventListener("click", () => {
  openDetails(addTaskBtn.closest("details"));
  const name = buildUniqueNumberedName(
    "New Task",
    collectNames(tasksContainer, ".task-name")
  );
  const newCard = buildTaskCard({
    id: newTaskId(),
    name,
    text: "",
    defaultEnvId: getTopEnvId(),
    defaultProfileId: getTopProfileId()
  }, tasksContainer);
  const first = tasksContainer.firstElementChild;
  if (first) {
    tasksContainer.insertBefore(newCard, first);
  } else {
    tasksContainer.appendChild(newCard);
  }
  openDetails(newCard);
  centerCardInView(newCard);
  updateTaskControls(tasksContainer);
  updateTaskEnvOptions();
  updateTaskProfileOptions();
});

addApiKeyBtn.addEventListener("click", () => {
  openDetails(addApiKeyBtn.closest("details"));
  const name = buildUniqueDefaultName(
    collectNames(apiKeysContainer, ".api-key-name")
  );
  const newCard = buildApiKeyCard({ id: newApiKeyId(), name, key: "" });
  const first = apiKeysContainer.firstElementChild;
  if (first) {
    apiKeysContainer.insertBefore(newCard, first);
  } else {
    apiKeysContainer.appendChild(newCard);
  }
  openDetails(newCard);
  centerCardInView(newCard);
  updateApiConfigKeyOptions();
  updateApiKeyControls();
});

addApiConfigBtn.addEventListener("click", () => {
  openDetails(addApiConfigBtn.closest("details"));
  const name = buildUniqueNumberedName(
    "New API",
    collectNames(apiConfigsContainer, ".api-config-name")
  );
  const newCard = buildApiConfigCard({
    id: newApiConfigId(),
    name,
    apiBaseUrl: OPENAI_DEFAULTS.apiBaseUrl,
    model: DEFAULT_MODEL,
    apiUrl: "",
    requestTemplate: "",
    advanced: false
  });
  const first = apiConfigsContainer.firstElementChild;
  if (first) {
    apiConfigsContainer.insertBefore(newCard, first);
  } else {
    apiConfigsContainer.appendChild(newCard);
  }
  openDetails(newCard);
  centerCardInView(newCard);
  updateApiConfigKeyOptions();
  updateEnvApiOptions();
  updateApiConfigControls();
});

addEnvConfigBtn.addEventListener("click", () => {
  openDetails(addEnvConfigBtn.closest("details"));
  const name = buildUniqueNumberedName(
    "New Environment",
    collectNames(envConfigsContainer, ".env-config-name")
  );
  const fallbackApiConfigId =
    getApiConfigsForEnvContainer(envConfigsContainer)[0]?.id || "";
  const newCard = buildEnvConfigCard({
    id: newEnvConfigId(),
    name,
    apiConfigId: fallbackApiConfigId,
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  });
  const first = envConfigsContainer.firstElementChild;
  if (first) {
    envConfigsContainer.insertBefore(newCard, first);
  } else {
    envConfigsContainer.appendChild(newCard);
  }
  openDetails(newCard);
  centerCardInView(newCard);
  updateEnvApiOptions();
  updateEnvControls();
  updateTaskEnvOptions();
});

addProfileBtn.addEventListener("click", () => {
  openDetails(addProfileBtn.closest("details"));
  const name = buildUniqueNumberedName(
    "New Profile",
    collectNames(profilesContainer, ".profile-name")
  );
  const newCard = buildProfileCard({
    id: newProfileId(),
    name,
    text: ""
  }, profilesContainer);
  const first = profilesContainer.firstElementChild;
  if (first) {
    profilesContainer.insertBefore(newCard, first);
  } else {
    profilesContainer.appendChild(newCard);
  }
  openDetails(newCard);
  centerCardInView(newCard);
  updateProfileControls(profilesContainer);
  updateTaskProfileOptions();
});

addWorkspaceBtn.addEventListener("click", () => {
  openDetails(addWorkspaceBtn.closest("details"));
  const newCard = buildWorkspaceCard({
    id: newWorkspaceId(),
    name: "New Workspace",
    theme: "inherit",
    toolbarPosition: "inherit",
    envConfigs: [],
    profiles: [],
    tasks: [],
    shortcuts: [],
    disabledInherited: normalizeDisabledInherited()
  }, collectWorkspaces(), collectSites());
  const first = workspacesContainer.firstElementChild;
  if (first) {
    workspacesContainer.insertBefore(newCard, first);
  } else {
    workspacesContainer.appendChild(newCard);
  }
  openDetails(newCard);
  centerCardInView(newCard);
  refreshWorkspaceInheritedLists();
  scheduleSidebarErrors();
  updateToc(collectWorkspaces(), collectSites());
});

addSiteBtn.addEventListener("click", () => {
  openDetails(addSiteBtn.closest("details"));
  const newCard = buildSiteCard({
    id: newSiteId(),
    name: "",
    urlPattern: "",
    workspaceId: "global",
    theme: "inherit",
    toolbarPosition: "inherit",
    envConfigs: [],
    profiles: [],
    tasks: [],
    shortcuts: [],
    disabledInherited: normalizeDisabledInherited()
  }, collectWorkspaces());
  const first = sitesContainer.firstElementChild;
  if (first) {
    sitesContainer.insertBefore(newCard, first);
  } else {
    sitesContainer.appendChild(newCard);
  }
  openDetails(newCard);
  centerCardInView(newCard);
  refreshSiteInheritedLists();
  scheduleSidebarErrors();
  updateToc(collectWorkspaces(), collectSites());
});

addShortcutBtn.addEventListener("click", () => {
  openDetails(addShortcutBtn.closest("details"));
  const name = buildUniqueNumberedName(
    "New Shortcut",
    collectNames(shortcutsContainer, ".shortcut-name")
  );
  const newCard = buildShortcutCard({
    id: newShortcutId(),
    name,
    envId: "",
    profileId: "",
    taskId: ""
  });
  const first = shortcutsContainer.firstElementChild;
  if (first) {
    shortcutsContainer.insertBefore(newCard, first);
  } else {
    shortcutsContainer.appendChild(newCard);
  }
  openDetails(newCard);
  centerCardInView(newCard);
  updateShortcutOptions();
  updateShortcutControls();
  scheduleSidebarErrors();
});

themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
initSidebarResize();

document.addEventListener("click", (event) => {
  const summary = event.target.closest("summary.panel-summary");
  if (!summary) return;
  if (event.target.closest("button")) {
    event.preventDefault();
    event.stopPropagation();
  }
});

async function initSettings() {
  suppressDirtyTracking = true;
  await loadSettingsViewState();
  await loadSettings();
  initToc();
  registerAllDetails();
  restoreScrollPosition();
  initDirtyObserver();
  captureSavedSnapshot();
  suppressDirtyTracking = false;
  window.addEventListener("scroll", handleSettingsScroll, { passive: true });
}

void initSettings();

function openDetailsChain(target) {
  let node = target;
  while (node) {
    if (node.tagName === "DETAILS") {
      node.open = true;
    }
    node = node.parentElement?.closest("details");
  }
}

function renderTocCardList(listEl, cards, nameSelector, fallbackLabel, onClick) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const items = Array.from(cards || []);
  items.forEach((card, index) => {
    const name =
      card.querySelector(nameSelector)?.value?.trim() ||
      `${fallbackLabel} ${index + 1}`;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = name;
    const cardClass =
      [...(card?.classList || [])].find((cls) => cls.endsWith("-card")) ||
      card?.classList?.[0] ||
      "";
    if (cardClass && card?.dataset?.id) {
      a.dataset.tocTargetSelector = `.${cardClass}[data-id="${card.dataset.id}"]`;
    }
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof onClick === "function") {
        onClick(card);
      }
    });
    li.appendChild(a);
    listEl.appendChild(li);
  });
}

function updateToc(workspaces, sites) {
  const wsList = document.getElementById("toc-workspaces-list");
  if (!wsList) return;
  const existingGroups = wsList.querySelectorAll("details.toc-group");
  existingGroups.forEach((group) => {
    const key = getDetailStateKey(group);
    if (!key) return;
    settingsViewState.open[key] = group.open;
  });
  scheduleSettingsViewStateSave();

  wsList.innerHTML = "";
  for (const ws of workspaces) {
    const li = document.createElement("li");
    const details = document.createElement("details");
    details.className = "toc-group toc-workspace";
    details.dataset.stateKey = `toc:workspace:${ws.id}`;
    const summary = document.createElement("summary");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = ws.name || "Untitled";
    a.dataset.tocTargetSelector = `.workspace-card[data-id="${ws.id}"]`;
    summary.appendChild(a);
    details.appendChild(summary);

    const subUl = document.createElement("ul");
    subUl.className = "toc-sub";
    const sectionConfigs = [
      { label: "Appearance" },
      { label: "API Configurations" },
      {
        label: "Environments",
        module: "envs",
        containerSelector: ".workspace-envs",
        cardSelector: ".env-config-card",
        nameSelector: ".env-config-name",
        fallback: "Environment"
      },
      {
        label: "Profiles",
        module: "profiles",
        containerSelector: ".workspace-profiles",
        cardSelector: ".profile-card",
        nameSelector: ".profile-name",
        fallback: "Profile"
      },
      {
        label: "Tasks",
        module: "tasks",
        containerSelector: ".workspace-tasks",
        cardSelector: ".task-card",
        nameSelector: ".task-name",
        fallback: "Task"
      },
      {
        label: "Toolbar Shortcuts",
        module: "shortcuts",
        containerSelector: ".workspace-shortcuts",
        cardSelector: ".shortcut-card",
        nameSelector: ".shortcut-name",
        fallback: "Shortcut"
      },
      { label: "Sites" }
    ];
    for (const section of sectionConfigs) {
      const subLi = document.createElement("li");
      const link = document.createElement("a");
      link.textContent = section.label;
      link.href = "#";
      const sectionKey = section.module
        ? `workspace:${ws.id}:${section.module}`
        : section.label === "Appearance"
          ? `workspace:${ws.id}:appearance`
          : section.label === "API Configurations"
            ? `workspace:${ws.id}:apiConfigs`
            : section.label === "Sites"
              ? `workspace:${ws.id}:sites`
              : "";
      if (sectionKey) {
        link.dataset.tocTargetSelector = `.workspace-card[data-id="${ws.id}"] details[data-state-key="${sectionKey}"]`;
      }
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = document.querySelector(`.workspace-card[data-id="${ws.id}"]`);
        if (card) {
          const details = [...card.querySelectorAll("details")].find((d) => {
            const heading = d.querySelector(".panel-summary h3, .panel-summary h2");
            return heading && heading.textContent.trim() === section.label;
          });
          if (details) {
            openDetailsChain(details);
            details.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            card.scrollIntoView({ behavior: "smooth", block: "start" });
            openDetailsChain(document.getElementById("workspaces-panel"));
          }
        }
      });
      if (section.module) {
        const details = document.createElement("details");
        details.className = "toc-group toc-section";
        details.dataset.stateKey = `toc:workspace:${ws.id}:${section.module}`;
        const summary = document.createElement("summary");
        summary.appendChild(link);
        details.appendChild(summary);
        const card = document.querySelector(`.workspace-card[data-id="${ws.id}"]`);
        const container = card?.querySelector(section.containerSelector);
        const list = document.createElement("ul");
        list.className = "toc-sub toc-cards";
        renderTocCardList(
          list,
          container?.querySelectorAll(section.cardSelector) || [],
          section.nameSelector,
          section.fallback,
          (target) => {
            openDetailsChain(target);
            centerCardInView(target);
          }
        );
        details.appendChild(list);
        subLi.appendChild(details);
        registerDetail(details, false);
      } else {
        subLi.appendChild(link);
      }
      subUl.appendChild(subLi);
    }
    
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = document.querySelector(`.workspace-card[data-id="${ws.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        openDetailsChain(document.getElementById("workspaces-panel"));
      }
      details.open = true;
    });

    details.appendChild(subUl);
    li.appendChild(details);
    wsList.appendChild(li);
    registerDetail(details, false);
  }
  
  const sitesList = document.getElementById("toc-sites-list");
  if (sitesList) {
    const existingSiteGroups = sitesList.querySelectorAll("details.toc-group");
    existingSiteGroups.forEach((group) => {
      const key = getDetailStateKey(group);
      if (!key) return;
      settingsViewState.open[key] = group.open;
    });
    scheduleSettingsViewStateSave();

    sitesList.innerHTML = "";
    for (const site of sites) {
      const li = document.createElement("li");
      const details = document.createElement("details");
      details.className = "toc-group toc-site";
      details.dataset.stateKey = `toc:site:${site.id}`;
      const summary = document.createElement("summary");
      const a = document.createElement("a");
      a.textContent = site.name || site.urlPattern || "Untitled Site";
      a.href = "#";
      a.dataset.tocTargetSelector = `.site-card[data-id="${site.id}"]`;
      summary.appendChild(a);
      details.appendChild(summary);

      const subUl = document.createElement("ul");
      subUl.className = "toc-sub";
      const sectionConfigs = [
        { label: "Appearance" },
        { label: "API Configurations" },
        {
          label: "Environments",
          module: "envs",
          containerSelector: ".site-envs",
          cardSelector: ".env-config-card",
          nameSelector: ".env-config-name",
          fallback: "Environment"
        },
        {
          label: "Profiles",
          module: "profiles",
          containerSelector: ".site-profiles",
          cardSelector: ".profile-card",
          nameSelector: ".profile-name",
          fallback: "Profile"
        },
        {
          label: "Tasks",
          module: "tasks",
          containerSelector: ".site-tasks",
          cardSelector: ".task-card",
          nameSelector: ".task-name",
          fallback: "Task"
        },
        {
          label: "Toolbar Shortcuts",
          module: "shortcuts",
          containerSelector: ".site-shortcuts",
          cardSelector: ".shortcut-card",
          nameSelector: ".shortcut-name",
          fallback: "Shortcut"
        }
      ];
      for (const section of sectionConfigs) {
        const subLi = document.createElement("li");
        const link = document.createElement("a");
        link.textContent = section.label;
        link.href = "#";
        const sectionKey = section.module
          ? `site:${site.id}:${section.module}`
          : section.label === "Appearance"
            ? `site:${site.id}:appearance`
            : section.label === "API Configurations"
              ? `site:${site.id}:apiConfigs`
              : "";
        if (sectionKey) {
          link.dataset.tocTargetSelector = `.site-card[data-id="${site.id}"] details[data-state-key="${sectionKey}"]`;
        }
        link.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const card = document.querySelector(`.site-card[data-id="${site.id}"]`);
          if (card) {
            const detailsMatch = [...card.querySelectorAll("details")].find((d) => {
              const heading = d.querySelector(".panel-summary h3, .panel-summary h2");
              return heading && heading.textContent.trim() === section.label;
            });
            if (detailsMatch) {
              openDetailsChain(detailsMatch);
              detailsMatch.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
              card.scrollIntoView({ behavior: "smooth", block: "start" });
              openDetailsChain(document.getElementById("sites-panel"));
            }
          }
        });
        if (section.module) {
          const details = document.createElement("details");
          details.className = "toc-group toc-section";
          details.dataset.stateKey = `toc:site:${site.id}:${section.module}`;
          const summary = document.createElement("summary");
          summary.appendChild(link);
          details.appendChild(summary);
          const card = document.querySelector(`.site-card[data-id="${site.id}"]`);
          const container = card?.querySelector(section.containerSelector);
          const list = document.createElement("ul");
          list.className = "toc-sub toc-cards";
          renderTocCardList(
            list,
            container?.querySelectorAll(section.cardSelector) || [],
            section.nameSelector,
            section.fallback,
            (target) => {
              openDetailsChain(target);
              centerCardInView(target);
            }
          );
          details.appendChild(list);
          subLi.appendChild(details);
          registerDetail(details, false);
        } else {
          subLi.appendChild(link);
        }
        subUl.appendChild(subLi);
      }

      a.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = document.querySelector(`.site-card[data-id="${site.id}"]`);
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          openDetailsChain(document.getElementById("sites-panel"));
        }
        details.open = true;
      });

      details.appendChild(subUl);
      li.appendChild(details);
      sitesList.appendChild(li);
      registerDetail(details, false);
    }
  }

  const globalTocSections = document.querySelectorAll(".toc-global-section");
  globalTocSections.forEach((section) => {
    registerDetail(section, section.open);
  });

  renderTocCardList(
    document.getElementById("toc-global-envs-list"),
    envConfigsContainer?.querySelectorAll(".env-config-card"),
    ".env-config-name",
    "Environment",
    (card) => {
      openDetailsChain(card);
      centerCardInView(card);
    }
  );
  renderTocCardList(
    document.getElementById("toc-global-profiles-list"),
    profilesContainer?.querySelectorAll(".profile-card"),
    ".profile-name",
    "Profile",
    (card) => {
      openDetailsChain(card);
      centerCardInView(card);
    }
  );
  renderTocCardList(
    document.getElementById("toc-global-tasks-list"),
    tasksContainer?.querySelectorAll(".task-card"),
    ".task-name",
    "Task",
    (card) => {
      openDetailsChain(card);
      centerCardInView(card);
    }
  );
  renderTocCardList(
    document.getElementById("toc-global-shortcuts-list"),
    shortcutsContainer?.querySelectorAll(".shortcut-card"),
    ".shortcut-name",
    "Shortcut",
    (card) => {
      openDetailsChain(card);
      centerCardInView(card);
    }
  );
  renderTocCardList(
    document.getElementById("toc-global-api-keys-list"),
    apiKeysContainer?.querySelectorAll(".api-key-card"),
    ".api-key-name",
    "API Key",
    (card) => {
      openDetailsChain(card);
      centerCardInView(card);
    }
  );
  renderTocCardList(
    document.getElementById("toc-global-api-configs-list"),
    apiConfigsContainer?.querySelectorAll(".api-config-card"),
    ".api-config-name",
    "API Config",
    (card) => {
      openDetailsChain(card);
      centerCardInView(card);
    }
  );

  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const list = card.querySelector(".workspace-sites-list");
    if (!list) return;
    renderWorkspaceSitesList(list, card.dataset.id, sites);
  });
  refreshTocTargets();
}

function initToc() {
  const tocGroups = document.querySelectorAll(".toc-links .toc-group");
  tocGroups.forEach((group, index) => {
    if (!group.dataset.stateKey) {
      group.dataset.stateKey = `toc-group:${index}`;
    }
    registerDetail(group, group.open);
  });
  const links = document.querySelectorAll(".toc-links a[href^=\"#\"]");
  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    const isSummaryLink = Boolean(link.closest("summary"));
    link.addEventListener("click", (e) => {
      const target = document.querySelector(href);
      if (target) {
        openDetailsChain(target);
        if (!isSummaryLink) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      if (!isSummaryLink) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  });
  refreshTocTargets();
}

function handleSettingsInputChange() {
  scheduleSidebarErrors();
  scheduleDirtyCheck();
  refreshInheritedSourceLabels();
}

document.addEventListener("input", handleSettingsInputChange);
document.addEventListener("change", handleSettingsInputChange);
