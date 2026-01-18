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
const LAST_TASK_KEY = "lastSelectedTaskId";
const LAST_ENV_KEY = "lastSelectedEnvId";
const LAST_PROFILE_KEY = "lastSelectedProfileId";

const state = {
  postingText: "",
  tasks: [],
  envs: [],
  profiles: [],
  port: null,
  isAnalyzing: false,
  outputRaw: "",
  autoRunPending: false,
  selectedTaskId: "",
  selectedEnvId: "",
  selectedProfileId: ""
};

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function buildUserMessage(resume, resumeType, task, posting) {
  const header = resumeType === "Profile" ? "=== PROFILE ===" : "=== RESUME ===";
  return [
    header,
    resume || "",
    "",
    "=== TASK ===",
    task || "",
    "",
    "=== JOB POSTING ===",
    posting || ""
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

function updatePostingCount() {
  postingCountEl.textContent = `Posting: ${state.postingText.length} chars`;
}

function updatePromptCount(count) {
  promptCountEl.textContent = `Prompt: ${count} chars`;
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

function isWaterlooWorksUrl(url) {
  try {
    return new URL(url).hostname === "waterlooworks.uwaterloo.ca";
  } catch {
    return false;
  }
}

function sendToActiveTab(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        reject(new Error("No active tab found."));
        return;
      }

      if (!isWaterlooWorksUrl(tab.url || "")) {
        reject(new Error("Open waterlooworks.uwaterloo.ca to use this."));
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          const msg =
            error.message && error.message.includes("Receiving end does not exist")
              ? "Couldn't reach the page. Try refreshing WaterlooWorks and retry."
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
  const stored = await getStorage([
    "tasks",
    "envConfigs",
    "profiles",
    LAST_TASK_KEY,
    LAST_ENV_KEY,
    LAST_PROFILE_KEY
  ]);
  const tasks = Array.isArray(stored.tasks) ? stored.tasks : [];
  const envs = Array.isArray(stored.envConfigs) ? stored.envConfigs : [];
  const profiles = Array.isArray(stored.profiles) ? stored.profiles : [];
  renderTasks(tasks);
  renderEnvironments(envs);
  renderProfiles(profiles);

  if (!tasks.length) {
    state.selectedTaskId = "";
    setEnvironmentSelection(envs[0]?.id || "");
    setProfileSelection(profiles[0]?.id || "");
    return;
  }

  const storedTaskId = stored[LAST_TASK_KEY];
  const storedEnvId = stored[LAST_ENV_KEY];
  const storedProfileId = stored[LAST_PROFILE_KEY];
  const initialTaskId = tasks.some((task) => task.id === storedTaskId)
    ? storedTaskId
    : tasks[0].id;
  selectTask(initialTaskId, { resetEnv: false });

  const task = tasks.find((item) => item.id === initialTaskId);
  if (storedEnvId && envs.some((env) => env.id === storedEnvId)) {
    setEnvironmentSelection(storedEnvId);
  } else {
    setEnvironmentSelection(getTaskDefaultEnvId(task));
  }

  if (storedProfileId && profiles.some((profile) => profile.id === storedProfileId)) {
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
    const response = await sendToActiveTab({ type: "EXTRACT_POSTING" });
    if (!response?.ok) {
      setStatus(response?.error || "No posting detected.");
      return false;
    }

    state.postingText = response.sanitized || "";
    updatePostingCount();
    updatePromptCount(0);
    setStatus("Posting extracted.");
    return true;
  } catch (error) {
    setStatus(error.message || "Unable to extract posting.");
    return false;
  }
}

async function handleAnalyze() {
  if (!state.postingText) {
    setStatus("Extract a job posting first.");
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url || !isWaterlooWorksUrl(tab.url)) {
    setStatus("Open waterlooworks.uwaterloo.ca to run tasks.");
    return;
  }

  const taskId = taskSelect.value;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    setStatus("Select a task prompt.");
    return;
  }

  const {
    apiKeys = [],
    activeApiKeyId = "",
    apiConfigs = [],
    activeApiConfigId = "",
    envConfigs = [],
    profiles = [],
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
    "envConfigs",
    "profiles",
    "apiBaseUrl",
    "apiKeyHeader",
    "apiKeyPrefix",
    "model",
    "systemPrompt",
    "resume"
  ]);

  const resolvedConfigs = Array.isArray(apiConfigs) ? apiConfigs : [];
  const resolvedEnvs = Array.isArray(envConfigs) ? envConfigs : [];
  const resolvedProfiles = Array.isArray(profiles) ? profiles : [];
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
  const resumeText = activeProfile?.text || resume || "";
  const resumeType = activeProfile?.type || "Resume";
  const isAdvanced = Boolean(activeConfig?.advanced);
  const resolvedApiUrl = activeConfig?.apiUrl || "";
  const resolvedTemplate = activeConfig?.requestTemplate || "";
  const resolvedApiBaseUrl = activeConfig?.apiBaseUrl || apiBaseUrl || "";
  const resolvedApiKeyHeader = activeConfig?.apiKeyHeader ?? apiKeyHeader ?? "";
  const resolvedApiKeyPrefix = activeConfig?.apiKeyPrefix ?? apiKeyPrefix ?? "";
  const resolvedModel = activeConfig?.model || model || "";

  const resolvedKeys = Array.isArray(apiKeys) ? apiKeys : [];
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
    resumeText,
    resumeType,
    task.text || "",
    state.postingText
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
      resume: resumeText,
      resumeType,
      taskText: task.text || "",
      postingText: state.postingText,
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

updatePostingCount();
updatePromptCount(0);
renderOutput();
setAnalyzing(false);
loadConfig();
loadTheme();

async function loadSavedOutput() {
  const stored = await getStorage([OUTPUT_STORAGE_KEY]);
  state.outputRaw = stored[OUTPUT_STORAGE_KEY] || "";
  renderOutput();
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
  if (!state.autoRunPending) return;
  if (state.isAnalyzing) return;
  if (!state.tasks.length) return;
  selectTask(state.tasks[0].id, { resetEnv: true });
  void persistSelections();
  state.autoRunPending = false;
  void handleExtractAndAnalyze();
}

loadSavedOutput();
loadAutoRunRequest();
ensurePort();

chrome.storage.onChanged.addListener((changes) => {
  if (changes[AUTO_RUN_KEY]?.newValue) {
    state.autoRunPending = true;
    void chrome.storage.local.remove(AUTO_RUN_KEY);
    maybeRunDefaultTask();
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
