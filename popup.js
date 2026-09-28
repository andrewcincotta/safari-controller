const extensionApi = globalThis.browser ?? globalThis.chrome;
const WINDOW_NAMES_KEY = "windowNames";

const elements = {
  windowNameList: document.getElementById("windowNameList"),
  tabSelect: document.getElementById("tabSelect"),
  destinationWindowSelect: document.getElementById("destinationWindowSelect"),
  moveTabButton: document.getElementById("moveTabButton"),
  status: document.getElementById("status")
};

async function getWindowNames() {
  const storage = await extensionApi.storage.local.get(WINDOW_NAMES_KEY);
  return storage[WINDOW_NAMES_KEY] ?? {};
}

async function saveWindowNames(windowNames) {
  await extensionApi.storage.local.set({ [WINDOW_NAMES_KEY]: windowNames });
}

function defaultWindowLabel(windowInfo) {
  const activeTab = windowInfo.tabs?.find((tab) => tab.active);
  const fallbackTitle = activeTab?.title || "Untitled";
  return `Window ${windowInfo.id} (${fallbackTitle})`;
}

function getWindowLabel(windowInfo, windowNames) {
  return windowNames[String(windowInfo.id)] || defaultWindowLabel(windowInfo);
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "crimson" : "";
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

async function renameWindow(windowId, name) {
  const windowNames = await getWindowNames();
  const key = String(windowId);

  if (name.trim()) {
    windowNames[key] = name.trim();
  } else {
    delete windowNames[key];
  }

  await saveWindowNames(windowNames);
}

function renderWindowRenameList(windows, windowNames) {
  clearChildren(elements.windowNameList);

  windows.forEach((windowInfo) => {
    const row = document.createElement("div");
    row.className = "window-row";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = defaultWindowLabel(windowInfo);
    input.value = windowNames[String(windowInfo.id)] ?? "";
    input.setAttribute("aria-label", `Custom name for window ${windowInfo.id}`);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";

    saveButton.addEventListener("click", async () => {
      try {
        await renameWindow(windowInfo.id, input.value);
        setStatus("Saved window name.");
        await refresh();
      } catch (error) {
        setStatus(`Failed to save window name: ${error.message}`, true);
      }
    });

    row.append(input, saveButton);
    elements.windowNameList.appendChild(row);
  });
}

function renderTabSelect(windows, windowNames) {
  clearChildren(elements.tabSelect);

  const tabs = windows.flatMap((windowInfo) =>
    (windowInfo.tabs ?? []).map((tab) => ({
      tab,
      windowInfo
    }))
  );

  tabs.forEach(({ tab, windowInfo }) => {
    const option = document.createElement("option");
    option.value = String(tab.id);
    option.textContent = `[${getWindowLabel(windowInfo, windowNames)}] ${tab.title || tab.url || "Untitled tab"}`;
    elements.tabSelect.appendChild(option);
  });
}

function renderDestinationWindows(windows, windowNames) {
  clearChildren(elements.destinationWindowSelect);

  windows.forEach((windowInfo) => {
    const option = document.createElement("option");
    option.value = String(windowInfo.id);
    option.textContent = getWindowLabel(windowInfo, windowNames);
    elements.destinationWindowSelect.appendChild(option);
  });
}

async function refresh() {
  const [windows, windowNames] = await Promise.all([
    extensionApi.windows.getAll({ populate: true }),
    getWindowNames()
  ]);

  const activeWindowIds = new Set(windows.map((windowInfo) => String(windowInfo.id)));
  const cleanedNames = Object.fromEntries(
    Object.entries(windowNames).filter(([windowId]) => activeWindowIds.has(windowId))
  );

  if (Object.keys(cleanedNames).length !== Object.keys(windowNames).length) {
    await saveWindowNames(cleanedNames);
  }

  renderWindowRenameList(windows, cleanedNames);
  renderTabSelect(windows, cleanedNames);
  renderDestinationWindows(windows, cleanedNames);
}

async function moveTabToWindow() {
  const tabId = Number(elements.tabSelect.value);
  const destinationWindowId = Number(elements.destinationWindowSelect.value);

  if (!tabId || !destinationWindowId) {
    setStatus("Choose both a tab and destination window.", true);
    return;
  }

  try {
    const tab = await extensionApi.tabs.get(tabId);
    if (tab.windowId === destinationWindowId) {
      setStatus("Tab is already in that window.", true);
      return;
    }

    await extensionApi.tabs.move(tabId, { windowId: destinationWindowId, index: -1 });
    await extensionApi.tabs.update(tabId, { active: true });
    setStatus("Moved tab to selected window.");
    await refresh();
  } catch (error) {
    setStatus(`Failed to move tab: ${error.message}`, true);
  }
}

elements.moveTabButton.addEventListener("click", moveTabToWindow);

refresh().catch((error) => {
  setStatus(`Failed to load popup data: ${error.message}`, true);
});
