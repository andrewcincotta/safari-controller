"use strict";

// Loaded ahead of background.js, content.js and popup.js.

const MSG = Object.freeze({
  // content -> background: "what should my title be?"
  GET_PINNED_TITLE: "getPinnedTitle",
  // background -> content: pin the title to a string, or null to release it
  SET_PINNED_TITLE: "setPinnedTitle",
  // background -> content: the page's own title, even while pinned
  GET_PAGE_TITLE: "getPageTitle",
  // popup -> background
  GET_STATE: "getState",
  RENAME_WINDOW: "renameWindow",
  MOVE_TAB: "moveTab",
});

// Move target meaning "open a new window for this tab".
const NEW_WINDOW = "new";

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Human-readable label for a window from the GET_STATE payload.
function windowLabel(win) {
  if (win.name) return win.name;
  const active = win.tabs.find((tab) => tab.active) ?? win.tabs[0];
  const title = active?.title;
  return title ? `Window ${win.number} — ${truncate(title, 40)}` : `Window ${win.number}`;
}
