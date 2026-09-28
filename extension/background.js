"use strict";

// Window names are keyed by windowId, which is only meaningful for one Safari
// session. Each entry keeps a snapshot of the window's URLs so its name can be
// re-attached to the matching restored window after Safari relaunches.
//
// storage.local:
//   named:  { [windowId]: { name, urls } }    windows that are open now
//   closed: [{ name, urls, closedAt }]        newest first, capped at MAX_CLOSED

const MAX_CLOSED = 20;
const MATCH_THRESHOLD = 0.5; // Jaccard similarity of URL sets
const ADOPT_WINDOW_MS = 60_000; // how long after launch restored windows may reclaim names

const MENU_ROOT = "move-tab";
const MENU_MOVE_PREFIX = "move-tab:";

let launchedAt = 0;

// ---------------------------------------------------------------------------
// Storage

async function readStore() {
  const { named = {}, closed = [] } = await browser.storage.local.get(["named", "closed"]);
  return { named, closed };
}

let storeQueue = Promise.resolve();

// Serializes read-modify-write cycles so overlapping events can't clobber each other.
function updateStore(mutate) {
  const run = storeQueue.then(async () => {
    const store = await readStore();
    const result = mutate(store);
    await browser.storage.local.set(store);
    return result;
  });
  storeQueue = run.catch(() => {});
  return run;
}

async function getWindowName(windowId) {
  const { named } = await readStore();
  return named[windowId]?.name ?? null;
}

function comparableUrls(tabs) {
  return [...new Set(tabs.map((tab) => tab.url).filter((url) => /^https?:/.test(url ?? "")))];
}

function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const shared = a.filter((url) => setB.has(url)).length;
  return shared / (a.length + b.length - shared);
}

function retire(store, entry) {
  store.closed = [{ name: entry.name, urls: entry.urls, closedAt: Date.now() }, ...store.closed].slice(
    0,
    MAX_CLOSED,
  );
}

// ---------------------------------------------------------------------------
// Keeping names attached to the right windows

const snapshotTimers = new Map();

function scheduleSnapshot(windowId) {
  clearTimeout(snapshotTimers.get(windowId));
  snapshotTimers.set(
    windowId,
    setTimeout(() => {
      snapshotTimers.delete(windowId);
      snapshotUrls(windowId).catch(console.error);
    }, 1000),
  );
}

async function snapshotUrls(windowId) {
  if (!(await getWindowName(windowId))) return;
  const tabs = await browser.tabs.query({ windowId });
  if (!tabs.length) return; // window is closing
  await updateStore((store) => {
    if (store.named[windowId]) store.named[windowId].urls = comparableUrls(tabs);
  });
}

// Window ids from the previous session are meaningless now (and may be reused),
// so every saved name goes back into the pool for restored windows to claim.
async function onBrowserLaunch() {
  launchedAt = Date.now();
  await updateStore((store) => {
    for (const entry of Object.values(store.named)) retire(store, entry);
    store.named = {};
  });
  await adoptRestoredWindows();
  // Tabs that loaded before the reset may have pinned a stale name via a reused id.
  const windows = await browser.windows.getAll();
  await Promise.all(windows.map((win) => syncWindow(win.id)));
}

// Gives unnamed windows back the name of the closed window they best match.
async function adoptRestoredWindows() {
  const windows = await getNormalWindows();
  const adopted = await updateStore((store) => {
    const pairs = [];
    for (const win of windows) {
      if (store.named[win.id]) continue;
      const urls = comparableUrls(win.tabs);
      store.closed.forEach((entry, index) => {
        const score = similarity(urls, entry.urls);
        if (score >= MATCH_THRESHOLD) pairs.push({ windowId: win.id, urls, index, score });
      });
    }
    pairs.sort((a, b) => b.score - a.score);

    const claimed = new Set();
    for (const { windowId, urls, index } of pairs) {
      if (store.named[windowId] || claimed.has(index)) continue;
      store.named[windowId] = { name: store.closed[index].name, urls };
      claimed.add(index);
    }
    store.closed = store.closed.filter((_, index) => !claimed.has(index));
    return pairs.filter(({ index }) => claimed.has(index)).map(({ windowId }) => windowId);
  });

  if (adopted.length) {
    await Promise.all(adopted.map(syncWindow));
    scheduleMenuRebuild();
  }
}

// Catches names orphaned while the extension wasn't running (e.g. it was reloaded).
async function retireMissingWindows() {
  const live = new Set((await browser.windows.getAll()).map((win) => String(win.id)));
  await updateStore((store) => {
    for (const [id, entry] of Object.entries(store.named)) {
      if (live.has(id)) continue;
      delete store.named[id];
      retire(store, entry);
    }
  });
}

// ---------------------------------------------------------------------------
// Pinning window titles (see content.js)

function pushPinnedTitle(tabId, title) {
  // Fails when the tab has no content script: Safari-internal pages, or sites
  // the user hasn't granted access to. Those tabs just keep their own titles.
  return browser.tabs.sendMessage(tabId, { type: MSG.SET_PINNED_TITLE, title }).catch(() => {});
}

async function syncWindow(windowId) {
  const [name, tabs] = await Promise.all([getWindowName(windowId), browser.tabs.query({ windowId })]);
  await Promise.all(tabs.map((tab) => pushPinnedTitle(tab.id, tab.active ? name : null)));
}

async function pinnedTitleFor(tab) {
  if (!tab?.active) return null;
  return getWindowName(tab.windowId);
}

async function pageTitle(tab) {
  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: MSG.GET_PAGE_TITLE });
    return response?.title || tab.title;
  } catch {
    return tab.title;
  }
}

// ---------------------------------------------------------------------------
// Actions

async function getNormalWindows() {
  const windows = await browser.windows.getAll({ populate: true });
  return windows.filter((win) => !win.type || win.type === "normal");
}

async function describeWindows() {
  const [windows, { named }] = await Promise.all([getNormalWindows(), readStore()]);
  return Promise.all(
    windows.map(async (win, index) => {
      const name = named[win.id]?.name ?? null;
      const tabs = await Promise.all(
        win.tabs.map(async (tab) => ({
          id: tab.id,
          active: tab.active,
          url: tab.url ?? "",
          // A pinned tab's title is the window name; report what the page calls itself.
          title: (name && tab.active ? await pageTitle(tab) : tab.title) || tab.url || "Untitled",
        })),
      );
      return { id: win.id, number: index + 1, name, focused: win.focused, incognito: win.incognito, tabs };
    }),
  );
}

async function renameWindow(windowId, rawName) {
  const name = rawName?.trim() || null;
  const tabs = await browser.tabs.query({ windowId });
  await updateStore((store) => {
    if (name) store.named[windowId] = { name, urls: comparableUrls(tabs) };
    else delete store.named[windowId];
  });
  await syncWindow(windowId);
  scheduleMenuRebuild();
}

async function moveTab(tabId, target) {
  const tab = await browser.tabs.get(tabId);

  if (target === NEW_WINDOW) {
    try {
      await browser.windows.create({ tabId, incognito: tab.incognito });
    } catch {
      await reopenTab(tab, () => browser.windows.create({ url: tab.url, incognito: tab.incognito }));
    }
    return;
  }

  const windowId = Number(target);
  if (windowId === tab.windowId) return;
  const destination = await browser.windows.get(windowId);
  if (destination.incognito !== tab.incognito) {
    throw new Error("Tabs can't be moved between private and regular windows.");
  }
  try {
    await browser.tabs.move(tabId, { windowId, index: -1 });
  } catch {
    await reopenTab(tab, () => browser.tabs.create({ windowId, url: tab.url, active: false }));
  }
}

// Fallback for when Safari refuses a direct move: open the URL at the
// destination, then close the original. Back/forward history and page state are lost.
async function reopenTab(tab, open) {
  if (!tab.url) throw new Error("This tab can't be moved.");
  await open();
  await browser.tabs.remove(tab.id);
}

// ---------------------------------------------------------------------------
// "Move Tab to Window" context menu. Safari has no tab-strip context menu for
// extensions, so this lives on the page's context menu.

let menuTimer;
let menuQueue = Promise.resolve();

function scheduleMenuRebuild() {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(() => {
    menuQueue = menuQueue.then(buildMenus).catch(console.error);
  }, 250);
}

async function buildMenus() {
  const windows = await describeWindows();
  await browser.contextMenus.removeAll();
  const contexts = ["page"];
  browser.contextMenus.create({ id: MENU_ROOT, title: "Move Tab to Window", contexts });
  for (const win of windows) {
    browser.contextMenus.create({
      id: `${MENU_MOVE_PREFIX}${win.id}`,
      parentId: MENU_ROOT,
      title: windowLabel(win),
      contexts,
    });
  }
  browser.contextMenus.create({ id: `${MENU_ROOT}-separator`, parentId: MENU_ROOT, type: "separator", contexts });
  browser.contextMenus.create({
    id: `${MENU_MOVE_PREFIX}${NEW_WINDOW}`,
    parentId: MENU_ROOT,
    title: "New Window",
    contexts,
  });
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId);
  if (!tab || !id.startsWith(MENU_MOVE_PREFIX)) return;
  moveTab(tab.id, id.slice(MENU_MOVE_PREFIX.length)).catch(console.error);
});

// ---------------------------------------------------------------------------
// Event wiring

browser.runtime.onMessage.addListener((message, sender) => {
  switch (message?.type) {
    case MSG.GET_PINNED_TITLE:
      return pinnedTitleFor(sender.tab).then((title) => ({ title }));
    case MSG.GET_STATE:
      return describeWindows();
    case MSG.RENAME_WINDOW:
      return renameWindow(message.windowId, message.name);
    case MSG.MOVE_TAB:
      return moveTab(message.tabId, message.target);
  }
});

browser.runtime.onStartup.addListener(() => {
  onBrowserLaunch().catch(console.error);
});

browser.runtime.onInstalled.addListener(() => {
  retireMissingWindows().catch(console.error);
});

browser.windows.onCreated.addListener(() => {
  // Safari may restore windows a moment after launch; give them time to load their tabs.
  if (launchedAt && Date.now() - launchedAt < ADOPT_WINDOW_MS) {
    setTimeout(() => adoptRestoredWindows().catch(console.error), 2000);
  }
  scheduleMenuRebuild();
});

browser.windows.onRemoved.addListener((windowId) => {
  updateStore((store) => {
    const entry = store.named[windowId];
    if (!entry) return;
    delete store.named[windowId];
    retire(store, entry);
  }).catch(console.error);
  scheduleMenuRebuild();
});

browser.tabs.onActivated.addListener(async ({ windowId }) => {
  if (await getWindowName(windowId)) syncWindow(windowId).catch(console.error);
  scheduleMenuRebuild();
});

browser.tabs.onAttached.addListener(async (tabId, { newWindowId }) => {
  // The tab may have carried a pinned title in from a named window.
  if (await getWindowName(newWindowId)) syncWindow(newWindowId).catch(console.error);
  else pushPinnedTitle(tabId, null);
  scheduleSnapshot(newWindowId);
  scheduleMenuRebuild();
});

browser.tabs.onDetached.addListener((tabId, { oldWindowId }) => {
  scheduleSnapshot(oldWindowId);
});

browser.tabs.onCreated.addListener((tab) => {
  scheduleSnapshot(tab.windowId);
});

browser.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
  if (!isWindowClosing) scheduleSnapshot(windowId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) scheduleSnapshot(tab.windowId);
  // Unnamed windows are labelled by their active tab in the menu.
  if (changeInfo.title && tab.active) scheduleMenuRebuild();
});

// Non-persistent background pages reload on demand; make sure the menu exists.
scheduleMenuRebuild();
