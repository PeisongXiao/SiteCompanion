const HEADER_LINES = new Set([
  "OVERVIEW",
  "PRE-SCREENING",
  "WORK TERM RATINGS",
  "JOB POSTING INFORMATION",
  "APPLICATION INFORMATION",
  "COMPANY INFORMATION",
  "SERVICE TEAM"
]);

const ACTION_BAR_SELECTOR = "nav.floating--action-bar";
const INJECTED_ATTR = "data-wwcompanion-default-task";
const DEFAULT_TASK_LABEL = "Default WWCompanion Task";

function isJobPostingOpen() {
  return document.getElementsByClassName("modal__content").length > 0;
}

function sanitizePostingText(text) {
  let cleaned = text.replaceAll("fiber_manual_record", "");
  const lines = cleaned.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !HEADER_LINES.has(trimmed.toUpperCase());
  });

  cleaned = filtered.join("\n");
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function buildDefaultTaskButton(templateButton) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = DEFAULT_TASK_LABEL;
  button.className = templateButton.className;
  button.setAttribute(INJECTED_ATTR, "true");
  button.setAttribute("aria-label", DEFAULT_TASK_LABEL);
  button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("WWCOMPANION_RUN_DEFAULT_TASK"));
    chrome.runtime.sendMessage({ type: "RUN_DEFAULT_TASK" });
  });
  return button;
}

function getActionBars() {
  return [...document.querySelectorAll(ACTION_BAR_SELECTOR)];
}

function getActionBarButtonCount(bar) {
  return bar.querySelectorAll(`button:not([${INJECTED_ATTR}])`).length;
}

function selectTargetActionBar(bars) {
  if (!bars.length) return null;
  let best = bars[0];
  let bestCount = getActionBarButtonCount(best);
  for (const bar of bars.slice(1)) {
    const count = getActionBarButtonCount(bar);
    if (count > bestCount) {
      best = bar;
      bestCount = count;
    }
  }
  return best;
}

function ensureDefaultTaskButton() {
  const bars = getActionBars();
  if (!bars.length) return;

  if (!isJobPostingOpen()) {
    for (const bar of bars) {
      const injected = bar.querySelector(`[${INJECTED_ATTR}]`);
      if (injected) injected.remove();
    }
    return;
  }

  const toolbar = selectTargetActionBar(bars);
  if (!toolbar) return;

  for (const bar of bars) {
    if (bar === toolbar) continue;
    const injected = bar.querySelector(`[${INJECTED_ATTR}]`);
    if (injected) injected.remove();
  }

  const existing = toolbar.querySelector(`[${INJECTED_ATTR}]`);
  if (existing) return;

  const templateButton = toolbar.querySelector("button");
  if (!templateButton) return;

  const button = buildDefaultTaskButton(templateButton);
  const firstChild = toolbar.firstElementChild;
  if (firstChild) {
    toolbar.insertBefore(button, firstChild);
  } else {
    toolbar.appendChild(button);
  }
}

function extractPostingText() {
  const contents = [...document.getElementsByClassName("modal__content")];
  if (!contents.length) {
    return { ok: false, error: "No modal content found on this page." };
  }

  // WaterlooWorks renders multiple modal containers; choose the longest visible text block.
  const el = contents.reduce((best, cur) =>
    cur.innerText.length > best.innerText.length ? cur : best
  );

  const rawText = el.innerText;
  const sanitized = sanitizePostingText(rawText);

  return { ok: true, rawText, sanitized };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXTRACT_POSTING") return;

  const result = extractPostingText();
  sendResponse(result);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "wwcompanion-keepalive") return;
  port.onDisconnect.addListener(() => {});
});

const observer = new MutationObserver(() => {
  ensureDefaultTaskButton();
});

observer.observe(document.documentElement, { childList: true, subtree: true });
ensureDefaultTaskButton();
