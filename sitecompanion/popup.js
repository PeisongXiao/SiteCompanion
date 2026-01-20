const runBtn = document.getElementById("runBtn");
const abortBtn = document.getElementById("abortBtn");
const taskSelect = document.getElementById("taskSelect");
const envSelect = document.getElementById("envSelect");
const profileSelect = document.getElementById("profileSelect");
const envProfileSummary = document.getElementById("envProfileSummary");
const envSummaryValue = document.getElementById("envSummaryValue");
const profileSummaryValue = document.getElementById("profileSummaryValue");
const customTaskBtn = document.getElementById("customTaskBtn");
const normalTaskBtn = document.getElementById("normalTaskBtn");
const customTaskInput = document.getElementById("customTaskInput");
const normalTaskRow = document.getElementById("normalTaskRow");
const customTaskRow = document.getElementById("customTaskRow");
const taskActions = document.getElementById("taskActions");
const taskActionsSlot = document.getElementById("taskActionsSlot");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const postingCountEl = document.getElementById("postingCount");
const promptCountEl = document.getElementById("promptCount");
const settingsBtn = document.getElementById("settingsBtn");
const copyRenderedBtn = document.getElementById("copyRenderedBtn");
const copyRawBtn = document.getElementById("copyRawBtn");
const clearOutputBtn = document.getElementById("clearOutputBtn");
const outputSection = document.querySelector(".output");
const footerLeft = document.querySelector(".footer-left");
const footer = document.querySelector(".footer");

const OUTPUT_STORAGE_KEY = "lastOutput";
const AUTO_RUN_KEY = "autoRunDefaultTask";
const SHORTCUT_RUN_KEY = "runShortcutId";
const LAST_TASK_KEY = "lastSelectedTaskId";
const LAST_ENV_KEY = "lastSelectedEnvId";
const LAST_PROFILE_KEY = "lastSelectedProfileId";
const POPUP_DRAFT_KEY = "popupDraft";
const CUSTOM_TASK_MODE_KEY = "customTaskMode";
const CUSTOM_TASK_TEXT_KEY = "customTaskText";

const unknownSiteState = document.getElementById("unknownSiteState");
const extractionReviewState = document.getElementById("extractionReviewState");
const normalExecutionState = document.getElementById("normalExecutionState");
const partialTextPaste = document.getElementById("partialTextPaste");
const minimalExtractStatus = document.getElementById("minimalExtractStatus");
const extractMinimalBtn = document.getElementById("extractMinimalBtn");
const extractFullBtn = document.getElementById("extractFullBtn");
const extractedPreview = document.getElementById("extractedPreview");
const siteNameInput = document.getElementById("siteNameInput");
const urlPatternInput = document.getElementById("urlPatternInput");
const workspaceSelect = document.getElementById("workspaceSelect");
const retryExtractBtn = document.getElementById("retryExtractBtn");
const confirmSiteBtn = document.getElementById("confirmSiteBtn");
const currentWorkspaceName = document.getElementById("currentWorkspaceName");

const state = {
  siteText: "",
  tasks: [],
  envs: [],
  profiles: [],
  sites: [],
  workspaces: [],
  currentSite: null,
  currentWorkspace: null,
  port: null,
  isAnalyzing: false,
  outputRaw: "",
  autoRunPending: false,
  shortcutRunPending: false,
  currentPopupState: "unknown",
  globalTheme: "system",
  forcedTask: null,
  siteTextTarget: null,
  selectedTaskId: "",
  selectedEnvId: "",
  selectedProfileId: "",
  alwaysShowOutput: false,
  alwaysUseDefaultEnvProfile: false,
  activeTabId: null,
  pendingConfigRefresh: false,
  customTaskMode: false,
  customTaskText: ""
};

async function switchState(stateName) {
  unknownSiteState.classList.add("hidden");
  extractionReviewState.classList.add("hidden");
  normalExecutionState.classList.add("hidden");
  state.currentPopupState = stateName;

  if (stateName === "unknown") {
    unknownSiteState.classList.remove("hidden");
  } else if (stateName === "review") {
    updateWorkspaceOptions();
    extractionReviewState.classList.remove("hidden");
  } else if (stateName === "normal") {
    normalExecutionState.classList.remove("hidden");
  }
  setMinimalStatus("");
  updateOutputVisibility();
  await chrome.storage.local.set({ lastPopupState: stateName });
}

function buildPopupDraft() {
  return {
    state: state.currentPopupState,
    siteText: state.siteText || "",
    urlPattern: urlPatternInput?.value?.trim() || "",
    siteName: siteNameInput?.value?.trim() || "",
    siteTextTarget: state.siteTextTarget,
    workspaceId: workspaceSelect?.value || "global"
  };
}

async function persistPopupDraft() {
  await chrome.storage.local.set({ [POPUP_DRAFT_KEY]: buildPopupDraft() });
}

async function clearPopupDraft() {
  await chrome.storage.local.remove(POPUP_DRAFT_KEY);
}

function applyPopupDraft(draft) {
  if (!draft || typeof draft !== "object") return;
  if (draft.siteText) {
    state.siteText = draft.siteText;
    extractedPreview.textContent = state.siteText;
  }
  if (typeof draft.urlPattern === "string") {
    urlPatternInput.value = draft.urlPattern;
  }
  if (typeof draft.siteName === "string") {
    siteNameInput.value = draft.siteName;
  }
  if (typeof draft.workspaceId === "string" && workspaceSelect) {
    workspaceSelect.value = draft.workspaceId;
  }
  if (draft.siteTextTarget) {
    state.siteTextTarget = draft.siteTextTarget;
  } else if (typeof draft.siteTextSelector === "string") {
    state.siteTextTarget = { kind: "css", selector: draft.siteTextSelector };
  }
  updateCounts();
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

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
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

function normalizeConfigList(list) {
  return Array.isArray(list)
    ? list.map((item) => ({ ...item, enabled: item.enabled !== false }))
    : [];
}

const DEFAULT_API_KEY_HEADER = "Authorization";
const DEFAULT_API_KEY_PREFIX = "Bearer ";

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

function findTaskById(taskId, globalTasks, workspace, site) {
  if (!taskId) return null;
  const lists = [
    Array.isArray(site?.tasks) ? site.tasks : [],
    Array.isArray(workspace?.tasks) ? workspace.tasks : [],
    Array.isArray(globalTasks) ? globalTasks : []
  ];
  for (const list of lists) {
    const found = list.find((item) => item?.id === taskId);
    if (found) return found;
  }
  return null;
}

function resolveEffectiveList(globalItems, workspace, site, listKey, disabledKey) {
  const workspaceItems = workspace?.[listKey] || [];
  const workspaceDisabled = workspace?.disabledInherited?.[disabledKey] || [];
  const workspaceEffective = resolveScopedItems(
    globalItems,
    workspaceItems,
    workspaceDisabled
  );
  const siteItems = site?.[listKey] || [];
  const siteDisabled = site?.disabledInherited?.[disabledKey] || [];
  return resolveScopedItems(workspaceEffective, siteItems, siteDisabled);
}

function normalizeStoredExtractTarget(site) {
  if (!site || typeof site !== "object") return null;
  const direct = site.extractTarget;
  if (direct && typeof direct === "object" && typeof direct.kind === "string") {
    return direct;
  }
  if (typeof direct === "string" && direct.trim()) {
    const legacy = parseLegacyDomSelectorString(direct);
    if (legacy?.target) return legacy.target;
    return { kind: "css", selector: direct.trim() };
  }
  const legacy = site.extractSelector;
  if (typeof legacy === "string" && legacy.trim()) {
    const parsedLegacy = parseLegacyDomSelectorString(legacy);
    if (parsedLegacy?.target) return parsedLegacy.target;
    return { kind: "css", selector: legacy.trim() };
  }
  return null;
}

function updateWorkspaceOptions() {
  if (!workspaceSelect) return;
  const selected = workspaceSelect.value || "global";
  workspaceSelect.innerHTML = "";

  const globalOpt = document.createElement("option");
  globalOpt.value = "global";
  globalOpt.textContent = "Global";
  workspaceSelect.appendChild(globalOpt);

  for (const workspace of state.workspaces || []) {
    const opt = document.createElement("option");
    opt.value = workspace.id;
    opt.textContent = workspace.name || "Untitled Workspace";
    workspaceSelect.appendChild(opt);
  }

  if (selected) {
    workspaceSelect.value = selected;
  }
  if (!workspaceSelect.value) {
    workspaceSelect.value = "global";
  }
}

function filterApiConfigsForScope(apiConfigs, workspace, site) {
  const workspaceDisabled = workspace?.disabledInherited?.apiConfigs || [];
  const siteDisabled = site?.disabledInherited?.apiConfigs || [];
  const workspaceFiltered = apiConfigs.filter(
    (config) =>
      config?.enabled !== false && !workspaceDisabled.includes(config.id)
  );
  return workspaceFiltered.filter(
    (config) => !siteDisabled.includes(config.id)
  );
}

async function detectSite(url) {
  const { sites = [], workspaces = [] } = await getStorage(["sites", "workspaces"]);
  const normalizedSites = (Array.isArray(sites) ? sites : []).map((site) => ({
    ...site,
    extractTarget: normalizeStoredExtractTarget(site)
  }));
  state.sites = normalizedSites;
  state.workspaces = workspaces;
  
  const site = normalizedSites.find((s) => matchUrl(url, s.urlPattern));
  if (site) {
    state.currentSite = site;
    const workspace =
      workspaces.find((entry) => entry.id === site.workspaceId) || null;
    state.currentWorkspace = workspace || {
      name: "Global",
      id: "global",
      disabledInherited: {}
    };
    currentWorkspaceName.textContent = state.currentWorkspace.name;
    switchState("normal");
    return true;
  }
  
  switchState("unknown");
  return false;
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function buildUserMessage(profileText, taskText, siteText) {
  return [
    "=== Profile ===",
    profileText || "",
    "",
    "=== Task ===",
    taskText || "",
    "",
    "=== Site Text ===",
    siteText || ""
  ].join("\n");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(text) {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function sanitizeUrl(url) {
  const trimmed = url.trim().replace(/&amp;/g, "&");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
}

function sanitizeEmail(email) {
  const trimmed = email.trim();
  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
    return trimmed;
  }
  return "";
}

function linkifyPlainUrls(html) {
  if (!html) return "";
  const parts = html.split(/(<[^>]+>)/g);
  let inAnchor = false;
  const isOpenAnchor = (part) => /^<a\b/i.test(part);
  const isCloseAnchor = (part) => /^<\/a\b/i.test(part);
  const splitTrailing = (value) => {
    let url = value;
    let trailing = "";
    while (/[).,!?:;\]]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    return { url, trailing };
  };
  const linkifyText = (text) =>
    text.replace(
      /\bmailto:[^\s<>"']+|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b|\bhttps?:\/\/[^\s<>"']+|\b(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?/gi,
      (match) => {
        const { url, trailing } = splitTrailing(match);
        if (!url) return match;
        if (/^mailto:/i.test(url)) {
          const email = sanitizeEmail(url.slice(7));
          if (!email) return match;
          const href = escapeAttribute(`mailto:${email}`);
          return `<a href="${href}" target="_blank" rel="noreferrer">mailto:${email}</a>${trailing}`;
        }
        if (url.includes("@") && !/^https?:\/\//i.test(url)) {
          const email = sanitizeEmail(url);
          if (!email) return match;
          const href = escapeAttribute(`mailto:${email}`);
          return `<a href="${href}" target="_blank" rel="noreferrer">${email}</a>${trailing}`;
        }
        if (/^https?:\/\//i.test(url)) {
          const safeUrl = sanitizeUrl(url);
          if (!safeUrl) return match;
          const href = escapeAttribute(safeUrl);
          return `<a href="${href}" target="_blank" rel="noreferrer">${url}</a>${trailing}`;
        }
        const withScheme = `https://${url}`;
        const safeUrl = sanitizeUrl(withScheme);
        if (!safeUrl) return match;
        const href = escapeAttribute(safeUrl);
        return `<a href="${href}" target="_blank" rel="noreferrer">${url}</a>${trailing}`;
      }
    );

  return parts
    .map((part) => {
      if (!part) return part;
      if (part.startsWith("<")) {
        if (isOpenAnchor(part)) inAnchor = true;
        if (isCloseAnchor(part)) inAnchor = false;
        return part;
      }
      if (inAnchor) return part;
      return linkifyText(part);
    })
    .join("");
}

function applyInline(text) {
  if (!text) return "";
  const codeSpans = [];
  let output = text.replace(/`([^`]+)`/g, (_match, code) => {
    const id = codeSpans.length;
    codeSpans.push(code);
    return `@@CODESPAN${id}@@`;
  });

  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return label;
    return `<a href="${escapeAttribute(
      safeUrl
    )}" target="_blank" rel="noreferrer">${label}</a>`;
  });

  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/_([^_]+)_/g, "<em>$1</em>");
  output = linkifyPlainUrls(output);

  output = output.replace(/@@CODESPAN(\d+)@@/g, (_match, id) => {
    const code = codeSpans[Number(id)] || "";
    return `<code>${code}</code>`;
  });

  return output;
}

function renderMarkdown(rawText) {
  const { text, blocks } = (() => {
    const escaped = escapeHtml(rawText || "");
    const codeBlocks = [];
    const replaced = escaped.replace(/```([\s\S]*?)```/g, (_match, code) => {
      let content = code;
      if (content.startsWith("\n")) content = content.slice(1);
      const firstLine = content.split("\n")[0] || "";
      if (/^[a-z0-9+.#-]+$/i.test(firstLine.trim()) && content.includes("\n")) {
        content = content.split("\n").slice(1).join("\n");
      }
      const id = codeBlocks.length;
      codeBlocks.push(content);
      return `@@CODEBLOCK${id}@@`;
    });
    return { text: replaced, blocks: codeBlocks };
  })();

  const lines = text.split(/\r?\n/);
  const result = [];
  let paragraph = [];
  let listType = null;
  let inBlockquote = false;
  let quoteLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    result.push(`<p>${applyInline(paragraph.join("<br>"))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    result.push(`</${listType}>`);
    listType = null;
  };

  const openList = (type) => {
    if (listType === type) return;
    if (listType) result.push(`</${listType}>`);
    listType = type;
    result.push(`<${type}>`);
  };

  const closeBlockquote = () => {
    if (!inBlockquote) return;
    result.push(`<blockquote>${applyInline(quoteLines.join("<br>"))}</blockquote>`);
    inBlockquote = false;
    quoteLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isQuoteLine = /^\s*>\s?/.test(line);

    if (trimmed === "") {
      flushParagraph();
      closeList();
      closeBlockquote();
      continue;
    }

    if (inBlockquote && !isQuoteLine) {
      closeBlockquote();
    }

    if (/^@@CODEBLOCK\d+@@$/.test(trimmed)) {
      flushParagraph();
      closeList();
      closeBlockquote();
      result.push(trimmed);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      closeBlockquote();
      const level = headingMatch[1].length;
      result.push(`<h${level}>${applyInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^(\s*[-*_])\1{2,}\s*$/.test(line)) {
      flushParagraph();
      closeList();
      closeBlockquote();
      result.push("<hr>");
      continue;
    }

    if (isQuoteLine) {
      if (!inBlockquote) {
        flushParagraph();
        closeList();
        inBlockquote = true;
        quoteLines = [];
      }
      quoteLines.push(line.replace(/^\s*>\s?/, ""));
      continue;
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      closeBlockquote();
      openList("ul");
      result.push(`<li>${applyInline(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      closeBlockquote();
      openList("ol");
      result.push(`<li>${applyInline(orderedMatch[1])}</li>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  closeBlockquote();

  return result
    .join("\n")
    .replace(/@@CODEBLOCK(\d+)@@/g, (_match, id) => {
      const code = blocks[Number(id)] || "";
      return `<pre><code>${code}</code></pre>`;
    });
}

function renderOutput() {
  outputEl.innerHTML = renderMarkdown(state.outputRaw);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function persistOutputNow() {
  return chrome.storage.local.set({ [OUTPUT_STORAGE_KEY]: state.outputRaw });
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setMinimalStatus(message) {
  if (!minimalExtractStatus) return;
  minimalExtractStatus.textContent = message || "";
  minimalExtractStatus.classList.toggle("hidden", !message);
}

function applyTheme(theme) {
  const value = theme || "system";
  document.documentElement.dataset.theme = value;
}

function resolveThemeForPopup(baseTheme) {
  const siteTheme = state.currentSite?.theme;
  if (siteTheme && siteTheme !== "inherit") return siteTheme;
  const workspaceTheme = state.currentWorkspace?.theme;
  if (workspaceTheme && workspaceTheme !== "inherit") return workspaceTheme;
  return baseTheme || "system";
}

function resolveAppearanceToggleValue(value, fallback) {
  if (value === "enabled") return true;
  if (value === "disabled") return false;
  if (value === "inherit" || value === null || value === undefined) {
    return Boolean(fallback);
  }
  if (typeof value === "boolean") return value;
  return Boolean(fallback);
}

function resolveAlwaysUseDefaultEnvProfile(baseSetting, workspace, site) {
  const resolvedBase = resolveAppearanceToggleValue(baseSetting, false);
  const workspaceResolved = resolveAppearanceToggleValue(
    workspace?.alwaysUseDefaultEnvProfile,
    resolvedBase
  );
  return resolveAppearanceToggleValue(
    site?.alwaysUseDefaultEnvProfile,
    workspaceResolved
  );
}

function updateEnvProfileSummary() {
  if (!envSummaryValue || !profileSummaryValue) return;
  const env = getSelectedEnv();
  const profile = getSelectedProfile();
  envSummaryValue.textContent = env ? env.name || "Default" : "None";
  profileSummaryValue.textContent = profile ? profile.name || "Default" : "None";
}

function applyAlwaysUseDefaultEnvProfileState() {
  document.body.classList.toggle(
    "always-default-env-profile",
    state.alwaysUseDefaultEnvProfile
  );
  updateEnvSelectState();
  updateProfileSelectState();
  updateEnvProfileSummary();
}

function setAnalyzing(isAnalyzing) {
  state.isAnalyzing = isAnalyzing;
  runBtn.disabled = isAnalyzing;
  abortBtn.disabled = !isAnalyzing;
  runBtn.classList.toggle("hidden", isAnalyzing);
  abortBtn.classList.toggle("hidden", !isAnalyzing);
  updateTaskSelectState();
  updateEnvSelectState();
  updateProfileSelectState();
  if (!isAnalyzing && state.pendingConfigRefresh) {
    state.pendingConfigRefresh = false;
    scheduleConfigRefresh();
  }
}

function updateOutputVisibility() {
  if (!outputSection) return;
  const shouldHide =
    state.currentPopupState !== "normal" && !state.alwaysShowOutput;
  outputSection.classList.toggle("hidden", shouldHide);
  footerLeft?.classList.toggle("hidden", shouldHide);
  footer?.classList.toggle("compact", shouldHide);
}

async function persistCustomTaskState() {
  await chrome.storage.local.set({
    [CUSTOM_TASK_MODE_KEY]: state.customTaskMode,
    [CUSTOM_TASK_TEXT_KEY]: state.customTaskText
  });
}

function setCustomTaskMode(enabled, { persist = true } = {}) {
  state.customTaskMode = Boolean(enabled);
  document.body.classList.toggle("custom-task-mode", state.customTaskMode);
  if (state.customTaskMode) {
    if (normalTaskRow) {
      const measured = measureRowHeight(normalTaskRow);
      if (measured) normalTaskRowHeight = measured;
      normalTaskRow.classList.add("hidden");
    }
    customTaskRow?.classList.remove("hidden");
    if (taskActionsSlot && taskActions) {
      taskActionsSlot.appendChild(taskActions);
    }
    if (customTaskInput) {
      customTaskInput.value = state.customTaskText || "";
      customTaskInput.focus();
    }
    window.requestAnimationFrame(() => {
      if (customTaskRow) {
        const measured = measureRowHeight(customTaskRow);
        if (measured) customTaskRowHeight = measured;
      }
      updateOutputHeightDelta();
    });
  } else {
    customTaskRow?.classList.add("hidden");
    if (normalTaskRow) {
      normalTaskRow.classList.remove("hidden");
    }
    if (normalTaskRow && taskActions) {
      normalTaskRow.appendChild(taskActions);
    }
    window.requestAnimationFrame(() => {
      if (normalTaskRow) {
        const measured = measureRowHeight(normalTaskRow);
        if (measured) normalTaskRowHeight = measured;
      }
      updateOutputHeightDelta();
    });
  }
  updatePromptCount();
  updateEnvSelectState();
  updateProfileSelectState();
  if (persist) {
    void persistCustomTaskState();
  }
}

function getSelectedTask() {
  if (state.forcedTask) return state.forcedTask;
  const selectedId = taskSelect?.value || state.selectedTaskId;
  return state.tasks.find((item) => item.id === selectedId) || state.tasks[0] || null;
}

function getSelectedProfile() {
  const selectedId = profileSelect?.value || state.selectedProfileId;
  return (
    state.profiles.find((item) => item.id === selectedId) ||
    state.profiles[0] ||
    null
  );
}

function getSelectedEnv() {
  const selectedId = envSelect?.value || state.selectedEnvId;
  return state.envs.find((item) => item.id === selectedId) || state.envs[0] || null;
}

function buildTotalPromptText() {
  const task = getSelectedTask();
  const profile = getSelectedProfile();
  const env = getSelectedEnv();
  const systemPrompt = env?.systemPrompt || "";
  const customText = (state.customTaskText || "").trim();
  const taskText =
    state.customTaskMode && !state.forcedTask ? customText : task?.text || "";
  const userPrompt = buildUserMessage(
    profile?.text || "",
    taskText,
    state.siteText || ""
  );
  return systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
}

function updateSiteTextCount() {
  const length = (state.siteText || "").length;
  postingCountEl.textContent = `Site Text: ${length} chars`;
}

function updatePromptCount(count) {
  const total =
    typeof count === "number" ? count : buildTotalPromptText().length;
  promptCountEl.textContent = `Total: ${total} chars`;
}

function updateCounts() {
  updateSiteTextCount();
  updatePromptCount();
}

let siteContentRefreshTimer = null;
function scheduleSiteContentRefresh() {
  if (siteContentRefreshTimer) return;
  siteContentRefreshTimer = window.setTimeout(() => {
    siteContentRefreshTimer = null;
    void refreshSiteContentCounts();
  }, 250);
}

let configRefreshTimer = null;
function scheduleConfigRefresh() {
  if (state.isAnalyzing) {
    state.pendingConfigRefresh = true;
    return;
  }
  if (configRefreshTimer) return;
  configRefreshTimer = window.setTimeout(() => {
    configRefreshTimer = null;
    void loadConfig();
  }, 250);
}

let normalTaskRowHeight = null;
let customTaskRowHeight = null;

function measureRowHeight(row) {
  if (!row) return 0;
  return row.getBoundingClientRect().height || 0;
}

function updateOutputHeightDelta() {
  const baseHeight = normalTaskRowHeight || measureRowHeight(normalTaskRow);
  if (!baseHeight) return;
  if (!state.customTaskMode) {
    document.body.style.setProperty("--output-height-delta", "0px");
    return;
  }
  const customHeight = customTaskRowHeight || measureRowHeight(customTaskRow);
  const delta = Math.max(0, customHeight - baseHeight);
  document.body.style.setProperty("--output-height-delta", `${Math.round(delta)}px`);
}

async function refreshSiteContentCounts() {
  if (state.isAnalyzing) return;
  if (state.currentPopupState !== "normal") return;
  if (!state.siteTextTarget) return;
  try {
    const response = await sendToActiveTab({
      type: "EXTRACT_BY_SELECTOR",
      target: state.siteTextTarget
    });
    if (!response?.ok) return;
    state.siteText = response.extracted || "";
    state.siteTextTarget = response.target || state.siteTextTarget;
    updateCounts();
  } catch {
    // Ignore refresh failures; counts will update on next explicit extract.
  }
}

function renderTasks(tasks) {
  state.tasks = tasks;
  taskSelect.innerHTML = "";

  if (!tasks.length) {
    const option = document.createElement("option");
    option.textContent = "No tasks configured";
    option.value = "";
    taskSelect.appendChild(option);
    updateTaskSelectState();
    return;
  }

  for (const task of tasks) {
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = task.name || "Untitled task";
    taskSelect.appendChild(option);
  }
  updateTaskSelectState();
}

function renderEnvironments(envs) {
  state.envs = envs;
  envSelect.innerHTML = "";

  if (!envs.length) {
    const option = document.createElement("option");
    option.textContent = "No environments configured";
    option.value = "";
    envSelect.appendChild(option);
    updateEnvSelectState();
    updateEnvProfileSummary();
    return;
  }

  for (const env of envs) {
    const option = document.createElement("option");
    option.value = env.id;
    option.textContent = env.name || "Default";
    envSelect.appendChild(option);
  }
  updateEnvSelectState();
  updateEnvProfileSummary();
}

function updateTaskSelectState() {
  const hasTasks = state.tasks.length > 0;
  taskSelect.disabled = state.isAnalyzing || !hasTasks;
}

function updateEnvSelectState() {
  const hasEnvs = state.envs.length > 0;
  envSelect.disabled =
    state.isAnalyzing ||
    !hasEnvs ||
    (state.alwaysUseDefaultEnvProfile && !state.customTaskMode);
}

function renderProfiles(profiles) {
  state.profiles = profiles;
  profileSelect.innerHTML = "";

  if (!profiles.length) {
    const option = document.createElement("option");
    option.textContent = "No profiles configured";
    option.value = "";
    profileSelect.appendChild(option);
    updateProfileSelectState();
    updateEnvProfileSummary();
    return;
  }

  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name || "Default";
    profileSelect.appendChild(option);
  }
  updateProfileSelectState();
  updateEnvProfileSummary();
}

function updateProfileSelectState() {
  const hasProfiles = state.profiles.length > 0;
  profileSelect.disabled =
    state.isAnalyzing ||
    !hasProfiles ||
    (state.alwaysUseDefaultEnvProfile && !state.customTaskMode);
}

function getTaskDefaultEnvId(task) {
  return task?.defaultEnvId || state.envs[0]?.id || "";
}

function getTaskDefaultProfileId(task) {
  return task?.defaultProfileId || state.profiles[0]?.id || "";
}

function setEnvironmentSelection(envId) {
  const target =
    envId && state.envs.some((env) => env.id === envId)
      ? envId
      : state.envs[0]?.id || "";
  if (target) {
    envSelect.value = target;
  }
  state.selectedEnvId = target;
  updatePromptCount();
  updateEnvProfileSummary();
}

function setProfileSelection(profileId) {
  const target =
    profileId && state.profiles.some((profile) => profile.id === profileId)
      ? profileId
      : state.profiles[0]?.id || "";
  if (target) {
    profileSelect.value = target;
  }
  state.selectedProfileId = target;
  updatePromptCount();
  updateEnvProfileSummary();
}

function selectTask(taskId, { resetEnv } = { resetEnv: false }) {
  if (!taskId) return;
  taskSelect.value = taskId;
  state.selectedTaskId = taskId;
  const task = state.tasks.find((item) => item.id === taskId);
  if (resetEnv) {
    setEnvironmentSelection(getTaskDefaultEnvId(task));
    setProfileSelection(getTaskDefaultProfileId(task));
  }
  updatePromptCount();
}

async function persistSelections() {
  await chrome.storage.local.set({
    [LAST_TASK_KEY]: state.selectedTaskId,
    [LAST_ENV_KEY]: state.selectedEnvId,
    [LAST_PROFILE_KEY]: state.selectedProfileId
  });
}

function sendToActiveTab(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        reject(new Error("No active tab found."));
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          const msg =
            error.message && error.message.includes("Receiving end does not exist")
              ? "Couldn't reach the page. Try refreshing and retry."
              : error.message;
          reject(new Error(msg));
          return;
        }
        resolve(response);
      });
    });
  });
}

function ensurePort() {
  if (state.port) return state.port;

  const port = chrome.runtime.connect({ name: "analysis" });
  port.onMessage.addListener((message) => {
    if (message?.type === "DELTA") {
      state.outputRaw += message.text;
      renderOutput();
      return;
    }

    if (message?.type === "SYNC") {
      state.outputRaw = message.text || "";
      renderOutput();
      if (message.streaming) {
        setAnalyzing(true);
        setStatus("Analyzing...");
      }
      return;
    }

    if (message?.type === "DONE") {
      setAnalyzing(false);
      setStatus("Done");
      return;
    }

    if (message?.type === "ABORTED") {
      setAnalyzing(false);
      setStatus("Aborted.");
      return;
    }

    if (message?.type === "ERROR") {
      setAnalyzing(false);
      setStatus(message.message || "Error during analysis.");
    }
  });

  port.onDisconnect.addListener(() => {
    state.port = null;
    setAnalyzing(false);
  });

  state.port = port;
  return port;
}

async function loadConfig() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tabs[0]?.url || "";
  state.activeTabId = tabs[0]?.id || null;
  
  const { lastPopupState, [POPUP_DRAFT_KEY]: popupDraft } = await getStorage([
    "lastPopupState",
    POPUP_DRAFT_KEY
  ]);
  await detectSite(currentUrl);
  if (state.currentSite) {
    if (lastPopupState === "normal") {
      await switchState("normal");
    }
  } else if (popupDraft?.state === "review") {
    applyPopupDraft(popupDraft);
    await switchState("review");
  } else if (lastPopupState === "unknown") {
    await switchState("unknown");
  }

  const stored = await getStorage([
    "tasks",
    "envConfigs",
    "profiles",
    "shortcuts",
    "workspaces",
    "sites",
    "theme",
    "alwaysShowOutput",
    "alwaysUseDefaultEnvProfile",
    LAST_TASK_KEY,
    LAST_ENV_KEY,
    LAST_PROFILE_KEY,
    CUSTOM_TASK_MODE_KEY,
    CUSTOM_TASK_TEXT_KEY
  ]);
  const tasks = normalizeConfigList(stored.tasks);
  const envs = normalizeConfigList(stored.envConfigs);
  const profiles = normalizeConfigList(stored.profiles);
  const shortcuts = normalizeConfigList(stored.shortcuts);
  let needsSiteUpdate = false;
  const sites = Array.isArray(stored.sites)
    ? stored.sites.map((site) => {
        const target = normalizeStoredExtractTarget(site);
        if (site?.extractSelector || typeof site?.extractTarget === "string") {
          needsSiteUpdate = true;
        }
        return { ...site, extractTarget: target };
      })
    : state.sites;
  const workspaces = Array.isArray(stored.workspaces)
    ? stored.workspaces
    : state.workspaces;
  state.sites = sites;
  state.workspaces = workspaces;
  updateWorkspaceOptions();
  if (needsSiteUpdate) {
    await chrome.storage.local.set({ sites });
  }

  const activeSite = state.currentSite
    ? sites.find((entry) => entry.id === state.currentSite.id)
    : null;
  const activeWorkspace =
    activeSite && activeSite.workspaceId
      ? workspaces.find((entry) => entry.id === activeSite.workspaceId)
      : null;
  if (activeSite) {
    state.currentSite = activeSite;
  }
  if (activeWorkspace) {
    state.currentWorkspace = activeWorkspace;
    currentWorkspaceName.textContent = activeWorkspace.name || "Global";
  }
  if (state.currentSite && !state.siteTextTarget) {
    state.siteTextTarget = normalizeStoredExtractTarget(state.currentSite);
  }
  if (stored.theme) {
    state.globalTheme = stored.theme;
  }
  state.alwaysShowOutput = Boolean(stored.alwaysShowOutput);
  state.alwaysUseDefaultEnvProfile = resolveAlwaysUseDefaultEnvProfile(
    stored.alwaysUseDefaultEnvProfile,
    activeWorkspace,
    activeSite
  );
  applyTheme(resolveThemeForPopup(state.globalTheme));
  updateOutputVisibility();
  applyAlwaysUseDefaultEnvProfileState();
  state.customTaskMode = Boolean(stored[CUSTOM_TASK_MODE_KEY]);
  state.customTaskText = stored[CUSTOM_TASK_TEXT_KEY] || "";

  const effectiveEnvs = resolveEffectiveList(
    envs,
    activeWorkspace,
    activeSite,
    "envConfigs",
    "envs"
  );
  const effectiveProfiles = resolveEffectiveList(
    profiles,
    activeWorkspace,
    activeSite,
    "profiles",
    "profiles"
  );
  const effectiveTasks = resolveEffectiveList(
    tasks,
    activeWorkspace,
    activeSite,
    "tasks",
    "tasks"
  );

  renderTasks(effectiveTasks);
  renderEnvironments(effectiveEnvs);
  renderProfiles(effectiveProfiles);
  if (customTaskInput) {
    customTaskInput.value = state.customTaskText;
  }
  setCustomTaskMode(state.customTaskMode, { persist: false });

  if (!effectiveTasks.length) {
    state.selectedTaskId = "";
    setEnvironmentSelection(effectiveEnvs[0]?.id || "");
    setProfileSelection(effectiveProfiles[0]?.id || "");
    updateCounts();
    return;
  }

  const storedTaskId = stored[LAST_TASK_KEY];
  const storedEnvId = stored[LAST_ENV_KEY];
  const storedProfileId = stored[LAST_PROFILE_KEY];
  const initialTaskId = effectiveTasks.some((task) => task.id === storedTaskId)
    ? storedTaskId
    : effectiveTasks[0].id;
  selectTask(initialTaskId, { resetEnv: state.alwaysUseDefaultEnvProfile });

  const task = effectiveTasks.find((item) => item.id === initialTaskId);
  if (!state.alwaysUseDefaultEnvProfile) {
    if (storedEnvId && effectiveEnvs.some((env) => env.id === storedEnvId)) {
      setEnvironmentSelection(storedEnvId);
    } else {
      setEnvironmentSelection(getTaskDefaultEnvId(task));
    }

    if (
      storedProfileId &&
      effectiveProfiles.some((profile) => profile.id === storedProfileId)
    ) {
      setProfileSelection(storedProfileId);
    } else {
      setProfileSelection(getTaskDefaultProfileId(task));
    }
  }

  if (
    storedTaskId !== state.selectedTaskId ||
    storedEnvId !== state.selectedEnvId ||
    storedProfileId !== state.selectedProfileId
  ) {
    await persistSelections();
  }

  updateCounts();
  if (state.currentSite) {
    await refreshSiteContentCounts();
  }
  maybeRunDefaultTask();
}

async function loadTheme() {
  const { theme = "system" } = await getStorage(["theme"]);
  state.globalTheme = theme;
  applyTheme(resolveThemeForPopup(theme));
}

async function handleExtract() {
  setStatus("Extracting...");
  try {
    const target = normalizeStoredExtractTarget(state.currentSite);
    if (!target) {
      setStatus("Missing extraction target.");
      return false;
    }
    const response = await sendToActiveTab({
      type: "EXTRACT_BY_SELECTOR",
      target
    });
    if (!response?.ok) {
      setStatus(response?.error || "No text detected.");
      return false;
    }

    state.siteText = response.extracted || "";
    state.siteTextTarget = response.target || target;
    updateCounts();
    setStatus("Text extracted.");
    return true;
  } catch (error) {
    setStatus(error.message || "Unable to extract text.");
    return false;
  }
}

async function handleAnalyze() {
  if (!state.siteText) {
    setStatus("Extract site text first.");
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url) {
    setStatus("Open a page to run tasks.");
    return;
  }

  const taskId = taskSelect.value;
  const forcedTask = state.forcedTask;
  const task = forcedTask || state.tasks.find((item) => item.id === taskId);
  const useCustomTask = state.customTaskMode && !forcedTask;
  if (forcedTask) {
    state.forcedTask = null;
  }
  if (!useCustomTask && !task) {
    setStatus("Select a task.");
    return;
  }
  if (state.alwaysUseDefaultEnvProfile && !forcedTask && !state.customTaskMode) {
    setEnvironmentSelection(getTaskDefaultEnvId(task));
    setProfileSelection(getTaskDefaultProfileId(task));
  }

  const {
    apiKeys = [],
    activeApiKeyId = "",
    apiConfigs = [],
    activeApiConfigId = "",
    apiBaseUrl,
    model,
    systemPrompt,
    resume
  } = await getStorage([
    "apiKeys",
    "activeApiKeyId",
    "apiConfigs",
    "activeApiConfigId",
    "apiBaseUrl",
    "model",
    "systemPrompt",
    "resume"
  ]);

  const resolvedConfigs = filterApiConfigsForScope(
    normalizeConfigList(apiConfigs),
    state.currentWorkspace,
    state.currentSite
  );
  const resolvedEnvs = Array.isArray(state.envs) ? state.envs : [];
  const resolvedProfiles = Array.isArray(state.profiles) ? state.profiles : [];
  const selectedEnvId = envSelect.value;
  const activeEnv =
    resolvedEnvs.find((entry) => entry.id === selectedEnvId) ||
    resolvedEnvs[0];
  if (!activeEnv) {
    setStatus("Add an environment in Settings.");
    return;
  }
  const resolvedSystemPrompt =
    activeEnv.systemPrompt ?? systemPrompt ?? "";
  const customTaskText = (state.customTaskText || "").trim();
  const resolvedTaskText = useCustomTask ? customTaskText : task?.text || "";
  if (useCustomTask && !resolvedTaskText) {
    setStatus("Enter a custom task.");
    return;
  }
  const resolvedApiConfigId =
    activeEnv.apiConfigId || activeApiConfigId || resolvedConfigs[0]?.id || "";
  const activeConfig =
    resolvedConfigs.find((entry) => entry.id === resolvedApiConfigId) ||
    resolvedConfigs[0];
  if (!activeConfig) {
    setStatus("Add an API configuration in Settings.");
    return;
  }

  const selectedProfileId = profileSelect.value;
  const activeProfile =
    resolvedProfiles.find((entry) => entry.id === selectedProfileId) ||
    resolvedProfiles[0];
  const profileText = activeProfile?.text || resume || "";
  const isAdvanced = Boolean(activeConfig?.advanced);
  const resolvedApiUrl = activeConfig?.apiUrl || "";
  const resolvedTemplate = activeConfig?.requestTemplate || "";
  const resolvedApiBaseUrl = activeConfig?.apiBaseUrl || apiBaseUrl || "";
  const resolvedApiKeyHeader = isAdvanced ? "" : DEFAULT_API_KEY_HEADER;
  const resolvedApiKeyPrefix = isAdvanced ? "" : DEFAULT_API_KEY_PREFIX;
  const resolvedModel = activeConfig?.model || model || "";

  const resolvedKeys = normalizeConfigList(apiKeys).filter(
    (key) => key.enabled !== false
  );
  const resolvedKeyId =
    activeConfig?.apiKeyId || activeApiKeyId || resolvedKeys[0]?.id || "";
  const activeKey = resolvedKeys.find((entry) => entry.id === resolvedKeyId);
  const apiKey = activeKey?.key || "";

  if (isAdvanced) {
    if (!resolvedApiUrl) {
      setStatus("Set an API URL in Settings.");
      return;
    }
    if (!isValidTemplateJson(resolvedTemplate)) {
      setStatus("Request template JSON is invalid.");
      return;
    }
  } else {
    if (!resolvedApiBaseUrl) {
      setStatus("Set an API base URL in Settings.");
      return;
    }
    if (resolvedApiKeyHeader && !apiKey) {
      setStatus("Add an API key in Settings.");
      return;
    }
    if (!resolvedModel) {
      setStatus("Set a model name in Settings.");
      return;
    }
  }

  updatePromptCount();

  state.outputRaw = "";
  renderOutput();
  setAnalyzing(true);
  setStatus("Analyzing...");

  const port = ensurePort();
  port.postMessage({
    type: "START_ANALYSIS",
    payload: {
      apiKey,
      apiMode: isAdvanced ? "advanced" : "basic",
      apiUrl: resolvedApiUrl,
      requestTemplate: resolvedTemplate,
      apiBaseUrl: resolvedApiBaseUrl,
      apiKeyHeader: resolvedApiKeyHeader,
      apiKeyPrefix: resolvedApiKeyPrefix,
      model: resolvedModel,
      systemPrompt: resolvedSystemPrompt,
      profileText,
      taskText: resolvedTaskText,
      siteText: state.siteText,
      tabId: tab.id
    }
  });
}

async function handleExtractAndAnalyze() {
  const extracted = await handleExtract();
  if (!extracted) return;
  await handleAnalyze();
}

function handleAbort() {
  if (!state.port) return;
  state.port.postMessage({ type: "ABORT_ANALYSIS" });
  setAnalyzing(false);
  setStatus("Aborted.");
}

async function handleClearOutput() {
  state.outputRaw = "";
  renderOutput();
  await persistOutputNow();
  setStatus("Output cleared.");
}

async function copyTextToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`${label} copied.`);
  } catch (error) {
    setStatus(`Unable to copy ${label.toLowerCase()}.`);
  }
}

function handleCopyRendered() {
  const text = outputEl.innerText || "";
  if (!text.trim()) {
    setStatus("Nothing to copy.");
    return;
  }
  void copyTextToClipboard(text, "Output");
}

function handleCopyRaw() {
  const text = state.outputRaw || "";
  if (!text.trim()) {
    setStatus("Nothing to copy.");
    return;
  }
  void copyTextToClipboard(text, "Markdown");
}

async function fillSiteDefaultsFromTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.url) return;
  const url = new URL(tabs[0].url);
  urlPatternInput.value = `${url.hostname}/*`;
  if (!siteNameInput.value.trim()) {
    siteNameInput.value = url.hostname;
  }
}

async function runMinimalExtraction(text, minLength = 5) {
  const trimmed = (text || "").trim();
  if (trimmed.length < minLength) {
    setMinimalStatus("Paste more text to extract.");
    return false;
  }

  setStatus("Finding scope...");
  try {
    const response = await sendToActiveTab({ type: "FIND_SCOPE", text: trimmed });
    if (response?.ok) {
      state.siteText = response.extracted;
      state.siteTextTarget = response.target || { kind: "textScope", text: trimmed };
      extractedPreview.textContent = state.siteText;
      updateCounts();
      await fillSiteDefaultsFromTab();
      switchState("review");
      await persistPopupDraft();
      setMinimalStatus("");
      setStatus("Review extraction.");
      return true;
    }
    setMinimalStatus(response?.error || "Text could not be matched.");
    return false;
  } catch (error) {
    setMinimalStatus(error?.message || "Error finding scope.");
    return false;
  }
}

partialTextPaste.addEventListener("input", () => {
  if (state.currentPopupState === "unknown") {
    void persistPopupDraft();
    setMinimalStatus("");
  }
});

extractMinimalBtn?.addEventListener("click", async () => {
  await runMinimalExtraction(partialTextPaste.value, 1);
});

extractFullBtn.addEventListener("click", async () => {
  setMinimalStatus("");
  setStatus("Extracting full text...");
  try {
    const response = await sendToActiveTab({
      type: "EXTRACT_FULL"
    });
    if (response?.ok) {
      const target = response.target || { kind: "css", selector: "body" };
      state.siteText = response.extracted;
      state.siteTextTarget = target;
      extractedPreview.textContent = state.siteText;
      updateCounts();
      await fillSiteDefaultsFromTab();
      switchState("review");
      await persistPopupDraft();
      setStatus("Review extraction.");
    } else {
      setStatus(response?.error || "Error extracting text.");
    }
  } catch (error) {
    setStatus("Error extracting text.");
  }
});

siteNameInput.addEventListener("input", () => {
  if (state.currentPopupState !== "review") return;
  void persistPopupDraft();
});

urlPatternInput.addEventListener("input", () => {
  if (state.currentPopupState !== "review") return;
  void persistPopupDraft();
});

workspaceSelect?.addEventListener("change", () => {
  if (state.currentPopupState !== "review") return;
  void persistPopupDraft();
});

retryExtractBtn.addEventListener("click", () => {
  switchState("unknown");
  partialTextPaste.value = "";
  extractedPreview.textContent = "";
  urlPatternInput.value = "";
  siteNameInput.value = "";
  if (workspaceSelect) workspaceSelect.value = "global";
  state.siteText = "";
  state.siteTextTarget = null;
  updateCounts();
  setMinimalStatus("");
  void clearPopupDraft();
  setStatus("Ready.");
});

confirmSiteBtn.addEventListener("click", async () => {
  const name = siteNameInput.value.trim();
  const pattern = urlPatternInput.value.trim();
  if (!name) {
    setStatus("Enter a site name.");
    return;
  }
  if (!pattern) {
    setStatus("Enter a URL pattern.");
    return;
  }
  if (!state.siteTextTarget) {
    setStatus("Missing extraction target.");
    return;
  }

  // AGENTS.md: No URL pattern may be a substring of another.
  const conflict = state.sites.find(s => s.urlPattern.includes(pattern) || pattern.includes(s.urlPattern));
  if (conflict) {
    setStatus("URL pattern conflict.");
    return;
  }

  const newSite = {
    id: `site-${Date.now()}`,
    name,
    urlPattern: pattern,
    workspaceId: workspaceSelect?.value || "global",
    extractTarget: state.siteTextTarget
  };

  state.sites.push(newSite);
  state.outputRaw = "";
  renderOutput();
  await persistOutputNow();
  await chrome.storage.local.set({
    sites: state.sites,
    [LAST_TASK_KEY]: "",
    [LAST_ENV_KEY]: "",
    [LAST_PROFILE_KEY]: "",
    lastPopupState: "normal"
  });
  await clearPopupDraft();
  state.currentSite = newSite;
  const selectedWorkspace =
    state.workspaces.find((entry) => entry.id === newSite.workspaceId) || null;
  state.currentWorkspace = selectedWorkspace || { name: "Global", id: "global" };
  currentWorkspaceName.textContent = state.currentWorkspace.name || "Global";
  await loadConfig();
  await switchState("normal");
  updateCounts();
  setStatus("Site saved.");
});

customTaskBtn?.addEventListener("click", () => {
  setCustomTaskMode(true);
});

normalTaskBtn?.addEventListener("click", () => {
  setCustomTaskMode(false);
});

customTaskInput?.addEventListener("input", () => {
  state.customTaskText = customTaskInput.value || "";
  updatePromptCount();
  void persistCustomTaskState();
});

runBtn.addEventListener("click", handleExtractAndAnalyze);
abortBtn.addEventListener("click", handleAbort);
settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
copyRenderedBtn.addEventListener("click", handleCopyRendered);
copyRawBtn.addEventListener("click", handleCopyRaw);
clearOutputBtn.addEventListener("click", () => void handleClearOutput());
taskSelect.addEventListener("change", () => {
  selectTask(taskSelect.value, { resetEnv: true });
  void persistSelections();
});
envSelect.addEventListener("change", () => {
  setEnvironmentSelection(envSelect.value);
  void persistSelections();
});
profileSelect.addEventListener("change", () => {
  setProfileSelection(profileSelect.value);
  void persistSelections();
});

updateCounts();
renderOutput();
setAnalyzing(false);
void loadTheme();

async function loadSavedOutput() {
  const stored = await getStorage([OUTPUT_STORAGE_KEY]);
  state.outputRaw = stored[OUTPUT_STORAGE_KEY] || "";
  renderOutput();
}

async function loadShortcutRunRequest() {
  const stored = await getStorage([
    SHORTCUT_RUN_KEY,
    "shortcuts",
    "workspaces",
    "sites",
    "tasks"
  ]);
  const shortcutId = stored[SHORTCUT_RUN_KEY];
  if (!shortcutId) return;

  state.shortcutRunPending = true;
  await chrome.storage.local.remove(SHORTCUT_RUN_KEY);
  setCustomTaskMode(false);

  if (!state.tasks.length) {
    await loadConfig();
  }

  const globalShortcuts = normalizeConfigList(stored.shortcuts);
  const globalTasks = normalizeConfigList(stored.tasks);
  const sites = Array.isArray(stored.sites) ? stored.sites : state.sites;
  const workspaces = Array.isArray(stored.workspaces)
    ? stored.workspaces
    : state.workspaces;
  const activeSite = state.currentSite
    ? sites.find((entry) => entry.id === state.currentSite.id)
    : null;
  const activeWorkspace =
    activeSite && activeSite.workspaceId
      ? workspaces.find((entry) => entry.id === activeSite.workspaceId)
      : null;
  const effectiveShortcuts = resolveEffectiveList(
    globalShortcuts,
    activeWorkspace,
    activeSite,
    "shortcuts",
    "shortcuts"
  );
  const shortcut = effectiveShortcuts.find((item) => item.id === shortcutId);
  if (!shortcut) {
    setStatus("Shortcut not found.");
    state.shortcutRunPending = false;
    return;
  }

  const shortcutTaskId = shortcut.taskId || "";
  const scopedTask = findTaskById(
    shortcutTaskId,
    globalTasks,
    activeWorkspace,
    activeSite
  );
  if (shortcutTaskId && !scopedTask) {
    setStatus("Shortcut task is unavailable.");
    state.shortcutRunPending = false;
    return;
  }

  if (scopedTask && state.tasks.some((item) => item.id === scopedTask.id)) {
    selectTask(scopedTask.id, { resetEnv: true });
  } else if (!state.tasks.length && !scopedTask) {
    setStatus("No tasks configured.");
    state.shortcutRunPending = false;
    return;
  }

  state.forcedTask = scopedTask || null;
  if (shortcut.envId) {
    setEnvironmentSelection(shortcut.envId);
  }
  if (shortcut.profileId) {
    setProfileSelection(shortcut.profileId);
  }
  await persistSelections();
  state.autoRunPending = false;
  state.shortcutRunPending = false;
  void handleExtractAndAnalyze().finally(() => {
    if (!state.alwaysUseDefaultEnvProfile) return;
    const selectedTask = getSelectedTask();
    if (!selectedTask) return;
    setEnvironmentSelection(getTaskDefaultEnvId(selectedTask));
    setProfileSelection(getTaskDefaultProfileId(selectedTask));
  });
}

async function loadAutoRunRequest() {
  const stored = await getStorage([AUTO_RUN_KEY]);
  if (stored[AUTO_RUN_KEY]) {
    state.autoRunPending = true;
    await chrome.storage.local.remove(AUTO_RUN_KEY);
  }
  maybeRunDefaultTask();
}

function maybeRunDefaultTask() {
  if (state.shortcutRunPending) return;
  if (!state.autoRunPending) return;
  if (state.isAnalyzing) return;
  if (!state.tasks.length) return;
  selectTask(state.tasks[0].id, { resetEnv: true });
  void persistSelections();
  state.autoRunPending = false;
  void handleExtractAndAnalyze();
}

async function init() {
  await loadConfig();
  await loadShortcutRunRequest();
  await loadAutoRunRequest();
}

void init();
void loadSavedOutput();
ensurePort();

chrome.storage.onChanged.addListener((changes) => {
  if (changes[AUTO_RUN_KEY]?.newValue) {
    state.autoRunPending = true;
    void chrome.storage.local.remove(AUTO_RUN_KEY);
    maybeRunDefaultTask();
  }

  if (changes[SHORTCUT_RUN_KEY]?.newValue) {
    void loadShortcutRunRequest();
  }

  if (changes[OUTPUT_STORAGE_KEY]?.newValue !== undefined) {
    if (!state.isAnalyzing || !state.port) {
      state.outputRaw = changes[OUTPUT_STORAGE_KEY].newValue || "";
      renderOutput();
    }
  }

  if (changes.theme) {
    state.globalTheme = changes.theme.newValue || "system";
    applyTheme(resolveThemeForPopup(state.globalTheme));
  }
  if (changes.alwaysShowOutput) {
    state.alwaysShowOutput = Boolean(changes.alwaysShowOutput.newValue);
    updateOutputVisibility();
  }

  const configKeys = [
    "tasks",
    "envConfigs",
    "profiles",
    "shortcuts",
    "workspaces",
    "sites",
    "theme",
    "alwaysShowOutput",
    "alwaysUseDefaultEnvProfile"
  ];
  if (configKeys.some((key) => changes[key])) {
    scheduleConfigRefresh();
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "SITE_CONTENT_CHANGED") return;
  const senderTabId = sender?.tab?.id || null;
  if (state.activeTabId && senderTabId && senderTabId !== state.activeTabId) {
    return;
  }
  scheduleSiteContentRefresh();
});
