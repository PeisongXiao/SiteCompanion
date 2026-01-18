const saveBtn = document.getElementById("saveBtn");
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
const addPresetBtn = document.getElementById("addPresetBtn");
const presetsContainer = document.getElementById("presets");
const statusEl = document.getElementById("status");
const statusSidebarEl = document.getElementById("statusSidebar");
const sidebarErrorsEl = document.getElementById("sidebarErrors");
const themeSelect = document.getElementById("themeSelect");
const toolbarPositionSelect = document.getElementById("toolbarPositionSelect");

const OPENAI_DEFAULTS = {
  apiBaseUrl: "https://api.openai.com/v1",
  apiKeyHeader: "Authorization",
  apiKeyPrefix: "Bearer "
};
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_SYSTEM_PROMPT =
  "You are a precise, honest assistant. Be concise and avoid inventing details, be critical about evaluations. You should put in a small summary of all the sections at the end. You should answer in no longer than 3 sections including the summary. And remember to bold or italicize key points.";

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStatus(message) {
  statusEl.textContent = message;
  if (statusSidebarEl) statusSidebarEl.textContent = message;
  if (!message) return;
  setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = "";
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

function newPresetId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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

function getTopEnvId() {
  return collectEnvConfigs()[0]?.id || "";
}

function getTopProfileId() {
  return collectProfiles()[0]?.id || "";
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
    advanced: isAdvanced
  };
}

function buildApiConfigCard(config) {
  const card = document.createElement("div");
  card.className = "api-config-card";
  card.dataset.id = config.id || newApiConfigId();
  const isAdvanced = Boolean(config.advanced);

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
  const duplicateBtn = document.createElement("button");
  duplicateBtn.type = "button";
  duplicateBtn.className = "ghost duplicate";
  duplicateBtn.textContent = "Duplicate";
  duplicateBtn.addEventListener("click", () => {
    const names = collectNames(apiConfigsContainer, ".api-config-name");
    const copy = readApiConfigFromCard(card);
    copy.id = newApiConfigId();
    copy.name = ensureUniqueName(`${copy.name || "Default"} Copy`, names);
    const newCard = buildApiConfigCard(copy);
    card.insertAdjacentElement("afterend", newCard);
    updateApiConfigKeyOptions();
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
  rightActions.appendChild(duplicateBtn);
  rightActions.appendChild(deleteBtn);

  leftActions.appendChild(advancedBtn);
  leftActions.appendChild(resetBtn);

  actions.appendChild(leftActions);
  actions.appendChild(rightActions);

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
    return {
      id: card.dataset.id || newApiKeyId(),
      name: (nameInput?.value || "Default").trim(),
      key: (keyInput?.value || "").trim()
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
  const keys = collectApiKeys();
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

function buildEnvConfigCard(config) {
  const card = document.createElement("div");
  card.className = "env-config-card";
  card.dataset.id = config.id || newEnvConfigId();

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
    const first = envConfigsContainer.firstElementChild;
    if (!first || first === card) return;
    envConfigsContainer.insertBefore(card, first);
    updateEnvControls();
    updateTaskEnvOptions();
  });

  moveUpBtn.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (!previous) return;
    envConfigsContainer.insertBefore(card, previous);
    updateEnvControls();
    updateTaskEnvOptions();
  });

  moveDownBtn.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (!next) return;
    envConfigsContainer.insertBefore(card, next.nextElementSibling);
    updateEnvControls();
    updateTaskEnvOptions();
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  actions.appendChild(addBelowBtn);

  addBelowBtn.addEventListener("click", () => {
    const name = buildUniqueDefaultName(
      collectNames(envConfigsContainer, ".env-config-name")
    );
    const fallbackApiConfigId = collectApiConfigs()[0]?.id || "";
    const newCard = buildEnvConfigCard({
      id: newEnvConfigId(),
      name,
      apiConfigId: fallbackApiConfigId,
      systemPrompt: DEFAULT_SYSTEM_PROMPT
    });
    card.insertAdjacentElement("afterend", newCard);
    updateEnvApiOptions();
    updateEnvControls();
    updateTaskEnvOptions();
  });

  const duplicateBtn = document.createElement("button");
  duplicateBtn.type = "button";
  duplicateBtn.className = "ghost duplicate";
  duplicateBtn.textContent = "Duplicate";
  duplicateBtn.addEventListener("click", () => {
    const names = collectNames(envConfigsContainer, ".env-config-name");
    const copy = collectEnvConfigs().find((entry) => entry.id === card.dataset.id) || {
      id: card.dataset.id,
      name: nameInput.value || "Default",
      apiConfigId: apiSelect.value || "",
      systemPrompt: promptInput.value || ""
    };
    const newCard = buildEnvConfigCard({
      id: newEnvConfigId(),
      name: ensureUniqueName(`${copy.name || "Default"} Copy`, names),
      apiConfigId: copy.apiConfigId,
      systemPrompt: copy.systemPrompt
    });
    card.insertAdjacentElement("afterend", newCard);
    updateEnvApiOptions();
    updateEnvControls();
    updateTaskEnvOptions();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateEnvControls();
    updateTaskEnvOptions();
  });

  actions.appendChild(duplicateBtn);
  actions.appendChild(deleteBtn);
  nameInput.addEventListener("input", () => updateEnvApiOptions());

  card.appendChild(nameField);
  card.appendChild(apiField);
  card.appendChild(promptField);
  card.appendChild(actions);

  return card;
}

function updateEnvControls() {
  const cards = [...envConfigsContainer.querySelectorAll(".env-config-card")];
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

function updateTaskEnvOptions() {
  const envs = collectEnvConfigs();
  const selects = tasksContainer.querySelectorAll(".task-env-select");
  selects.forEach((select) => {
    const preferred = select.dataset.preferred || select.value;
    select.innerHTML = "";
    if (!envs.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No environments configured";
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    for (const env of envs) {
      const option = document.createElement("option");
      option.value = env.id;
      option.textContent = env.name || "Default";
      select.appendChild(option);
    }

    if (preferred && envs.some((env) => env.id === preferred)) {
      select.value = preferred;
    } else {
      select.value = envs[0].id;
    }

    select.dataset.preferred = select.value;
  });
  scheduleSidebarErrors();
}

function buildProfileCard(profile, container = profilesContainer) {
  const card = document.createElement("div");
  card.className = "profile-card";
  card.dataset.id = profile.id || newProfileId();

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

  const duplicateBtn = document.createElement("button");
  duplicateBtn.type = "button";
  duplicateBtn.className = "ghost duplicate";
  duplicateBtn.textContent = "Duplicate";
  duplicateBtn.addEventListener("click", () => {
    const names = collectNames(container, ".profile-name");
    const copy = collectProfiles(container).find((entry) => entry.id === card.dataset.id) || {
      id: card.dataset.id,
      name: nameInput.value || "Default",
      text: textArea.value || ""
    };
    const newCard = buildProfileCard({
      id: newProfileId(),
      name: ensureUniqueName(`${copy.name || "Default"} Copy`, names),
      text: copy.text
    }, container);
    card.insertAdjacentElement("afterend", newCard);
    updateProfileControls(container);
    updateTaskProfileOptions();
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
  actions.appendChild(addBelowBtn);
  actions.appendChild(duplicateBtn);
  actions.appendChild(deleteBtn);

  nameInput.addEventListener("input", () => updateTaskProfileOptions());

  card.appendChild(nameField);
  card.appendChild(textField);
  card.appendChild(actions);

  return card;
}

function collectProfiles(container = profilesContainer) {
  const cards = [...container.querySelectorAll(".profile-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".profile-name");
    const textArea = card.querySelector(".profile-text");
    return {
      id: card.dataset.id || newProfileId(),
      name: (nameInput?.value || "Default").trim(),
      text: (textArea?.value || "").trim()
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

function updateTaskProfileOptions() {
  const profiles = collectProfiles();
  const selects = tasksContainer.querySelectorAll(".task-profile-select");
  selects.forEach((select) => {
    const preferred = select.dataset.preferred || select.value;
    select.innerHTML = "";
    if (!profiles.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No profiles configured";
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    for (const profile of profiles) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name || "Default";
      select.appendChild(option);
    }

    if (preferred && profiles.some((profile) => profile.id === preferred)) {
      select.value = preferred;
    } else {
      select.value = profiles[0].id;
    }

    select.dataset.preferred = select.value;
  });
  scheduleSidebarErrors();
}

function updateEnvApiOptions() {
  const apiConfigs = collectApiConfigs();
  const selects = envConfigsContainer.querySelectorAll(".env-config-api-select");
  selects.forEach((select) => {
    const preferred = select.dataset.preferred || select.value;
    select.innerHTML = "";
    if (!apiConfigs.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No API configs configured";
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    for (const config of apiConfigs) {
      const option = document.createElement("option");
      option.value = config.id;
      option.textContent = config.name || "Default";
      select.appendChild(option);
    }

    if (preferred && apiConfigs.some((config) => config.id === preferred)) {
      select.value = preferred;
    } else {
      select.value = apiConfigs[0].id;
    }

    select.dataset.preferred = select.value;
  });
  updateTaskEnvOptions();
}

function collectWorkspaces() {
  const cards = [...workspacesContainer.querySelectorAll(".workspace-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".workspace-name");
    const themeSelect = card.querySelector(".workspace-theme");
    
    // Collect nested resources
    const envsContainer = card.querySelector(".workspace-envs");
    const profilesContainer = card.querySelector(".workspace-profiles");
    const tasksContainer = card.querySelector(".workspace-tasks");
    const presetsContainer = card.querySelector(".workspace-presets");

    // We can reuse collect functions if they accept a container!
    // But collectEnvConfigs currently returns objects with flat IDs. 
    // We'll need to ensure we don't lose the nested nature or we handle it during save.
    
    // Actually, saveSettings stores workspaces array. If we put the resources inside, it works.
    
    return {
      id: card.dataset.id || newWorkspaceId(),
      name: (nameInput?.value || "Untitled Workspace").trim(),
      theme: themeSelect?.value || "inherit",
      envConfigs: envsContainer ? collectEnvConfigs(envsContainer) : [],
      profiles: profilesContainer ? collectProfiles(profilesContainer) : [],
      tasks: tasksContainer ? collectTasks(tasksContainer) : [],
      presets: presetsContainer ? collectPresets(presetsContainer) : []
    };
  });
}

function collectPresets(container = presetsContainer) {
  const cards = [...container.querySelectorAll(".preset-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".preset-name");
    const envSelect = card.querySelector(".preset-env");
    const profileSelect = card.querySelector(".preset-profile");
    const taskSelect = card.querySelector(".preset-task");
    return {
      id: card.dataset.id || newPresetId(),
      name: (nameInput?.value || "Untitled Preset").trim(),
      envId: envSelect?.value || "",
      profileId: profileSelect?.value || "",
      taskId: taskSelect?.value || ""
    };
  });
}

function collectEnvConfigs(container = envConfigsContainer) {
  const cards = [...container.querySelectorAll(".env-config-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".env-config-name");
    const apiSelect = card.querySelector(".env-config-api-select");
    const promptInput = card.querySelector(".env-config-prompt");
    return {
      id: card.dataset.id || newEnvConfigId(),
      name: (nameInput?.value || "Default").trim(),
      apiConfigId: apiSelect?.value || "",
      systemPrompt: (promptInput?.value || "").trim()
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

function buildWorkspaceCard(ws) {
  const card = document.createElement("div");
  card.className = "workspace-card panel";
  card.dataset.id = ws.id || newWorkspaceId();

  const header = document.createElement("div");
  header.className = "workspace-header";
  
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = ws.name || "";
  nameInput.className = "workspace-name";
  nameInput.placeholder = "Workspace Name";
  
  const themeSelect = document.createElement("select");
  themeSelect.className = "workspace-theme";
  const themes = ["inherit", "light", "dark", "system"];
  for (const t of themes) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    themeSelect.appendChild(opt);
  }
  themeSelect.value = ws.theme || "inherit";

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

  header.appendChild(nameInput);
  header.appendChild(themeSelect);
  header.appendChild(deleteBtn);
  card.appendChild(header);

  // Subsections
  const envSection = renderWorkspaceSection(
    "Environments", 
    "workspace-envs", 
    ws.envConfigs, 
    buildEnvConfigCard,
    (container) => ({
      id: newEnvConfigId(),
      name: buildUniqueDefaultName(collectNames(container, ".env-config-name")),
      apiConfigId: collectApiConfigs()[0]?.id || "",
      systemPrompt: DEFAULT_SYSTEM_PROMPT
    })
  );
  card.appendChild(envSection);

  const profileSection = renderWorkspaceSection(
    "Profiles",
    "workspace-profiles",
    ws.profiles,
    buildProfileCard,
    (container) => ({
      id: newProfileId(),
      name: buildUniqueDefaultName(collectNames(container, ".profile-name")),
      text: ""
    })
  );
  card.appendChild(profileSection);

  const taskSection = renderWorkspaceSection(
    "Tasks",
    "workspace-tasks",
    ws.tasks,
    buildTaskCard,
    (container) => ({
      id: newTaskId(),
      name: buildUniqueDefaultName(collectNames(container, ".task-name")),
      text: "",
      defaultEnvId: "",
      defaultProfileId: ""
    })
  );
  card.appendChild(taskSection);

  const presetSection = renderWorkspaceSection(
    "Presets",
    "workspace-presets",
    ws.presets,
    buildPresetCard,
    (container) => ({
      id: newPresetId(),
      name: "New Preset",
      envId: "",
      profileId: "",
      taskId: ""
    })
  );
  card.appendChild(presetSection);

  return card;
}

function collectSites() {
  const cards = [...sitesContainer.querySelectorAll(".site-card")];
  return cards.map((card) => {
    const patternInput = card.querySelector(".site-pattern");
    const workspaceSelect = card.querySelector(".site-workspace");
    return {
      id: card.dataset.id || newSiteId(),
      urlPattern: (patternInput?.value || "").trim(),
      workspaceId: workspaceSelect?.value || "global"
    };
  });
}

function buildSiteCard(site) {
  const card = document.createElement("div");
  card.className = "site-card panel";
  card.dataset.id = site.id || newSiteId();

  const row = document.createElement("div");
  row.className = "row";
  row.style.alignItems = "flex-end";

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
  patternField.appendChild(patternLabel);
  patternField.appendChild(patternInput);

  const wsField = document.createElement("div");
  wsField.className = "field";
  const wsLabel = document.createElement("label");
  wsLabel.textContent = "Workspace";
  const wsSelect = document.createElement("select");
  wsSelect.className = "site-workspace";
  
  // Populate workspaces
  const workspaces = collectWorkspaces();
  const globalOpt = document.createElement("option");
  globalOpt.value = "global";
  globalOpt.textContent = "Global";
  wsSelect.appendChild(globalOpt);
  
  for (const ws of workspaces) {
    const opt = document.createElement("option");
    opt.value = ws.id;
    opt.textContent = ws.name;
    wsSelect.appendChild(opt);
  }
  wsSelect.value = site.workspaceId || "global";

  wsField.appendChild(wsLabel);
  wsField.appendChild(wsSelect);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    scheduleSidebarErrors();
  });

  row.appendChild(patternField);
  row.appendChild(wsField);
  row.appendChild(deleteBtn);
  card.appendChild(row);

  return card;
}

function buildTaskCard(task, container = tasksContainer) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.dataset.id = task.id || newTaskId();

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
  const duplicateBtn = document.createElement("button");
  duplicateBtn.type = "button";
  duplicateBtn.className = "ghost duplicate";
  duplicateBtn.textContent = "Duplicate";
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
    const newCard = buildTaskCard({
      id: newTaskId(),
      name,
      text: "",
      defaultEnvId: getTopEnvId(),
      defaultProfileId: getTopProfileId()
    }, container);
    card.insertAdjacentElement("afterend", newCard);
    updateTaskControls(container);
    updateTaskEnvOptions();
    updateTaskProfileOptions();
  });

  duplicateBtn.addEventListener("click", () => {
    const copy = {
      id: newTaskId(),
      name: ensureUniqueName(
        `${nameInput.value || "Untitled"} Copy`,
        collectNames(container, ".task-name")
      ),
      text: textArea.value,
      defaultEnvId: envSelect.value || "",
      defaultProfileId: profileSelect.value || ""
    };
    const newCard = buildTaskCard(copy, container);
    card.insertAdjacentElement("afterend", newCard);
    updateTaskControls(container);
    updateTaskEnvOptions();
    updateTaskProfileOptions();
  });

  deleteBtn.addEventListener("click", () => {
    card.remove();
    updateTaskControls(container);
  });

  actions.appendChild(moveTopBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  actions.appendChild(addBelowBtn);
  actions.appendChild(duplicateBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(nameField);
  card.appendChild(envField);
  card.appendChild(profileField);
  card.appendChild(textField);
  card.appendChild(actions);

  return card;
}

function collectPresets() {
  const cards = [...presetsContainer.querySelectorAll(".preset-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".preset-name");
    const envSelect = card.querySelector(".preset-env");
    const profileSelect = card.querySelector(".preset-profile");
    const taskSelect = card.querySelector(".preset-task");
    return {
      id: card.dataset.id || newPresetId(),
      name: (nameInput?.value || "Untitled Preset").trim(),
      envId: envSelect?.value || "",
      profileId: profileSelect?.value || "",
      taskId: taskSelect?.value || ""
    };
  });
}

function buildPresetCard(preset) {
  const card = document.createElement("div");
  card.className = "preset-card";
  card.dataset.id = preset.id || newPresetId();

  const nameField = document.createElement("div");
  nameField.className = "field";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = preset.name || "";
  nameInput.className = "preset-name";
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const envField = document.createElement("div");
  envField.className = "field";
  const envLabel = document.createElement("label");
  envLabel.textContent = "Environment";
  const envSelect = document.createElement("select");
  envSelect.className = "preset-env";
  const envs = collectEnvConfigs(); // Global only for now
  for (const env of envs) {
    const opt = document.createElement("option");
    opt.value = env.id;
    opt.textContent = env.name;
    envSelect.appendChild(opt);
  }
  envSelect.value = preset.envId || (envs[0]?.id || "");
  envField.appendChild(envLabel);
  envField.appendChild(envSelect);

  const profileField = document.createElement("div");
  profileField.className = "field";
  const profileLabel = document.createElement("label");
  profileLabel.textContent = "Profile";
  const profileSelect = document.createElement("select");
  profileSelect.className = "preset-profile";
  const profiles = collectProfiles(); // Global only
  for (const p of profiles) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    profileSelect.appendChild(opt);
  }
  profileSelect.value = preset.profileId || (profiles[0]?.id || "");
  profileField.appendChild(profileLabel);
  profileField.appendChild(profileSelect);

  const taskField = document.createElement("div");
  taskField.className = "field";
  const taskLabel = document.createElement("label");
  taskLabel.textContent = "Task";
  const taskSelect = document.createElement("select");
  taskSelect.className = "preset-task";
  const tasks = collectTasks(); // Global only
  for (const t of tasks) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    taskSelect.appendChild(opt);
  }
  taskSelect.value = preset.taskId || (tasks[0]?.id || "");
  taskField.appendChild(taskLabel);
  taskField.appendChild(taskSelect);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.style.marginTop = "8px";
  deleteBtn.addEventListener("click", () => {
    card.remove();
    scheduleSidebarErrors();
  });

  card.appendChild(nameField);
  card.appendChild(envField);
  card.appendChild(profileField);
  card.appendChild(taskField);
  card.appendChild(deleteBtn);

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
  const cards = [...container.querySelectorAll(".task-card")];
  return cards.map((card) => {
    const nameInput = card.querySelector(".task-name");
    const textArea = card.querySelector(".task-text");
    const envSelect = card.querySelector(".task-env-select");
    const profileSelect = card.querySelector(".task-profile-select");
    return {
      id: card.dataset.id || newTaskId(),
      name: (nameInput?.value || "Untitled Task").trim(),
      text: (textArea?.value || "").trim(),
      defaultEnvId: envSelect?.value || "",
      defaultProfileId: profileSelect?.value || ""
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

  const checkNameInputs = (container, selector, label) => {
    if (!container) return;
    const inputs = [...container.querySelectorAll(selector)];
    if (!inputs.length) return;
    const seen = new Map();
    let hasEmpty = false;
    for (const input of inputs) {
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

  checkNameInputs(tasksContainer, ".task-name", "Task presets");
  checkNameInputs(envConfigsContainer, ".env-config-name", "Environments");
  checkNameInputs(profilesContainer, ".profile-name", "Profiles");
  checkNameInputs(apiConfigsContainer, ".api-config-name", "API configs");
  checkNameInputs(apiKeysContainer, ".api-key-name", "API keys");

  if (!tasks.length) errors.push("No task presets configured.");
  if (!envs.length) errors.push("No environments configured.");
  if (!profiles.length) errors.push("No profiles configured.");
  if (!apiConfigs.length) errors.push("No API configs configured.");
  if (!apiKeys.length) errors.push("No API keys configured.");

  if (tasks.length) {
    const defaultTask = tasks[0];
    if (!defaultTask.text) errors.push("Default task prompt is empty.");

    const defaultEnv =
      envs.find((env) => env.id === defaultTask.defaultEnvId) || envs[0];
    if (!defaultEnv) {
      errors.push("Default task environment is missing.");
    }

    const defaultProfile =
      profiles.find((profile) => profile.id === defaultTask.defaultProfileId) ||
      profiles[0];
    if (!defaultProfile) {
      errors.push("Default task profile is missing.");
    } else if (!defaultProfile.text) {
      errors.push("Default profile text is empty.");
    }

    const defaultApiConfig = defaultEnv
      ? apiConfigs.find((config) => config.id === defaultEnv.apiConfigId)
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
      const key = apiKeys.find((entry) => entry.id === defaultApiConfig?.apiKeyId);
      if (!key || !key.key) {
        errors.push("Default API config is missing an API key.");
      }
    }
  }

  if (!errors.length) {
    sidebarErrorsEl.classList.add("hidden");
    sidebarErrorsEl.textContent = "";
    return;
  }

  sidebarErrorsEl.textContent = errors.map((error) => `- ${error}`).join("\n");
  sidebarErrorsEl.classList.remove("hidden");
}

async function loadSettings() {
  const {
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
    presets = [],
    theme = "system",
    workspaces = [],
    sites = [],
    toolbarPosition = "bottom-right"
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
    "presets",
    "theme",
    "workspaces",
    "sites",
    "toolbarPosition"
  ]);

  themeSelect.value = theme;
  applyTheme(theme);
  
  if (toolbarPositionSelect) {
    toolbarPositionSelect.value = toolbarPosition;
  }

  // Load basic resources first so they are available for presets/workspaces
  envConfigsContainer.innerHTML = "";
  // ... (existing logic handles this later)

  // Wait, I need to make sure collectEnvConfigs etc work. 
  // loadSettings currently renders cards later in the function.
  // I need to ensure render order.
  
  // Actually, loadSettings renders cards in order. I should just add presets rendering at the end.
  
  workspacesContainer.innerHTML = "";
  for (const ws of workspaces) {
    workspacesContainer.appendChild(buildWorkspaceCard(ws));
  }

  sitesContainer.innerHTML = "";
  for (const site of sites) {
    sitesContainer.appendChild(buildSiteCard(site));
  }
  
  // I'll render presets after tasks are rendered.
  
  let resolvedKeys = Array.isArray(apiKeys) ? apiKeys : [];
  let resolvedActiveId = activeApiKeyId;

  if (!resolvedKeys.length && apiKey) {
    const migrated = { id: newApiKeyId(), name: "Default", key: apiKey };
    resolvedKeys = [migrated];
    resolvedActiveId = migrated.id;
    await chrome.storage.local.set({
      apiKeys: resolvedKeys,
      activeApiKeyId: resolvedActiveId
    });
  } else if (resolvedKeys.length) {
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
      advanced: false
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
      advanced: Boolean(config.advanced)
    }));
    if (withKeys.some((config, index) => config.apiKeyId !== resolvedConfigs[index].apiKeyId)) {
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
      systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT
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
      systemPrompt: config.systemPrompt ?? ""
    }));
    const needsUpdate = withDefaults.some((config, index) => {
      const original = resolvedEnvConfigs[index];
      return (
        config.apiConfigId !== original.apiConfigId ||
        (config.systemPrompt || "") !== (original.systemPrompt || "")
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
      type: "Resume"
    };
    resolvedProfiles = [migrated];
    await chrome.storage.local.set({ profiles: resolvedProfiles });
  } else {
    const normalized = resolvedProfiles.map((profile) => ({
      ...profile,
      text: profile.text ?? "",
      type: profile.type === "Profile" ? "Profile" : "Resume"
    }));
    const needsUpdate = normalized.some(
      (profile, index) =>
        (profile.text || "") !== (resolvedProfiles[index]?.text || "") ||
        (profile.type || "Resume") !== (resolvedProfiles[index]?.type || "Resume")
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
        defaultProfileId: task.defaultProfileId || defaultProfileId
      }))
    : [];
  if (
    normalizedTasks.length &&
    normalizedTasks.some(
      (task, index) =>
        task.defaultEnvId !== tasks[index]?.defaultEnvId ||
        task.defaultProfileId !== tasks[index]?.defaultProfileId
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

  presetsContainer.innerHTML = "";
  for (const preset of presets) {
    presetsContainer.appendChild(buildPresetCard(preset));
  }

  updateSidebarErrors();
  updateToc(workspaces, sites);
}

async function saveSettings() {
  const tasks = collectTasks();
  const presets = collectPresets();
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
  const activeConfig = apiConfigs.find((entry) => entry.id === activeApiConfigId);
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
    presets,
    theme: themeSelect.value,
    toolbarPosition: toolbarPositionSelect ? toolbarPositionSelect.value : "bottom-right",
    workspaces,
    sites
  });
  setStatus("Saved.");
}

saveBtn.addEventListener("click", () => void saveSettings());
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
  const fallbackApiConfigId = collectApiConfigs()[0]?.id || "";
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
    theme: "inherit"
  });
  workspacesContainer.appendChild(newCard);
  scheduleSidebarErrors();
  updateToc(collectWorkspaces(), collectSites());
});

addSiteBtn.addEventListener("click", () => {
  const newCard = buildSiteCard({
    id: newSiteId(),
    urlPattern: "",
    workspaceId: "global"
  });
  sitesContainer.appendChild(newCard);
  scheduleSidebarErrors();
  updateToc(collectWorkspaces(), collectSites());
});

addPresetBtn.addEventListener("click", () => {
  const newCard = buildPresetCard({
    id: newPresetId(),
    name: "New Preset",
    envId: "",
    profileId: "",
    taskId: ""
  });
  presetsContainer.appendChild(newCard);
  scheduleSidebarErrors();
});

themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

loadSettings();

function updateToc(workspaces, sites) {
  const wsList = document.getElementById("toc-workspaces-list");
  if (!wsList) return;
  
  wsList.innerHTML = "";
  for (const ws of workspaces) {
    const li = document.createElement("li");
    
    const itemDiv = document.createElement("div");
    itemDiv.className = "toc-item";
    
    const caret = document.createElement("span");
    caret.className = "toc-caret";
    caret.textContent = "▸";
    
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = ws.name || "Untitled";
    
    itemDiv.appendChild(caret);
    itemDiv.appendChild(a);
    
    const subUl = document.createElement("ul");
    subUl.className = "toc-sub hidden";
    
    const sections = ["Environments", "Profiles", "Tasks", "Presets"];
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
                    details.open = true;
                    details.scrollIntoView({ behavior: "smooth", block: "start" });
                    document.getElementById("workspaces-panel").open = true;
                } else {
                    card.scrollIntoView({ behavior: "smooth", block: "start" });
                    document.getElementById("workspaces-panel").open = true;
                }
            }
        });
        subLi.appendChild(subA);
        subUl.appendChild(subLi);
    }
    
    itemDiv.addEventListener("click", (e) => {
        // Toggle if not clicking the link directly
        if (!e.target.closest("a")) {
             e.preventDefault();
             e.stopPropagation();
             subUl.classList.toggle("expanded");
             itemDiv.classList.toggle("expanded");
        }
    });
    
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = document.querySelector(`.workspace-card[data-id="${ws.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("workspaces-panel").open = true;
        
        // Also expand sub-list
        subUl.classList.add("expanded");
        itemDiv.classList.add("expanded");
      }
    });

    li.appendChild(itemDiv);
    li.appendChild(subUl);
    wsList.appendChild(li);
  }
  
  const sitesList = document.getElementById("toc-sites-list");
  if (sitesList) {
    sitesList.innerHTML = "";
    for (const site of sites) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.textContent = site.urlPattern || "Untitled Site";
        a.href = "#";
        a.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const card = document.querySelector(`.site-card[data-id="${site.id}"]`);
            if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                document.getElementById("sites-panel").open = true;
            }
        });
        li.appendChild(a);
        sitesList.appendChild(li);
    }
  }
}

function initToc() {
    const items = document.querySelectorAll(".toc-item");
    items.forEach(item => {
        item.addEventListener("click", (e) => {
            const sub = item.nextElementSibling;
            
            // Handle link click
            if (e.target.closest("a")) {
                const link = e.target.closest("a");
                const href = link.getAttribute("href");
                if (href && href.startsWith("#")) {
                    // Let default behavior happen? No, prevent default if we want smooth scroll/open
                    // But here we rely on anchor.
                    // Just expand TOC.
                    if (sub && sub.classList.contains("toc-sub")) {
                        sub.classList.add("expanded");
                        item.classList.add("expanded");
                    }
                    // Open details
                    const target = document.querySelector(href);
                    if (target && target.tagName === "DETAILS") {
                        target.open = true;
                    }
                }
                return;
            }

            // Toggle sub-list on row click (excluding link)
            if (sub && sub.classList.contains("toc-sub")) {
                e.preventDefault();
                e.stopPropagation();
                sub.classList.toggle("expanded");
                item.classList.toggle("expanded");
            }
        });
    });
}

document.addEventListener("DOMContentLoaded", initToc);

document.addEventListener("input", scheduleSidebarErrors);
document.addEventListener("change", scheduleSidebarErrors);
