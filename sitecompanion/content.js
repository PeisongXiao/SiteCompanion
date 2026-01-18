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

function createToolbar(presets, position = "bottom-right") {
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

  if (!presets || !presets.length) {
    const label = document.createElement("span");
    label.textContent = "SiteCompanion";
    label.style.fontSize = "12px";
    label.style.color = "#6b5f55";
    toolbar.appendChild(label);
  } else {
    for (const preset of presets) {
      const btn = document.createElement("button");
      btn.textContent = preset.name;
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
        chrome.runtime.sendMessage({ type: "RUN_PRESET", presetId: preset.id });
      });
      toolbar.appendChild(btn);
    }
  }

  document.body.appendChild(toolbar);
}



function matchUrl(url, pattern) {

  if (!pattern) return false;

  const regex = new RegExp("^" + pattern.split("*").join(".*") + "$");

  try {

    const urlObj = new URL(url);

    const target = urlObj.hostname + urlObj.pathname;

    return regex.test(target);

  } catch {

    return false;

  }

}



async function refreshToolbar() {
  const { sites = [], presets = [], toolbarPosition = "bottom-right" } = await chrome.storage.local.get(["sites", "presets", "toolbarPosition"]);
  const currentUrl = window.location.href;
  const site = sites.find(s => matchUrl(currentUrl, s.urlPattern));
  
  if (site) {
    createToolbar(presets, toolbarPosition);
  }
}



const observer = new MutationObserver(() => {

  // refreshToolbar(); // Debounce this?

});



// observer.observe(document.documentElement, { childList: true, subtree: true });

refreshToolbar();
