const WINDOW_NAMES_KEY = "windowNames";

async function getWindowNames() {
  const result = await browser.storage.local.get(WINDOW_NAMES_KEY);
  return result[WINDOW_NAMES_KEY] || {};
}

async function saveWindowNames(windowNames) {
  await browser.storage.local.set({ [WINDOW_NAMES_KEY]: windowNames });
}

async function applyWindowTitlePreface(windowId, name) {
  try {
    await browser.windows.update(windowId, {
      titlePreface: name ? `${name} — ` : ""
    });
  } catch (_error) {
  }
}

async function applyAllSavedWindowNames() {
  const [windowNames, windows] = await Promise.all([
    getWindowNames(),
    browser.windows.getAll({ windowTypes: ["normal"] })
  ]);

  const existingWindowIds = new Set(windows.map((windowInfo) => String(windowInfo.id)));
  let hasUpdates = false;

  for (const [windowId, name] of Object.entries(windowNames)) {
    if (!existingWindowIds.has(windowId)) {
      delete windowNames[windowId];
      hasUpdates = true;
      continue;
    }

    await applyWindowTitlePreface(Number(windowId), name);
  }

  if (hasUpdates) {
    await saveWindowNames(windowNames);
  }
}

async function getState() {
  const [windowNames, windows] = await Promise.all([
    getWindowNames(),
    browser.windows.getAll({ populate: true, windowTypes: ["normal"] })
  ]);

  return { windowNames, windows };
}

async function renameWindow(windowId, name) {
  const normalizedName = (name || "").trim();
  const windowNames = await getWindowNames();

  if (normalizedName) {
    windowNames[String(windowId)] = normalizedName;
  } else {
    delete windowNames[String(windowId)];
  }

  await saveWindowNames(windowNames);
  await applyWindowTitlePreface(windowId, normalizedName);
}

async function moveTabToWindow(tabId, targetWindowId) {
  const movedTab = await browser.tabs.move(tabId, {
    windowId: targetWindowId,
    index: -1
  });

  await browser.windows.update(targetWindowId, { focused: true });
  await browser.tabs.update(movedTab.id, { active: true });
  return movedTab;
}

browser.runtime.onInstalled.addListener(() => {
  void applyAllSavedWindowNames();
});

browser.runtime.onStartup.addListener(() => {
  void applyAllSavedWindowNames();
});

browser.windows.onCreated.addListener(() => {
  void applyAllSavedWindowNames();
});

browser.runtime.onMessage.addListener((message) => {
  if (!message || !message.type) {
    return undefined;
  }

  if (message.type === "getState") {
    return getState();
  }

  if (message.type === "setWindowName") {
    return renameWindow(message.windowId, message.name);
  }

  if (message.type === "moveTab") {
    return moveTabToWindow(message.tabId, message.targetWindowId);
  }

  return undefined;
});
