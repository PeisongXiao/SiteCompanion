const DEFAULT_TASKS = [];

const DEFAULT_SETTINGS = {
  apiKey: "",
  apiKeys: [],
  activeApiKeyId: "",
  apiConfigs: [],
  activeApiConfigId: "",
  envConfigs: [],
  activeEnvConfigId: "",
  profiles: [],
  apiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-5.2",
  systemPrompt: "",
  tasks: DEFAULT_TASKS,
  shortcuts: [],
  theme: "system",
  toolbarAutoHide: true,
  alwaysShowOutput: false,
  workspaces: []
};

const OUTPUT_STORAGE_KEY = "lastOutput";
const AUTO_RUN_KEY = "autoRunDefaultTask";
const SHORTCUT_RUN_KEY = "runShortcutId";
const DEFAULT_API_KEY_HEADER = "Authorization";
const DEFAULT_API_KEY_PREFIX = "Bearer ";
let activeAbortController = null;
let keepalivePort = null;
const streamState = {
  active: false,
  outputText: "",
  subscribers: new Set()
};

function resetAbort() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  closeKeepalive();
}

function openKeepalive(tabId) {
  if (!tabId || keepalivePort) return;
  try {
    keepalivePort = chrome.tabs.connect(tabId, { name: "sitecompanion-keepalive" });
    keepalivePort.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      keepalivePort = null;
    });
  } catch {
    keepalivePort = null;
  }
}

function closeKeepalive() {
  if (!keepalivePort) return;
  try {
    keepalivePort.disconnect();
  } catch {
    // Ignore disconnect failures.
  }
  keepalivePort = null;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const updates = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = stored[key];
    const missing =
      existing === undefined ||
      existing === null ||
      (key === "tasks" && !Array.isArray(existing));

    if (missing) updates[key] = value;
  }

  const hasApiKeys =
    Array.isArray(stored.apiKeys) && stored.apiKeys.length > 0;

  if (!hasApiKeys && stored.apiKey) {
    const id = crypto?.randomUUID
      ? crypto.randomUUID()
      : `key-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    updates.apiKeys = [{ id, name: "Default", key: stored.apiKey }];
    updates.activeApiKeyId = id;
  } else if (hasApiKeys && stored.activeApiKeyId) {
    const exists = stored.apiKeys.some((key) => key.id === stored.activeApiKeyId);
    if (!exists) {
      updates.activeApiKeyId = stored.apiKeys[0].id;
    }
  } else if (hasApiKeys && !stored.activeApiKeyId) {
    updates.activeApiKeyId = stored.apiKeys[0].id;
  }

  const hasApiConfigs =
    Array.isArray(stored.apiConfigs) && stored.apiConfigs.length > 0;

  if (!hasApiConfigs) {
    const fallbackKeyId =
      updates.activeApiKeyId ||
      stored.activeApiKeyId ||
      stored.apiKeys?.[0]?.id ||
      "";
    const id = crypto?.randomUUID
      ? crypto.randomUUID()
      : `config-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    updates.apiConfigs = [
      {
        id,
        name: "Default",
        apiBaseUrl: stored.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
        model: stored.model || DEFAULT_SETTINGS.model,
        apiKeyId: fallbackKeyId,
        apiUrl: "",
        requestTemplate: "",
        advanced: false
      }
    ];
    updates.activeApiConfigId = id;
  } else if (stored.activeApiConfigId) {
    const exists = stored.apiConfigs.some(
      (config) => config.id === stored.activeApiConfigId
    );
    if (!exists) {
      updates.activeApiConfigId = stored.apiConfigs[0].id;
    }
    const fallbackKeyId =
      updates.activeApiKeyId ||
      stored.activeApiKeyId ||
      stored.apiKeys?.[0]?.id ||
      "";
    const normalizedConfigs = stored.apiConfigs.map((config) => ({
      ...config,
      apiKeyId: config.apiKeyId || fallbackKeyId,
      apiUrl: config.apiUrl || "",
      requestTemplate: config.requestTemplate || "",
      advanced: Boolean(config.advanced)
    }));
    const needsUpdate = normalizedConfigs.some((config, index) => {
      const original = stored.apiConfigs[index];
      return (
        config.apiKeyId !== original.apiKeyId ||
        (config.apiUrl || "") !== (original.apiUrl || "") ||
        (config.requestTemplate || "") !== (original.requestTemplate || "") ||
        Boolean(config.advanced) !== Boolean(original.advanced)
      );
    });
    if (needsUpdate) {
      updates.apiConfigs = normalizedConfigs;
    }
  } else {
    updates.activeApiConfigId = stored.apiConfigs[0].id;
    const fallbackKeyId =
      updates.activeApiKeyId ||
      stored.activeApiKeyId ||
      stored.apiKeys?.[0]?.id ||
      "";
    const normalizedConfigs = stored.apiConfigs.map((config) => ({
      ...config,
      apiKeyId: config.apiKeyId || fallbackKeyId,
      apiUrl: config.apiUrl || "",
      requestTemplate: config.requestTemplate || "",
      advanced: Boolean(config.advanced)
    }));
    const needsUpdate = normalizedConfigs.some((config, index) => {
      const original = stored.apiConfigs[index];
      return (
        config.apiKeyId !== original.apiKeyId ||
        (config.apiUrl || "") !== (original.apiUrl || "") ||
        (config.requestTemplate || "") !== (original.requestTemplate || "") ||
        Boolean(config.advanced) !== Boolean(original.advanced)
      );
    });
    if (needsUpdate) {
      updates.apiConfigs = normalizedConfigs;
    }
  }

  const resolvedApiConfigs = updates.apiConfigs || stored.apiConfigs || [];
  const resolvedActiveApiConfigId =
    updates.activeApiConfigId ||
    stored.activeApiConfigId ||
    resolvedApiConfigs[0]?.id ||
    "";
  const hasEnvConfigs =
    Array.isArray(stored.envConfigs) && stored.envConfigs.length > 0;

  if (!hasEnvConfigs) {
    const id = crypto?.randomUUID
      ? crypto.randomUUID()
      : `env-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    updates.envConfigs = [
      {
        id,
        name: "Default",
        apiConfigId: resolvedActiveApiConfigId,
        systemPrompt: stored.systemPrompt || DEFAULT_SETTINGS.systemPrompt
      }
    ];
    updates.activeEnvConfigId = id;
  } else {
    const normalizedEnvs = stored.envConfigs.map((config) => ({
      ...config,
      apiConfigId: config.apiConfigId || resolvedActiveApiConfigId,
      systemPrompt: config.systemPrompt ?? ""
    }));
    const envNeedsUpdate = normalizedEnvs.some((config, index) => {
      const original = stored.envConfigs[index];
      return (
        config.apiConfigId !== original.apiConfigId ||
        (config.systemPrompt || "") !== (original.systemPrompt || "")
      );
    });
    if (envNeedsUpdate) {
      updates.envConfigs = normalizedEnvs;
    }

    const envActiveId = updates.activeEnvConfigId || stored.activeEnvConfigId;
    if (envActiveId) {
      const exists = stored.envConfigs.some(
        (config) => config.id === envActiveId
      );
      if (!exists) {
        updates.activeEnvConfigId = stored.envConfigs[0].id;
      }
    } else {
      updates.activeEnvConfigId = stored.envConfigs[0].id;
    }
  }

  const hasProfiles =
    Array.isArray(stored.profiles) && stored.profiles.length > 0;
  if (!hasProfiles) {
    const id = crypto?.randomUUID
      ? crypto.randomUUID()
      : `profile-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    updates.profiles = [
      {
        id,
        name: "Default",
        text: stored.resume || ""
      }
    ];
  } else {
    const normalizedProfiles = stored.profiles.map((profile) => ({
      ...profile,
      text: profile.text ?? ""
    }));
    const needsProfileUpdate = normalizedProfiles.some(
      (profile, index) =>
        (profile.text || "") !== (stored.profiles[index]?.text || "")
    );
    if (needsProfileUpdate) {
      updates.profiles = normalizedProfiles;
    }
  }

  const resolvedEnvConfigs = updates.envConfigs || stored.envConfigs || [];
  const defaultEnvId =
    resolvedEnvConfigs[0]?.id ||
    updates.activeEnvConfigId ||
    stored.activeEnvConfigId ||
    "";
  const resolvedProfiles = updates.profiles || stored.profiles || [];
  const defaultProfileId = resolvedProfiles[0]?.id || "";
  const taskSource = Array.isArray(updates.tasks)
    ? updates.tasks
    : Array.isArray(stored.tasks)
      ? stored.tasks
      : [];
  if (taskSource.length) {
    const normalizedTasks = taskSource.map((task) => ({
      ...task,
      defaultEnvId: task.defaultEnvId || defaultEnvId,
      defaultProfileId: task.defaultProfileId || defaultProfileId
    }));
    const needsTaskUpdate = normalizedTasks.some(
      (task, index) =>
        task.defaultEnvId !== taskSource[index]?.defaultEnvId ||
        task.defaultProfileId !== taskSource[index]?.defaultProfileId
    );
    if (needsTaskUpdate) {
      updates.tasks = normalizedTasks;
    }
  }

  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "analysis") return;

  streamState.subscribers.add(port);
  port.onDisconnect.addListener(() => {
    streamState.subscribers.delete(port);
  });

  if (streamState.active) {
    safePost(port, {
      type: "SYNC",
      text: streamState.outputText,
      streaming: true
    });
  }

  port.onMessage.addListener((message) => {
    if (message?.type === "START_ANALYSIS") {
      streamState.outputText = "";
      resetAbort();
      const controller = new AbortController();
      activeAbortController = controller;
      const request = handleAnalysisRequest(port, message.payload, controller.signal);
      void request
        .catch((error) => {
          if (error?.name === "AbortError") {
            safePost(port, { type: "ABORTED" });
            return;
          }
          safePost(port, {
            type: "ERROR",
            message: error?.message || "Unknown error during analysis."
          });
        })
        .finally(() => {
          if (activeAbortController === controller) {
            activeAbortController = null;
          }
        });
      return;
    }

    if (message?.type === "ABORT_ANALYSIS") {
      resetAbort();
    }
  });

});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_POPUP") {
    if (chrome.action?.openPopup) {
      void chrome.action.openPopup().catch(() => {});
    }
    return;
  }
  if (message?.type === "RUN_SHORTCUT") {
    const shortcutId = message.shortcutId || "";
    if (shortcutId) {
      void chrome.storage.local.set({ [SHORTCUT_RUN_KEY]: shortcutId });
      if (chrome.action?.openPopup) {
        void chrome.action.openPopup().catch(() => {});
      }
    }
    return;
  }
  if (message?.type !== "RUN_DEFAULT_TASK") return;
  void chrome.storage.local.set({ [AUTO_RUN_KEY]: Date.now() });
  if (chrome.action?.openPopup) {
    void chrome.action.openPopup().catch(() => {});
  }
});

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

function safePost(port, message) {
  try {
    port.postMessage(message);
  } catch {
    // Port can disconnect when the popup closes; ignore post failures.
  }
}

function broadcast(message) {
  for (const port of streamState.subscribers) {
    safePost(port, message);
  }
}

async function handleAnalysisRequest(port, payload, signal) {
  streamState.outputText = "";
  streamState.active = true;

  const {
    apiKey,
    apiMode,
    apiUrl,
    requestTemplate,
    apiBaseUrl,
    apiKeyHeader,
    apiKeyPrefix,
    model,
    systemPrompt,
    profileText,
    taskText,
    siteText,
    tabId
  } = payload || {};

  const isAdvanced = apiMode === "advanced";
  const resolvedApiKeyHeader = isAdvanced
    ? ""
    : apiKeyHeader || DEFAULT_API_KEY_HEADER;
  const resolvedApiKeyPrefix = isAdvanced
    ? ""
    : apiKeyPrefix ?? DEFAULT_API_KEY_PREFIX;
  if (isAdvanced) {
    if (!apiUrl) {
      safePost(port, { type: "ERROR", message: "Missing API URL." });
      return;
    }
  } else {
    if (!apiBaseUrl) {
      safePost(port, { type: "ERROR", message: "Missing API base URL." });
      return;
    }

    if (resolvedApiKeyHeader && !apiKey) {
      safePost(port, { type: "ERROR", message: "Missing API key." });
      return;
    }

    if (!model) {
      safePost(port, { type: "ERROR", message: "Missing model name." });
      return;
    }
  }

  if (!siteText) {
    safePost(port, { type: "ERROR", message: "No site text provided." });
    return;
  }

  if (!taskText) {
    safePost(port, { type: "ERROR", message: "No task selected." });
    return;
  }

  const userMessage = buildUserMessage(
    profileText,
    taskText,
    siteText
  );

  await chrome.storage.local.set({ [OUTPUT_STORAGE_KEY]: "" });
  openKeepalive(tabId);

  try {
    if (isAdvanced) {
      await streamCustomCompletion({
        apiKey,
        apiUrl,
        requestTemplate,
        apiKeyHeader: resolvedApiKeyHeader,
        apiKeyPrefix: resolvedApiKeyPrefix,
        apiBaseUrl,
        model,
        systemPrompt: systemPrompt || "",
        userMessage,
        signal,
        onDelta: (text) => {
          streamState.outputText += text;
          broadcast({ type: "DELTA", text });
        }
      });
    } else {
      await streamChatCompletion({
        apiKey,
        apiBaseUrl,
        apiKeyHeader: resolvedApiKeyHeader,
        apiKeyPrefix: resolvedApiKeyPrefix,
        model,
        systemPrompt: systemPrompt || "",
        userMessage,
        signal,
        onDelta: (text) => {
          streamState.outputText += text;
          broadcast({ type: "DELTA", text });
        }
      });
    }

    broadcast({ type: "DONE" });
  } finally {
    streamState.active = false;
    await chrome.storage.local.set({ [OUTPUT_STORAGE_KEY]: streamState.outputText });
    closeKeepalive();
  }
}

function buildChatUrl(apiBaseUrl) {
  const trimmed = (apiBaseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function buildAuthHeader(apiKeyHeader, apiKeyPrefix, apiKey) {
  if (!apiKeyHeader) return null;
  return {
    name: apiKeyHeader,
    value: `${apiKeyPrefix || ""}${apiKey || ""}`
  };
}

function replaceQuotedToken(template, token, value) {
  const quoted = `"${token}"`;
  const jsonValue = JSON.stringify(value ?? "");
  return template.split(quoted).join(jsonValue);
}

function replaceTemplateTokens(template, replacements) {
  let output = template || "";
  for (const [token, value] of Object.entries(replacements)) {
    output = replaceQuotedToken(output, token, value ?? "");
    output = output.split(token).join(value ?? "");
  }
  return output;
}

function replaceUrlTokens(url, replacements) {
  let output = url || "";
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(encodeURIComponent(value ?? ""));
  }
  return output;
}

function buildTemplateBody(template, replacements) {
  const filled = replaceTemplateTokens(template, replacements);
  try {
    return JSON.parse(filled);
  } catch {
    throw new Error("Invalid request template JSON.");
  }
}

function extractStreamDelta(parsed) {
  if (!parsed) return "";
  const openAiDelta = parsed?.choices?.[0]?.delta?.content;
  if (openAiDelta) return openAiDelta;
  const openAiMessage = parsed?.choices?.[0]?.message?.content;
  if (openAiMessage) return openAiMessage;
  const ollamaMessage = parsed?.message?.content;
  if (ollamaMessage) return ollamaMessage;
  if (typeof parsed?.response === "string") return parsed.response;
  if (typeof parsed?.content === "string") return parsed.content;
  return "";
}

function parseStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("event:") || trimmed.startsWith("id:")) {
    return null;
  }
  if (trimmed.startsWith("data:")) {
    const data = trimmed.slice(5).trim();
    return data || null;
  }
  return trimmed;
}

async function readSseStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // OpenAI-compatible SSE or newline-delimited JSON streaming.
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const payload = parseStreamLine(line);
      if (!payload) continue;
      if (payload === "[DONE]") return;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = extractStreamDelta(parsed);
      if (delta) onDelta(delta);
      if (parsed?.done === true) return;
    }
  }

  const tail = parseStreamLine(buffer);
  if (!tail) return;
  if (tail === "[DONE]") return;
  try {
    const parsed = JSON.parse(tail);
    const delta = extractStreamDelta(parsed);
    if (delta) onDelta(delta);
  } catch {
    // Ignore trailing parse failures.
  }
}

async function streamChatCompletion({
  apiKey,
  apiBaseUrl,
  apiKeyHeader,
  apiKeyPrefix,
  model,
  systemPrompt,
  userMessage,
  signal,
  onDelta
}) {
  const chatUrl = buildChatUrl(apiBaseUrl);
  if (!chatUrl) {
    throw new Error("Invalid API base URL.");
  }

  const headers = {
    "Content-Type": "application/json"
  };

  const authHeader = buildAuthHeader(apiKeyHeader, apiKeyPrefix, apiKey);
  if (authHeader) {
    headers[authHeader.name] = authHeader.value;
  }

  const response = await fetch(chatUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    }),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  await readSseStream(response, onDelta);
}

async function streamCustomCompletion({
  apiKey,
  apiUrl,
  requestTemplate,
  apiKeyHeader,
  apiKeyPrefix,
  apiBaseUrl,
  model,
  systemPrompt,
  userMessage,
  signal,
  onDelta
}) {
  const replacements = {
    SYSTEM_PROMPT_GOES_HERE: systemPrompt,
    PROMPT_GOES_HERE: userMessage,
    API_KEY_GOES_HERE: apiKey,
    MODEL_GOES_HERE: model || "",
    API_BASE_URL_GOES_HERE: apiBaseUrl || ""
  };
  const resolvedUrl = replaceUrlTokens(apiUrl, replacements);
  const body = buildTemplateBody(requestTemplate, replacements);

  const headers = {
    "Content-Type": "application/json"
  };
  const authHeader = buildAuthHeader(apiKeyHeader, apiKeyPrefix, apiKey);
  if (authHeader) {
    headers[authHeader.name] = authHeader.value;
  }

  const response = await fetch(resolvedUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  await readSseStream(response, onDelta);
}
