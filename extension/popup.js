const windowList = document.getElementById("window-list");
const tabSelect = document.getElementById("tab-select");
const targetWindowSelect = document.getElementById("target-window-select");
const moveTabButton = document.getElementById("move-tab-button");
const status = document.getElementById("status");

function getWindowDisplayName(windowInfo, customName) {
  if (customName) {
    return customName;
  }

  if (windowInfo.tabs && windowInfo.tabs.length > 0) {
    const activeTab = windowInfo.tabs.find((tab) => tab.active);
    if (activeTab && activeTab.title) {
      return activeTab.title;
    }

    const firstTab = windowInfo.tabs[0];
    if (firstTab && firstTab.title) {
      return firstTab.title;
    }
  }

  return `Window ${windowInfo.id}`;
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#c62828" : "#1a1a1a";
}

async function refresh() {
  const state = await browser.runtime.sendMessage({ type: "getState" });
  const windows = state.windows || [];
  const windowNames = state.windowNames || {};

  windowList.textContent = "";
  tabSelect.textContent = "";
  targetWindowSelect.textContent = "";

  for (const windowInfo of windows) {
    const customName = windowNames[String(windowInfo.id)] || "";
    const windowName = getWindowDisplayName(windowInfo, customName);

    const row = document.createElement("div");
    row.className = "window-row";

    const left = document.createElement("div");
    const label = document.createElement("p");
    label.className = "window-label";
    label.textContent = `Window ${windowInfo.id}: ${windowName}`;

    const input = document.createElement("input");
    input.type = "text";
    input.value = customName;
    input.placeholder = "Custom window name";

    left.appendChild(label);
    left.appendChild(input);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", async () => {
      try {
        await browser.runtime.sendMessage({
          type: "setWindowName",
          windowId: windowInfo.id,
          name: input.value
        });
        setStatus("Window name updated.");
        await refresh();
      } catch (error) {
        setStatus(error.message || "Could not rename window.", true);
      }
    });

    row.appendChild(left);
    row.appendChild(saveButton);
    windowList.appendChild(row);

    const targetOption = document.createElement("option");
    targetOption.value = String(windowInfo.id);
    targetOption.textContent = `${windowName} (Window ${windowInfo.id})`;
    targetWindowSelect.appendChild(targetOption);

    const tabs = windowInfo.tabs || [];
    for (const tab of tabs) {
      const tabOption = document.createElement("option");
      tabOption.value = String(tab.id);
      tabOption.textContent = `${windowName} · ${tab.title || "Untitled tab"}`;
      tabSelect.appendChild(tabOption);
    }
  }

  if (!tabSelect.options.length || !targetWindowSelect.options.length) {
    moveTabButton.disabled = true;
    setStatus("Open at least one Safari window with tabs to use this extension.", true);
  } else {
    moveTabButton.disabled = false;
    setStatus("");
  }
}

moveTabButton.addEventListener("click", async () => {
  const tabId = Number(tabSelect.value);
  const targetWindowId = Number(targetWindowSelect.value);

  if (!tabId || !targetWindowId) {
    setStatus("Select a tab and a destination window.", true);
    return;
  }

  try {
    await browser.runtime.sendMessage({
      type: "moveTab",
      tabId,
      targetWindowId
    });
    setStatus("Tab moved.");
    await refresh();
  } catch (error) {
    setStatus(error.message || "Could not move tab.", true);
  }
});

refresh().catch((error) => {
  setStatus(error.message || "Could not load Safari windows.", true);
});
