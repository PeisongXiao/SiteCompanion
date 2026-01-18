const runBtn = document.getElementById("runBtn");
const abortBtn = document.getElementById("abortBtn");
const taskSelect = document.getElementById("taskSelect");
const envSelect = document.getElementById("envSelect");
const profileSelect = document.getElementById("profileSelect");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const postingCountEl = document.getElementById("postingCount");
const promptCountEl = document.getElementById("promptCount");
const settingsBtn = document.getElementById("settingsBtn");
const copyRenderedBtn = document.getElementById("copyRenderedBtn");
const copyRawBtn = document.getElementById("copyRawBtn");
const clearOutputBtn = document.getElementById("clearOutputBtn");

const OUTPUT_STORAGE_KEY = "lastOutput";
const AUTO_RUN_KEY = "autoRunDefaultTask";
const SHORTCUT_RUN_KEY = "runShortcutId";
const LAST_TASK_KEY = "lastSelectedTaskId";
const LAST_ENV_KEY = "lastSelectedEnvId";
const LAST_PROFILE_KEY = "lastSelectedProfileId";

const unknownSiteState = document.getElementById("unknownSiteState");
const extractionReviewState = document.getElementById("extractionReviewState");
const normalExecutionState = document.getElementById("normalExecutionState");
const partialTextPaste = document.getElementById("partialTextPaste");
const extractFullBtn = document.getElementById("extractFullBtn");
const extractedPreview = document.getElementById("extractedPreview");
const urlPatternInput = document.getElementById("urlPatternInput");
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
  selectedTaskId: "",
  selectedEnvId: "",
  selectedProfileId: ""
};

async function switchState(stateName) {
  unknownSiteState.classList.add("hidden");
  extractionReviewState.classList.add("hidden");
  normalExecutionState.classList.add("hidden");

  if (stateName === "unknown") {
    unknownSiteState.classList.remove("hidden");
  } else if (stateName === "review") {
    extractionReviewState.classList.remove("hidden");
  } else if (stateName === "normal") {
    normalExecutionState.classList.remove("hidden");
  }
  await chrome.storage.local.set({ lastPopupState: stateName });
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

function normalizeConfigList(list) {
  return Array.isArray(list)
    ? list.map((item) => ({ ...item, enabled: item.enabled !== false }))
    : [];
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
  state.sites = sites;
  state.workspaces = workspaces;
  
  const site = sites.find(s => matchUrl(url, s.urlPattern));
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

function applyTheme(theme) {
  const value = theme || "system";
  document.documentElement.dataset.theme = value;
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
}

function updateSiteTextCount() {
  postingCountEl.textContent = `Site Text: ${state.siteText.length} chars`;
}

function updatePromptCount(count) {
  promptCountEl.textContent = `Task: ${count} chars`;
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
    return;
  }

  for (const env of envs) {
    const option = document.createElement("option");
    option.value = env.id;
    option.textContent = env.name || "Default";
    envSelect.appendChild(option);
  }
  updateEnvSelectState();
}

function updateTaskSelectState() {
  const hasTasks = state.tasks.length > 0;
  taskSelect.disabled = state.isAnalyzing || !hasTasks;
}

function updateEnvSelectState() {
  const hasEnvs = state.envs.length > 0;
  envSelect.disabled = state.isAnalyzing || !hasEnvs;
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
    return;
  }

  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name || "Default";
    profileSelect.appendChild(option);
  }
  updateProfileSelectState();
}

function updateProfileSelectState() {
  const hasProfiles = state.profiles.length > 0;
  profileSelect.disabled = state.isAnalyzing || !hasProfiles;
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
  
  const { lastPopupState } = await getStorage(["lastPopupState"]);
  await detectSite(currentUrl);
  if (lastPopupState && lastPopupState !== "unknown") {
    // If we had a state like 'review', we might want to stay there, 
    // but detectSite might have switched to 'normal' if it matched.
    // AGENTS.md says popup state must be persisted.
    if (state.currentSite && lastPopupState === "normal") {
       await switchState("normal");
    } else if (!state.currentSite && (lastPopupState === "unknown" || lastPopupState === "review")) {
       await switchState(lastPopupState);
    }
  }

  const stored = await getStorage([
    "tasks",
    "envConfigs",
    "profiles",
    "shortcuts",
    "workspaces",
    "sites",
    LAST_TASK_KEY,
    LAST_ENV_KEY,
    LAST_PROFILE_KEY
  ]);
  const tasks = normalizeConfigList(stored.tasks);
  const envs = normalizeConfigList(stored.envConfigs);
  const profiles = normalizeConfigList(stored.profiles);
  const shortcuts = normalizeConfigList(stored.shortcuts);
  const sites = Array.isArray(stored.sites) ? stored.sites : state.sites;
  const workspaces = Array.isArray(stored.workspaces)
    ? stored.workspaces
    : state.workspaces;
  state.sites = sites;
  state.workspaces = workspaces;

  const activeSite = state.currentSite
    ? sites.find((entry) => entry.id === state.currentSite.id)
    : null;
  const activeWorkspace =
    activeSite && activeSite.workspaceId
      ? workspaces.find((entry) => entry.id === activeSite.workspaceId)
      : null;
  if (activeWorkspace) {
    state.currentWorkspace = activeWorkspace;
    currentWorkspaceName.textContent = activeWorkspace.name || "Global";
  }

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

  if (!effectiveTasks.length) {
    state.selectedTaskId = "";
    setEnvironmentSelection(effectiveEnvs[0]?.id || "");
    setProfileSelection(effectiveProfiles[0]?.id || "");
    return;
  }

  const storedTaskId = stored[LAST_TASK_KEY];
  const storedEnvId = stored[LAST_ENV_KEY];
  const storedProfileId = stored[LAST_PROFILE_KEY];
  const initialTaskId = effectiveTasks.some((task) => task.id === storedTaskId)
    ? storedTaskId
    : effectiveTasks[0].id;
  selectTask(initialTaskId, { resetEnv: false });

  const task = effectiveTasks.find((item) => item.id === initialTaskId);
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

  if (
    storedTaskId !== state.selectedTaskId ||
    storedEnvId !== state.selectedEnvId ||
    storedProfileId !== state.selectedProfileId
  ) {
    await persistSelections();
  }

  maybeRunDefaultTask();
}

async function loadTheme() {
  const { theme = "system" } = await getStorage(["theme"]);
  applyTheme(theme);
}

async function handleExtract() {
  setStatus("Extracting...");
  try {
    const response = await sendToActiveTab({ type: "EXTRACT_FULL" });
    if (!response?.ok) {
      setStatus(response?.error || "No text detected.");
      return false;
    }

    state.siteText = response.extracted || "";
    updateSiteTextCount();
    updatePromptCount(0);
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
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    setStatus("Select a task.");
    return;
  }

  const {
    apiKeys = [],
    activeApiKeyId = "",
    apiConfigs = [],
    activeApiConfigId = "",
    apiBaseUrl,
    apiKeyHeader,
    apiKeyPrefix,
    model,
    systemPrompt,
    resume
  } = await getStorage([
    "apiKeys",
    "activeApiKeyId",
    "apiConfigs",
    "activeApiConfigId",
    "apiBaseUrl",
    "apiKeyHeader",
    "apiKeyPrefix",
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
  const resolvedApiKeyHeader = activeConfig?.apiKeyHeader ?? apiKeyHeader ?? "";
  const resolvedApiKeyPrefix = activeConfig?.apiKeyPrefix ?? apiKeyPrefix ?? "";
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
    if (!resolvedTemplate) {
      setStatus("Set a request template in Settings.");
      return;
    }
    const needsKey =
      Boolean(resolvedApiKeyHeader) ||
      resolvedTemplate.includes("API_KEY_GOES_HERE");
    if (needsKey && !apiKey) {
      setStatus("Add an API key in Settings.");
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

  const promptText = buildUserMessage(
    profileText,
    task.text || "",
    state.siteText
  );
  updatePromptCount(promptText.length);

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
      taskText: task.text || "",
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

partialTextPaste.addEventListener("input", async () => {
  const text = partialTextPaste.value.trim();
  if (text.length < 5) return;

  setStatus("Finding scope...");
  try {
    const response = await sendToActiveTab({ type: "FIND_SCOPE", text });
    if (response?.ok) {
      state.siteText = response.extracted;
      extractedPreview.textContent = state.siteText;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tabs[0].url);
      urlPatternInput.value = url.hostname + url.pathname + "*";
      switchState("review");
      setStatus("Review extraction.");
    }
  } catch (error) {
    setStatus("Error finding scope.");
  }
});

extractFullBtn.addEventListener("click", async () => {
  setStatus("Extracting full text...");
  try {
    const response = await sendToActiveTab({ type: "EXTRACT_FULL" });
    if (response?.ok) {
      state.siteText = response.extracted;
      extractedPreview.textContent = state.siteText;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tabs[0].url);
      urlPatternInput.value = url.hostname + url.pathname + "*";
      switchState("review");
      setStatus("Review extraction.");
    }
  } catch (error) {
    setStatus("Error extracting text.");
  }
});

retryExtractBtn.addEventListener("click", () => {
  switchState("unknown");
  partialTextPaste.value = "";
  setStatus("Ready.");
});

confirmSiteBtn.addEventListener("click", async () => {
  const pattern = urlPatternInput.value.trim();
  if (!pattern) {
    setStatus("Enter a URL pattern.");
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
    urlPattern: pattern,
    workspaceId: "global" // Default to global for now
  };

  state.sites.push(newSite);
  await chrome.storage.local.set({ sites: state.sites });
  state.currentSite = newSite;
  state.currentWorkspace = { name: "Global", id: "global" };
  currentWorkspaceName.textContent = "Global";
  switchState("normal");
  updateSiteTextCount();
  setStatus("Site saved.");
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

updateSiteTextCount();
updatePromptCount(0);
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
    "sites"
  ]);
  const shortcutId = stored[SHORTCUT_RUN_KEY];
  if (!shortcutId) return;

  state.shortcutRunPending = true;
  await chrome.storage.local.remove(SHORTCUT_RUN_KEY);

  const globalShortcuts = normalizeConfigList(stored.shortcuts);
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

  if (shortcut.taskId) {
    selectTask(shortcut.taskId, { resetEnv: true });
  }
  if (shortcut.envId) {
    setEnvironmentSelection(shortcut.envId);
  }
  if (shortcut.profileId) {
    setProfileSelection(shortcut.profileId);
  }
  await persistSelections();
  state.autoRunPending = false;
  state.shortcutRunPending = false;
  void handleExtractAndAnalyze();
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
    applyTheme(changes.theme.newValue || "system");
  }
});
