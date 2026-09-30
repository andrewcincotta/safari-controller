"use strict";

const windowList = document.getElementById("windows");
const errorBox = document.getElementById("error");
const windowTemplate = document.getElementById("window-template");
const tabTemplate = document.getElementById("tab-template");

// The tab being dragged, if any: { tabId, windowId, incognito }.
let dragged = null;

async function run(action) {
  errorBox.hidden = true;
  try {
    await action();
  } catch (error) {
    errorBox.textContent = error?.message ?? String(error);
    errorBox.hidden = false;
  }
  await render();
}

async function render() {
  const [current, windows] = await Promise.all([
    browser.windows.getCurrent(),
    browser.runtime.sendMessage({ type: MSG.GET_STATE }),
  ]);
  await addYabaiSpaces(windows);
  // This window first, the rest in Safari's order.
  windows.sort((a, b) => (b.id === current.id) - (a.id === current.id));
  windowList.replaceChildren(...windows.map((win) => renderWindow(win, windows, current.id)));
}

async function addYabaiSpaces(windows) {
  const candidates = windows.map((win) => {
    const active = win.tabs.find((tab) => tab.active) ?? win.tabs[0];
    return { id: win.id, title: win.name || active?.title || "" };
  });

  try {
    const response = await browser.runtime.sendNativeMessage("application.id", {
      type: "getYabaiSpaces",
      windows: candidates,
    });
    for (const win of windows) win.space = response?.spaces?.[win.id] ?? null;
  } catch (error) {
    console.warn("Could not read yabai spaces", error);
  }
}

function renderWindow(win, windows, currentWindowId) {
  const section = windowTemplate.content.firstElementChild.cloneNode(true);
  section.classList.toggle("current", win.id === currentWindowId);

  const nameInput = section.querySelector(".window-name");
  nameInput.value = win.name ?? "";
  nameInput.placeholder = windowLabel({ ...win, name: null });
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") nameInput.blur();
  });
  nameInput.addEventListener("change", () => rename(win.id, nameInput.value));

  const clearButton = section.querySelector(".clear-name");
  clearButton.hidden = !win.name;
  clearButton.addEventListener("click", () => rename(win.id, ""));

  const tabCount = `${win.tabs.length} tab${win.tabs.length === 1 ? "" : "s"}`;
  const tags = [
    win.id === currentWindowId && "This window",
    win.space && (win.space.label || `Space ${win.space.index}`),
    win.incognito && "Private",
  ].filter(Boolean);
  section.querySelector(".window-meta").textContent = [...tags, tabCount].join(" · ");

  const destinations = windows.filter((other) => other.id !== win.id && other.incognito === win.incognito);
  section.querySelector(".tabs").append(...win.tabs.map((tab) => renderTab(tab, win, destinations)));

  section.addEventListener("dragover", (event) => {
    if (!canDropOn(win)) return;
    event.preventDefault();
    section.classList.add("drop-target");
  });
  section.addEventListener("dragleave", (event) => {
    if (!section.contains(event.relatedTarget)) section.classList.remove("drop-target");
  });
  section.addEventListener("drop", (event) => {
    event.preventDefault();
    section.classList.remove("drop-target");
    if (canDropOn(win)) move(dragged.tabId, win.id);
  });

  return section;
}

function renderTab(tab, win, destinations) {
  const item = tabTemplate.content.firstElementChild.cloneNode(true);
  item.classList.toggle("active", tab.active);

  const title = item.querySelector(".tab-title");
  title.textContent = tab.title;
  title.title = tab.url ? `${tab.title}\n${tab.url}` : tab.title;

  const select = item.querySelector(".move-tab");
  for (const destination of destinations) {
    select.add(new Option(windowLabel(destination), destination.id));
  }
  select.add(new Option("New Window", NEW_WINDOW));
  select.addEventListener("change", () => move(tab.id, select.value));

  item.addEventListener("dragstart", (event) => {
    dragged = { tabId: tab.id, windowId: win.id, incognito: win.incognito };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tab.url || tab.title);
    item.classList.add("dragging");
  });
  item.addEventListener("dragend", () => {
    dragged = null;
    item.classList.remove("dragging");
  });

  return item;
}

function canDropOn(win) {
  return dragged !== null && dragged.windowId !== win.id && dragged.incognito === win.incognito;
}

function rename(windowId, name) {
  return run(() => browser.runtime.sendMessage({ type: MSG.RENAME_WINDOW, windowId, name }));
}

function move(tabId, target) {
  return run(() => browser.runtime.sendMessage({ type: MSG.MOVE_TAB, tabId, target }));
}

render().catch((error) => {
  errorBox.textContent = error?.message ?? String(error);
  errorBox.hidden = false;
});
