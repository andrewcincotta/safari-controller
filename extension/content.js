"use strict";

// Safari titles each window after its active tab, so the way to rename a window
// is to pin the active tab's document.title to the window's name. The background
// script tells this tab when to pin (it became the active tab of a named window)
// and when to let go (it was deactivated, moved, or the name was cleared).
(() => {
  let pinnedTitle = null;
  let pageTitle = document.title; // the page's own title, tracked while pinned
  let watchingHead = false;

  const observer = new MutationObserver(() => {
    if (!watchingHead && document.head) watch();
    enforce();
  });

  // Title changes happen inside <head>. Before it's parsed (we run at
  // document_start), watch the document for it to appear, then narrow down.
  function watch() {
    observer.disconnect();
    watchingHead = Boolean(document.head);
    if (watchingHead) {
      observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    } else {
      observer.observe(document, { subtree: true, childList: true });
    }
  }

  // The page changed its title: remember it, then put the pinned title back.
  function enforce() {
    if (pinnedTitle === null || document.title === pinnedTitle) return;
    pageTitle = document.title;
    document.title = pinnedTitle;
  }

  function pin(title) {
    if (title === pinnedTitle) return;
    if (pinnedTitle === null) {
      pageTitle = document.title;
      watch();
    }
    pinnedTitle = title;
    if (title === null) {
      observer.disconnect();
      document.title = pageTitle;
    } else {
      document.title = title;
    }
  }

  function requestPinnedTitle() {
    browser.runtime
      .sendMessage({ type: MSG.GET_PINNED_TITLE })
      .then((response) => pin(response?.title ?? null))
      .catch(() => {});
  }

  browser.runtime.onMessage.addListener((message) => {
    switch (message?.type) {
      case MSG.SET_PINNED_TITLE:
        pin(message.title ?? null);
        return;
      case MSG.GET_PAGE_TITLE:
        return Promise.resolve({ title: pinnedTitle === null ? document.title : pageTitle });
    }
  });

  // Pages restored from the back/forward cache keep stale state; re-ask.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) requestPinnedTitle();
  });

  requestPinnedTitle();
})();
