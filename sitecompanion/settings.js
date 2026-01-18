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
const globalSitesContainer = document.getElementById("globalSites");
const toc = document.querySelector(".toc");
const tocResizer = document.getElementById("tocResizer");

const OPENAI_DEFAULTS = {
  apiBaseUrl: "https://api.openai.com/v1",
  apiKeyHeader: "Authorization",
  apiKeyPrefix: "Bearer "
};
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_SYSTEM_PROMPT =
  "You are a precise, honest assistant. Be concise and avoid inventing details, be critical about evaluations. You should put in a small summary of all the sections at the end. You should answer in no longer than 3 sections including the summary. And remember to bold or italicize key points.";
const SIDEBAR_WIDTH_KEY = "sidebarWidth";

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

function setStatus(message) {
  if (statusSidebarEl) statusSidebarEl.textContent = message;
  if (!message) return;
  setTimeout(() => {
    if (statusSidebarEl?.textContent === message) statusSidebarEl.textContent = "";
  }, 2000);
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

function normalizeConfigList(list) {
  return Array.isArray(list)
    ? list.map((item) => ({ ...item, enabled: item.enabled !== false }))
    : [];
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
  if (advancedBtn) advancedBtn.disabled = isAdvanced;
}

function readApiConfigFromCard(card) {
  const nameInput = card.querySelector(".api-config-name");
  const keySelect = card.querySelector(".api-config-key-select");
  const baseInput = card.querySelector(".api-config-base");
  const headerInput = card.querySelector(".api-config-header");
  const prefixInput = card.querySelector(".api-config-prefix");
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
    apiKeyHeader: (headerInput?.value || "").trim(),
    apiKeyPrefix: prefixInput?.value || "",
    model: (modelInput?.value || "").trim(),
    apiUrl: (urlInput?.value || "").trim(),
    requestTemplate: (templateInput?.value || "").trim(),
    advanced: isAdvanced,
    enabled: enabledInput ? enabledInput.checked : true
  };
}

function buildApiConfigCard(config) {
  const card = document.createElement("div");
  card.className = "api-config-card";
  card.dataset.id = config.id || newApiConfigId();
  const isAdvanced = Boolean(config.advanced);

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "toggle-label";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = config.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateTaskEnvOptions();
  });
  enabledLabel.appendChild(enabledInput);
  enabledLabel.appendChild(document.createTextNode("Enabled"));

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = config.name || "";
  nameInput.className = "api-config-name";
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

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

  const headerField = document.createElement("div");
  headerField.className = "field advanced-only";
  const headerLabel = document.createElement("label");
  headerLabel.textContent = "API Key Header";
  const headerInput = document.createElement("input");
  headerInput.type = "text";
  headerInput.placeholder = OPENAI_DEFAULTS.apiKeyHeader;
  headerInput.value = config.apiKeyHeader || "";
  headerInput.className = "api-config-header";
  headerField.appendChild(headerLabel);
  headerField.appendChild(headerInput);

  const prefixField = document.createElement("div");
  prefixField.className = "field advanced-only";
  const prefixLabel = document.createElement("label");
  prefixLabel.textContent = "API Key Prefix";
  const prefixInput = document.createElement("input");
  prefixInput.type = "text";
  prefixInput.placeholder = OPENAI_DEFAULTS.apiKeyPrefix;
  prefixInput.value = config.apiKeyPrefix || "";
  prefixInput.className = "api-config-prefix";
  prefixField.appendChild(prefixLabel);
  prefixField.appendChild(prefixInput);

  const modelField = document.createElement("div");
  modelField.className = "field basic-only";
  const modelLabel = document.createElement("label");
  modelLabel.textContent = "Model name";
  const modelInput = document.createElement("input");
  modelInput.type = "text";
  modelInput.placeholder = DEFAULT_MODEL;
  modelInput.value = config.model || "";
  modelInput.className = "api-config-model";
  modelField.appendChild(modelLabel);
  modelField.appendChild(modelInput);

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
  templateLabel.textContent = "Request JSON template";
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
  const addBelowBtn = document.createElement("button");
  addBelowBtn.type = "button";
  addBelowBtn.className = "ghost add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = apiConfigsContainer.firstElementChild;
    if (!first || first === card) return;
    apiConfigsContainer.insertBefore(card, first);
    updateApiConfigControls();
    updateEnvApiOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    apiConfigsContainer.insertBefore(card, previous);
    updateApiConfigControls();
    updateEnvApiOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    apiConfigsContainer.insertBefore(card, next.nextElementSibling);
    updateApiConfigControls();
    updateEnvApiOptions();
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueDefaultName(
      collectNames(apiConfigsContainer, ".api-config-name")
    );
    const newCard = buildApiConfigCard({
      id: newApiConfigId(),
      name,
      apiBaseUrl: OPENAI_DEFAULTS.apiBaseUrl,
      apiKeyHeader: OPENAI_DEFAULTS.apiKeyHeader,
      apiKeyPrefix: OPENAI_DEFAULTS.apiKeyPrefix,
      model: DEFAULT_MODEL,
      apiUrl: "",
      requestTemplate: "",
      advanced: false
    });
    card.insertAdjacentElement("afterend", newCard);
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
    headerInput.value = OPENAI_DEFAULTS.apiKeyHeader;
    prefixInput.value = OPENAI_DEFAULTS.apiKeyPrefix;
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
  headerInput.addEventListener("input", updateSelect);
  prefixInput.addEventListener("input", updateSelect);
  modelInput.addEventListener("input", updateSelect);
  urlInput.addEventListener("input", updateSelect);
  templateInput.addEventListener("input", updateSelect);

  rightActions.appendChild(moveTopBtn);
  rightActions.appendChild(moveUpBtn);
  rightActions.appendChild(moveDownBtn);
  rightActions.appendChild(addBelowBtn);
  rightActions.appendChild(deleteBtn);

  leftActions.appendChild(advancedBtn);
  leftActions.appendChild(resetBtn);

  actions.appendChild(leftActions);
  actions.appendChild(rightActions);

  card.appendChild(enabledLabel);
  card.appendChild(nameField);
  card.appendChild(keyField);
  card.appendChild(baseField);
  card.appendChild(headerField);
  card.appendChild(prefixField);
  card.appendChild(modelField);
  card.appendChild(urlField);
  card.appendChild(templateField);
  card.appendChild(actions);

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
  const card = document.createElement("div");
  card.className = "api-key-card";
  card.dataset.id = entry.id || newApiKeyId();

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "toggle-label";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = entry.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateApiConfigKeyOptions();
  });
  enabledLabel.appendChild(enabledInput);
  enabledLabel.appendChild(document.createTextNode("Enabled"));

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = entry.name || "";
  nameInput.className = "api-key-name";
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
  addBelowBtn.className = "ghost add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = apiKeysContainer.firstElementChild;
    if (!first || first === card) return;
    apiKeysContainer.insertBefore(card, first);
    updateApiKeyControls();
    updateApiConfigKeyOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    apiKeysContainer.insertBefore(card, previous);
    updateApiKeyControls();
    updateApiConfigKeyOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    apiKeysContainer.insertBefore(card, next.nextElementSibling);
    updateApiKeyControls();
    updateApiConfigKeyOptions();
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueDefaultName(
      collectNames(apiKeysContainer, ".api-key-name")
    );
    const newCard = buildApiKeyCard({ id: newApiKeyId(), name, key: "" });
    card.insertAdjacentElement("afterend", newCard);
    updateApiConfigKeyOptions();
    updateApiKeyControls();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  actions.appendChild(addBelowBtn);
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

  card.appendChild(enabledLabel);
  card.appendChild(nameField);
  card.appendChild(keyField);
  card.appendChild(actions);

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
  const card = document.createElement("div");
  card.className = "env-config-card";
  card.dataset.id = config.id || newEnvConfigId();

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "toggle-label";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = config.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateEnvApiOptions();
  });
  enabledLabel.appendChild(enabledInput);
  enabledLabel.appendChild(document.createTextNode("Enabled"));

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = config.name || "";
  nameInput.className = "env-config-name";
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
  addBelowBtn.className = "ghost add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = container.firstElementChild;
    if (!first || first === card) return;
    container.insertBefore(card, first);
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    container.insertBefore(card, previous);
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    container.insertBefore(card, next.nextElementSibling);
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  actions.appendChild(addBelowBtn);

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueDefaultName(
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
    updateEnvApiOptions();
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  const duplicateControls = buildDuplicateControls("envs", () => ({
    id: card.dataset.id,
    name: nameInput.value || "Default",
    apiConfigId: apiSelect.value || "",
    systemPrompt: promptInput.value || "",
    enabled: enabledInput.checked
  }));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateEnvControls(container);
    updateTaskEnvOptions();
  });

  actions.appendChild(duplicateControls);
  actions.appendChild(deleteBtn);
  nameInput.addEventListener("input", () => updateEnvApiOptions());

  card.appendChild(enabledLabel);
  card.appendChild(nameField);
  card.appendChild(apiField);
  card.appendChild(promptField);
  card.appendChild(actions);

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

function updateTaskEnvOptionsForContainer(container, envs) {
  if (!container) return;
  const selects = container.querySelectorAll(".task-env-select");
  selects.forEach((select) => {
    populateSelect(select, envs, "No environments configured");
  });
}

function updateTaskEnvOptions() {
  const envs = collectEnvConfigs().filter((env) => isEnabled(env.enabled));
  updateTaskEnvOptionsForContainer(tasksContainer, envs);

  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const scope = getWorkspaceScopeData(card);
    updateTaskEnvOptionsForContainer(
      card.querySelector(".workspace-tasks"),
      scope.envs
    );
  });

  const siteCards = document.querySelectorAll(".site-card");
  siteCards.forEach((card) => {
    const scope = getSiteScopeData(card);
    updateTaskEnvOptionsForContainer(
      card.querySelector(".site-tasks"),
      scope.envs
    );
  });

  updateShortcutOptions();
  refreshWorkspaceInheritedLists();
  refreshSiteInheritedLists();
  scheduleSidebarErrors();
}

function buildProfileCard(profile, container = profilesContainer) {
  const card = document.createElement("div");
  card.className = "profile-card";
  card.dataset.id = profile.id || newProfileId();

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "toggle-label";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = profile.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateTaskProfileOptions();
  });
  enabledLabel.appendChild(enabledInput);
  enabledLabel.appendChild(document.createTextNode("Enabled"));

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = profile.name || "";
  nameInput.className = "profile-name";
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
  addBelowBtn.className = "ghost add-below";
  addBelowBtn.textContent = "Add";

  moveTopBtn.addEventListener("click", () => {
    const first = container.firstElementChild;
    if (!first || first === card) return;
    container.insertBefore(card, first);
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    container.insertBefore(card, previous);
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    container.insertBefore(card, next.nextElementSibling);
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueDefaultName(
      collectNames(container, ".profile-name")
    );
    const newCard = buildProfileCard({
      id: newProfileId(),
      name,
      text: ""
    }, container);
    card.insertAdjacentElement("afterend", newCard);
    updateProfileControls(container);
    updateTaskProfileOptions();
  });

  const duplicateControls = buildDuplicateControls("profiles", () => ({
    id: card.dataset.id,
    name: nameInput.value || "Default",
    text: textArea.value || "",
    enabled: enabledInput.checked
  }));

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
  actions.appendChild(addBelowBtn);
  actions.appendChild(duplicateControls);
  actions.appendChild(deleteBtn);

  nameInput.addEventListener("input", () => updateTaskProfileOptions());

  card.appendChild(enabledLabel);
  card.appendChild(nameField);
  card.appendChild(textField);
  card.appendChild(actions);

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

function updateTaskProfileOptionsForContainer(container, profiles) {
  if (!container) return;
  const selects = container.querySelectorAll(".task-profile-select");
  selects.forEach((select) => {
    populateSelect(select, profiles, "No profiles configured");
  });
}

function updateTaskProfileOptions() {
  const profiles = collectProfiles().filter((profile) => isEnabled(profile.enabled));
  updateTaskProfileOptionsForContainer(tasksContainer, profiles);

  const workspaceCards = document.querySelectorAll(".workspace-card");
  workspaceCards.forEach((card) => {
    const scope = getWorkspaceScopeData(card);
    updateTaskProfileOptionsForContainer(
      card.querySelector(".workspace-tasks"),
      scope.profiles
    );
  });

  const siteCards = document.querySelectorAll(".site-card");
  siteCards.forEach((card) => {
    const scope = getSiteScopeData(card);
    updateTaskProfileOptionsForContainer(
      card.querySelector(".site-tasks"),
      scope.profiles
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
    const scopedConfigs = getSiteApiConfigs(card);
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
  summary.innerHTML = `<h3 style="display:inline; font-size: 13px; font-weight: 600; margin:0;">${title}</h3>`;
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "panel-body";
  body.style.paddingTop = "10px";
  
  const listContainer = document.createElement("div");
  listContainer.className = containerClass;
  
  if (items && Array.isArray(items)) {
    for (const item of items) {
      listContainer.appendChild(builder(item, listContainer));
    }
  }

  const row = document.createElement("div");
  row.className = "row";
  row.style.marginTop = "8px";
  
  const addBtn = document.createElement("button");
  addBtn.className = "ghost";
  addBtn.type = "button";
  addBtn.textContent = "Add";
  addBtn.addEventListener("click", () => {
    const newItem = newItemFactory(listContainer);
    const newCard = builder(newItem, listContainer);
    listContainer.appendChild(newCard);
    scheduleSidebarErrors();
  });
  
  row.appendChild(addBtn);
  body.appendChild(row);
  body.appendChild(listContainer);
  details.appendChild(body);
  
  return details;
}

function buildAppearanceSection({ theme = "inherit", toolbarPosition = "inherit" } = {}) {
  const details = document.createElement("details");
  details.className = "panel sub-panel";

  const summary = document.createElement("summary");
  summary.className = "panel-summary";
  summary.innerHTML =
    '<h3 style="display:inline; font-size: 13px; font-weight: 600; margin:0;">Appearance</h3>';
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

  body.appendChild(themeField);
  body.appendChild(toolbarField);
  details.appendChild(body);

  return details;
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

function buildScopeGroup(title, content) {
  const wrapper = document.createElement("div");
  wrapper.className = "scope-group";
  const heading = document.createElement("div");
  heading.className = "scope-title hint-accent";
  heading.textContent = title;
  wrapper.appendChild(heading);
  wrapper.appendChild(content);
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
  cardOptions
}) {
  const details = document.createElement("details");
  details.className = "panel sub-panel";
  const summary = document.createElement("summary");
  summary.className = "panel-summary";
  summary.innerHTML = `<h3 style="display:inline; font-size: 13px; font-weight: 600; margin:0;">${title}</h3>`;
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

  body.appendChild(buildScopeGroup("Inherited", inheritedList));

  const localContainer = document.createElement("div");
  localContainer.className = localContainerClass;
  const items = Array.isArray(localItems) ? localItems : [];
  for (const item of items) {
    const options =
      typeof cardOptions === "function" ? cardOptions() : cardOptions;
    localContainer.appendChild(buildCard(item, localContainer, options));
  }

  const localActions = document.createElement("div");
  localActions.className = "row";
  const spacer = document.createElement("div");
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "ghost";
  addBtn.textContent = "Add";
  addBtn.addEventListener("click", () => {
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
  localActions.appendChild(spacer);
  localActions.appendChild(addBtn);

  const localWrapper = document.createElement("div");
  localWrapper.appendChild(localActions);
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

function duplicateToWorkspace(module, source, workspaceId) {
  const workspaceCard = document.querySelector(
    `.workspace-card[data-id="${workspaceId}"]`
  );
  if (!workspaceCard) return;
  const container = workspaceCard.querySelector(`.workspace-${module}`);
  if (!container) return;
  const scope = getWorkspaceScopeData(workspaceCard);
  const card = buildDuplicateCard(module, source, container, scope);
  if (card) {
    container.appendChild(card);
    scheduleSidebarErrors();
  }
}

function duplicateToSite(module, source, siteId) {
  const siteCard = document.querySelector(`.site-card[data-id="${siteId}"]`);
  if (!siteCard) return;
  const container = siteCard.querySelector(`.site-${module}`);
  if (!container) return;
  const scope = getSiteScopeData(siteCard);
  const card = buildDuplicateCard(module, source, container, scope);
  if (card) {
    container.appendChild(card);
    scheduleSidebarErrors();
  }
}

function buildDuplicateControls(module, getSourceData) {
  const wrapper = document.createElement("div");
  wrapper.className = "dup-controls";

  const workspaceBtn = document.createElement("button");
  workspaceBtn.type = "button";
  workspaceBtn.className = "ghost";
  workspaceBtn.textContent = "Duplicate to Workspace";
  const workspaceSelect = document.createElement("select");
  workspaceSelect.className = "dup-select hidden";

  workspaceBtn.addEventListener("click", () => {
    const targets = listWorkspaceTargets();
    fillTargetSelect(workspaceSelect, targets, "Select workspace");
    workspaceSelect.classList.toggle("hidden");
    workspaceSelect.focus();
  });

  workspaceSelect.addEventListener("change", () => {
    if (!workspaceSelect.value) return;
    duplicateToWorkspace(module, getSourceData(), workspaceSelect.value);
    workspaceSelect.value = "";
    workspaceSelect.classList.add("hidden");
  });

  const siteBtn = document.createElement("button");
  siteBtn.type = "button";
  siteBtn.className = "ghost";
  siteBtn.textContent = "Duplicate to Site";
  const siteSelect = document.createElement("select");
  siteSelect.className = "dup-select hidden";

  siteBtn.addEventListener("click", () => {
    const targets = listSiteTargets();
    fillTargetSelect(siteSelect, targets, "Select site");
    siteSelect.classList.toggle("hidden");
    siteSelect.focus();
  });

  siteSelect.addEventListener("change", () => {
    if (!siteSelect.value) return;
    duplicateToSite(module, getSourceData(), siteSelect.value);
    siteSelect.value = "";
    siteSelect.classList.add("hidden");
  });

  wrapper.appendChild(workspaceBtn);
  wrapper.appendChild(workspaceSelect);
  wrapper.appendChild(siteBtn);
  wrapper.appendChild(siteSelect);
  return wrapper;
}

function buildWorkspaceCard(ws, allWorkspaces = [], allSites = []) {
  const card = document.createElement("div");
  card.className = "workspace-card panel";
  card.dataset.id = ws.id || newWorkspaceId();

  const header = document.createElement("div");
  header.className = "row workspace-header";
  header.style.alignItems = "flex-end";

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

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    if (confirm(`Delete workspace "${ws.name}"? All items will move to global.`)) {
      card.remove();
      scheduleSidebarErrors();
    }
  });

  header.appendChild(nameField);
  header.appendChild(deleteBtn);
  card.appendChild(header);

  const appearanceSection = buildAppearanceSection({
    theme: ws.theme || "inherit",
    toolbarPosition: ws.toolbarPosition || "inherit"
  });
  card.appendChild(appearanceSection);

  const disabledInherited = ws.disabledInherited || {};
  const globalApiConfigs = collectApiConfigs();
  const apiConfigSection = document.createElement("details");
  apiConfigSection.className = "panel sub-panel";
  const apiSummary = document.createElement("summary");
  apiSummary.className = "panel-summary";
  apiSummary.innerHTML =
    '<h3 style="display:inline; font-size: 13px; font-weight: 600; margin:0;">API Configurations</h3>';
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
  card.appendChild(apiConfigSection);

  const envSection = buildScopedModuleSection({
    title: "Environments",
    module: "envs",
    parentItems: () => collectEnvConfigs(),
    localItems: ws.envConfigs || [],
    disabledNames: disabledInherited.envs,
    localLabel: "Workspace-specific",
    localContainerClass: "workspace-envs",
    buildCard: buildEnvConfigCard,
    newItemFactory: (container) => ({
      id: newEnvConfigId(),
      name: buildUniqueDefaultName(collectNames(container, ".env-config-name")),
      apiConfigId: getWorkspaceApiConfigs(card)[0]?.id || "",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      enabled: true
    })
  });
  card.appendChild(envSection.details);

  const profileSection = buildScopedModuleSection({
    title: "Profiles",
    module: "profiles",
    parentItems: () => collectProfiles(),
    localItems: ws.profiles || [],
    disabledNames: disabledInherited.profiles,
    localLabel: "Workspace-specific",
    localContainerClass: "workspace-profiles",
    buildCard: buildProfileCard,
    newItemFactory: (container) => ({
      id: newProfileId(),
      name: buildUniqueDefaultName(collectNames(container, ".profile-name")),
      text: "",
      enabled: true
    })
  });
  card.appendChild(profileSection.details);

  const taskSection = buildScopedModuleSection({
    title: "Tasks",
    module: "tasks",
    parentItems: () => collectTasks(),
    localItems: ws.tasks || [],
    disabledNames: disabledInherited.tasks,
    localLabel: "Workspace-specific",
    localContainerClass: "workspace-tasks",
    buildCard: buildTaskCard,
    cardOptions: () => {
      const scope = getWorkspaceScopeData(card);
      return { envs: scope.envs, profiles: scope.profiles };
    },
    newItemFactory: (container) => {
      const scope = getWorkspaceScopeData(card);
      return {
        id: newTaskId(),
        name: buildUniqueDefaultName(collectNames(container, ".task-name")),
        text: "",
        defaultEnvId: scope.envs[0]?.id || "",
        defaultProfileId: scope.profiles[0]?.id || "",
        enabled: true
      };
    }
  });
  card.appendChild(taskSection.details);

  const shortcutSection = buildScopedModuleSection({
    title: "Toolbar Shortcuts",
    module: "shortcuts",
    parentItems: () => collectShortcuts(),
    localItems: ws.shortcuts || [],
    disabledNames: disabledInherited.shortcuts,
    localLabel: "Workspace-specific",
    localContainerClass: "workspace-shortcuts",
    buildCard: buildShortcutCard,
    cardOptions: () => {
      const scope = getWorkspaceScopeData(card);
      return { envs: scope.envs, profiles: scope.profiles, tasks: scope.tasks };
    },
    newItemFactory: (container) => {
      const scope = getWorkspaceScopeData(card);
      return {
        id: newShortcutId(),
        name: "New Shortcut",
        envId: scope.envs[0]?.id || "",
        profileId: scope.profiles[0]?.id || "",
        taskId: scope.tasks[0]?.id || "",
        enabled: true
      };
    }
  });
  card.appendChild(shortcutSection.details);

  const sitesSection = document.createElement("details");
  sitesSection.className = "panel sub-panel";
  const sitesSummary = document.createElement("summary");
  sitesSummary.className = "panel-summary";
  sitesSummary.innerHTML =
    '<h3 style="display:inline; font-size: 13px; font-weight: 600; margin:0;">Sites</h3>';
  sitesSection.appendChild(sitesSummary);
  const sitesBody = document.createElement("div");
  sitesBody.className = "panel-body";
  const siteList = document.createElement("div");
  siteList.className = "sites-list";
  const ownedSites = (allSites || []).filter(
    (site) => (site.workspaceId || "global") === card.dataset.id
  );
  if (!ownedSites.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No sites inherit from this workspace.";
    siteList.appendChild(empty);
  } else {
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
      siteList.appendChild(link);
    }
  }
  sitesBody.appendChild(siteList);
  sitesSection.appendChild(sitesBody);
  card.appendChild(sitesSection);

  return card;
}

function collectSites() {
  const cards = [...sitesContainer.querySelectorAll(".site-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".site-name");
    const patternInput = card.querySelector(".site-pattern");
    const workspaceSelect = card.querySelector(".site-workspace");
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
  const card = document.createElement("div");
  card.className = "site-card panel";
  card.dataset.id = site.id || newSiteId();

  const row = document.createElement("div");
  row.className = "row site-header";
  row.style.alignItems = "flex-end";

  const nameField = document.createElement("div");
  nameField.className = "field";
  nameField.style.flex = "0.6";
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

  const patternField = document.createElement("div");
  patternField.className = "field";
  patternField.style.flex = "1";
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
  });

  row.appendChild(nameField);
  row.appendChild(patternField);
  row.appendChild(wsField);
  row.appendChild(deleteBtn);
  card.appendChild(row);

  const appearanceSection = buildAppearanceSection({
    theme: site.theme || "inherit",
    toolbarPosition: site.toolbarPosition || "inherit"
  });
  card.appendChild(appearanceSection);

  const disabledInherited = site.disabledInherited || {};
  const globalApiConfigs = collectApiConfigs();
  const workspace =
    allWorkspaces.find((ws) => ws.id === wsSelect.value) || null;
  const workspaceDisabled = workspace?.disabledInherited || {};

  const apiConfigSection = document.createElement("details");
  apiConfigSection.className = "panel sub-panel";
  const apiSummary = document.createElement("summary");
  apiSummary.className = "panel-summary";
  apiSummary.innerHTML =
    '<h3 style="display:inline; font-size: 13px; font-weight: 600; margin:0;">API Configurations</h3>';
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
  card.appendChild(apiConfigSection);

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
    newItemFactory: (container) => ({
      id: newEnvConfigId(),
      name: buildUniqueDefaultName(collectNames(container, ".env-config-name")),
      apiConfigId: getSiteApiConfigs(card)[0]?.id || "",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      enabled: true
    })
  });
  card.appendChild(envSection.details);

  const profileSection = buildScopedModuleSection({
    title: "Profiles",
    module: "profiles",
    parentItems: () => resolveWorkspaceScope().profiles,
    localItems: site.profiles || [],
    disabledNames: disabledInherited.profiles,
    localLabel: "Site-specific",
    localContainerClass: "site-profiles",
    buildCard: buildProfileCard,
    newItemFactory: (container) => ({
      id: newProfileId(),
      name: buildUniqueDefaultName(collectNames(container, ".profile-name")),
      text: "",
      enabled: true
    })
  });
  card.appendChild(profileSection.details);

  const taskSection = buildScopedModuleSection({
    title: "Tasks",
    module: "tasks",
    parentItems: () => resolveWorkspaceScope().tasks,
    localItems: site.tasks || [],
    disabledNames: disabledInherited.tasks,
    localLabel: "Site-specific",
    localContainerClass: "site-tasks",
    buildCard: buildTaskCard,
    cardOptions: () => {
      const scope = getSiteScopeData(card);
      return { envs: scope.envs, profiles: scope.profiles };
    },
    newItemFactory: (container) => {
      const scope = getSiteScopeData(card);
      return {
        id: newTaskId(),
        name: buildUniqueDefaultName(collectNames(container, ".task-name")),
        text: "",
        defaultEnvId: scope.envs[0]?.id || "",
        defaultProfileId: scope.profiles[0]?.id || "",
        enabled: true
      };
    }
  });
  card.appendChild(taskSection.details);

  const shortcutSection = buildScopedModuleSection({
    title: "Toolbar Shortcuts",
    module: "shortcuts",
    parentItems: () => resolveWorkspaceScope().shortcuts,
    localItems: site.shortcuts || [],
    disabledNames: disabledInherited.shortcuts,
    localLabel: "Site-specific",
    localContainerClass: "site-shortcuts",
    buildCard: buildShortcutCard,
    cardOptions: () => {
      const scope = getSiteScopeData(card);
      return { envs: scope.envs, profiles: scope.profiles, tasks: scope.tasks };
    },
    newItemFactory: (container) => {
      const scope = getSiteScopeData(card);
      return {
        id: newShortcutId(),
        name: "New Shortcut",
        envId: scope.envs[0]?.id || "",
        profileId: scope.profiles[0]?.id || "",
        taskId: scope.tasks[0]?.id || "",
        enabled: true
      };
    }
  });
  card.appendChild(shortcutSection.details);

  return card;
}

function buildTaskCard(task, container = tasksContainer, options = {}) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.dataset.id = task.id || newTaskId();

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "toggle-label";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = task.enabled !== false;
  enabledInput.addEventListener("change", () => {
    updateShortcutOptions();
    scheduleSidebarErrors();
  });
  enabledLabel.appendChild(enabledInput);
  enabledLabel.appendChild(document.createTextNode("Enabled"));

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = task.name || "";
  nameInput.className = "task-name";
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const envField = document.createElement("div");
  envField.className = "field";
  const envLabel = document.createElement("label");
  envLabel.textContent = "Default environment";
  const envSelect = document.createElement("select");
  envSelect.className = "task-env-select";
  envSelect.dataset.preferred = task.defaultEnvId || "";
  envField.appendChild(envLabel);
  envField.appendChild(envSelect);

  const profileField = document.createElement("div");
  profileField.className = "field";
  const profileLabel = document.createElement("label");
  profileLabel.textContent = "Default profile";
  const profileSelect = document.createElement("select");
  profileSelect.className = "task-profile-select";
  profileSelect.dataset.preferred = task.defaultProfileId || "";
  profileField.appendChild(profileLabel);
  profileField.appendChild(profileSelect);

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
  addBelowBtn.className = "ghost add-below";
  addBelowBtn.textContent = "Add";
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";

  moveTopBtn.addEventListener("click", () => {
    const first = container.firstElementChild;
    if (!first || first === card) return;
    container.insertBefore(card, first);
    updateTaskControls(container);
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    container.insertBefore(card, previous);
    updateTaskControls(container);
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    container.insertBefore(card, next.nextElementSibling);
    updateTaskControls(container);
  });

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueDefaultName(
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
    updateTaskControls(container);
    updateTaskEnvOptions();
    updateTaskProfileOptions();
  });

  const duplicateControls = buildDuplicateControls("tasks", () => ({
    id: card.dataset.id,
    name: nameInput.value || "Untitled",
    text: textArea.value,
    defaultEnvId: envSelect.value || "",
    defaultProfileId: profileSelect.value || "",
    enabled: enabledInput.checked
  }));

  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateTaskControls(container);
    updateShortcutOptions();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  actions.appendChild(addBelowBtn);
  actions.appendChild(duplicateControls);
  actions.appendChild(deleteBtn);

  card.appendChild(enabledLabel);
  card.appendChild(nameField);
  card.appendChild(envField);
  card.appendChild(profileField);
  card.appendChild(textField);
  card.appendChild(actions);

  nameInput.addEventListener("input", () => updateShortcutOptions());

  return card;
}

function buildShortcutCard(shortcut, _container, options = {}) {
  const card = document.createElement("div");
  card.className = "shortcut-card";
  card.dataset.id = shortcut.id || newShortcutId();

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "toggle-label";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.className = "config-enabled";
  enabledInput.checked = shortcut.enabled !== false;
  enabledInput.addEventListener("change", () => {
    scheduleSidebarErrors();
  });
  enabledLabel.appendChild(enabledInput);
  enabledLabel.appendChild(document.createTextNode("Enabled"));

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = shortcut.name || "";
  nameInput.className = "shortcut-name";
  nameInput.addEventListener("input", () => scheduleSidebarErrors());
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const envField = document.createElement("div");
  envField.className = "field";
  const envLabel = document.createElement("label");
  envLabel.textContent = "Environment";
  const envSelect = document.createElement("select");
  envSelect.className = "shortcut-env";
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
  envField.appendChild(envLabel);
  envField.appendChild(envSelect);

  const profileField = document.createElement("div");
  profileField.className = "field";
  const profileLabel = document.createElement("label");
  profileLabel.textContent = "Profile";
  const profileSelect = document.createElement("select");
  profileSelect.className = "shortcut-profile";
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
  profileField.appendChild(profileLabel);
  profileField.appendChild(profileSelect);

  const taskField = document.createElement("div");
  taskField.className = "field";
  const taskLabel = document.createElement("label");
  taskLabel.textContent = "Task";
  const taskSelect = document.createElement("select");
  taskSelect.className = "shortcut-task";
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
  taskField.appendChild(taskLabel);
  taskField.appendChild(taskSelect);

  const actions = document.createElement("div");
  actions.className = "shortcut-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    scheduleSidebarErrors();
  });

  card.appendChild(enabledLabel);
  card.appendChild(nameField);
  card.appendChild(envField);
  card.appendChild(profileField);
  card.appendChild(taskField);
  actions.appendChild(
    buildDuplicateControls("shortcuts", () => ({
      id: card.dataset.id,
      name: nameInput.value || "Untitled Shortcut",
      envId: envSelect.value || "",
      profileId: profileSelect.value || "",
      taskId: taskSelect.value || "",
      enabled: enabledInput.checked
    }))
  );
  actions.appendChild(deleteBtn);
  card.appendChild(actions);

  return card;
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
  });

  checkNameInputs(sitesContainer, ".site-name", "Sites");

  if (!enabledTasks.length) errors.push("No tasks enabled.");
  if (!enabledEnvs.length) errors.push("No environments enabled.");
  if (!enabledProfiles.length) errors.push("No profiles enabled.");
  if (!enabledApiConfigs.length) errors.push("No API configs enabled.");
  if (!enabledApiKeys.length) errors.push("No API keys enabled.");

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
      if (!defaultApiConfig.apiUrl) {
        errors.push("Default API config is missing an API URL.");
      }
      if (!defaultApiConfig.requestTemplate) {
        errors.push("Default API config is missing a request template.");
      }
    } else {
      if (!defaultApiConfig.apiBaseUrl) {
        errors.push("Default API config is missing a base URL.");
      }
      if (!defaultApiConfig.model) {
        errors.push("Default API config is missing a model name.");
      }
    }

    const needsKey =
      Boolean(defaultApiConfig?.apiKeyHeader) ||
      Boolean(
        defaultApiConfig?.requestTemplate?.includes("API_KEY_GOES_HERE")
      );
    if (needsKey) {
      const key = enabledApiKeys.find(
        (entry) => entry.id === defaultApiConfig?.apiKeyId
      );
      if (!key || !key.key) {
        errors.push("Default API config is missing an API key.");
      }
    }
  }

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

  if (!errors.length) {
    sidebarErrorsEl.classList.add("hidden");
    sidebarErrorsEl.textContent = "";
    renderGlobalSitesList(collectSites());
    return;
  }

  sidebarErrorsEl.textContent = errors.map((error) => `- ${error}`).join("\n");
  sidebarErrorsEl.classList.remove("hidden");
  renderGlobalSitesList(collectSites());
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
    apiKeyHeader = "",
    apiKeyPrefix = "",
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
    "apiKeyHeader",
    "apiKeyPrefix",
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
    sites = sites.map((site) => {
      if (!site || typeof site !== "object") return site;
      return {
        ...site,
        name: site.name || site.urlPattern || "",
        workspaceId: site.workspaceId || "global",
        theme: site.theme || "inherit",
        toolbarPosition: site.toolbarPosition || "inherit",
        envConfigs: normalizeConfigList(site.envConfigs),
        profiles: normalizeConfigList(site.profiles),
        tasks: normalizeConfigList(site.tasks),
        shortcuts: normalizeConfigList(site.shortcuts),
        disabledInherited: normalizeDisabledInherited(site.disabledInherited)
      };
    });
  }

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
      apiKeyHeader: apiKeyHeader || OPENAI_DEFAULTS.apiKeyHeader,
      apiKeyPrefix: apiKeyPrefix || OPENAI_DEFAULTS.apiKeyPrefix,
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

  workspacesContainer.innerHTML = "";
  for (const ws of workspaces) {
    workspacesContainer.appendChild(buildWorkspaceCard(ws, workspaces));
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
      workspaces,
      sites
    });
    await chrome.storage.local.remove("presets");
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
  const name = buildUniqueDefaultName(
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
  updateTaskControls(tasksContainer);
  updateTaskEnvOptions();
  updateTaskProfileOptions();
});

addApiKeyBtn.addEventListener("click", () => {
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
  updateApiConfigKeyOptions();
  updateApiKeyControls();
});

addApiConfigBtn.addEventListener("click", () => {
  const name = buildUniqueDefaultName(
    collectNames(apiConfigsContainer, ".api-config-name")
  );
  const newCard = buildApiConfigCard({
    id: newApiConfigId(),
    name,
    apiBaseUrl: OPENAI_DEFAULTS.apiBaseUrl,
    apiKeyHeader: OPENAI_DEFAULTS.apiKeyHeader,
    apiKeyPrefix: OPENAI_DEFAULTS.apiKeyPrefix,
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
  updateApiConfigKeyOptions();
  updateEnvApiOptions();
  updateApiConfigControls();
});

addEnvConfigBtn.addEventListener("click", () => {
  const name = buildUniqueDefaultName(
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
  updateEnvApiOptions();
  updateEnvControls();
  updateTaskEnvOptions();
});

addProfileBtn.addEventListener("click", () => {
  const name = buildUniqueDefaultName(
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
  updateProfileControls(profilesContainer);
  updateTaskProfileOptions();
});

addWorkspaceBtn.addEventListener("click", () => {
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
  refreshWorkspaceInheritedLists();
  scheduleSidebarErrors();
  updateToc(collectWorkspaces(), collectSites());
});

addSiteBtn.addEventListener("click", () => {
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
  refreshSiteInheritedLists();
  scheduleSidebarErrors();
  updateToc(collectWorkspaces(), collectSites());
});

addShortcutBtn.addEventListener("click", () => {
  const newCard = buildShortcutCard({
    id: newShortcutId(),
    name: "New Shortcut",
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
  scheduleSidebarErrors();
});

themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
initSidebarResize();

loadSettings();

function openDetailsChain(target) {
  let node = target;
  while (node) {
    if (node.tagName === "DETAILS") {
      node.open = true;
    }
    node = node.parentElement?.closest("details");
  }
}

function updateToc(workspaces, sites) {
  const wsList = document.getElementById("toc-workspaces-list");
  if (!wsList) return;
  
  wsList.innerHTML = "";
  for (const ws of workspaces) {
    const li = document.createElement("li");
    const details = document.createElement("details");
    details.className = "toc-group toc-workspace";
    const summary = document.createElement("summary");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = ws.name || "Untitled";
    summary.appendChild(a);
    details.appendChild(summary);

    const subUl = document.createElement("ul");
    subUl.className = "toc-sub";
    
    const sections = [
      "Appearance",
      "API Configurations",
      "Environments",
      "Profiles",
      "Tasks",
      "Toolbar Shortcuts",
      "Sites"
    ];
    for (const section of sections) {
        const subLi = document.createElement("li");
        const subA = document.createElement("a");
        subA.textContent = section;
        subA.href = "#";
        subA.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const card = document.querySelector(`.workspace-card[data-id="${ws.id}"]`);
            if (card) {
                // Find details with summary text containing section name
                const details = [...card.querySelectorAll("details")].find(d => 
                  d.querySelector(".panel-summary").textContent.includes(section)
                );
                if (details) {
                    openDetailsChain(details);
                    details.scrollIntoView({ behavior: "smooth", block: "start" });
                } else {
                    card.scrollIntoView({ behavior: "smooth", block: "start" });
                    openDetailsChain(document.getElementById("workspaces-panel"));
                }
            }
        });
        subLi.appendChild(subA);
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
  }
  
  const sitesList = document.getElementById("toc-sites-list");
  if (sitesList) {
    sitesList.innerHTML = "";
    for (const site of sites) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.textContent = site.name || site.urlPattern || "Untitled Site";
        a.href = "#";
        a.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const card = document.querySelector(`.site-card[data-id="${site.id}"]`);
            if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                openDetailsChain(document.getElementById("sites-panel"));
            }
        });
        li.appendChild(a);
        sitesList.appendChild(li);
    }
  }
}

function initToc() {
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
}

document.addEventListener("DOMContentLoaded", initToc);

document.addEventListener("input", scheduleSidebarErrors);
document.addEventListener("change", scheduleSidebarErrors);
