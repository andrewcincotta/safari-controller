"use strict";

const checkboxes = document.querySelectorAll("input[type=checkbox]");

async function load() {
  const settings = await getSettings();
  for (const checkbox of checkboxes) checkbox.checked = Boolean(settings[checkbox.name]);
}

async function save() {
  const settings = await getSettings();
  for (const checkbox of checkboxes) settings[checkbox.name] = checkbox.checked;
  await browser.storage.local.set({ settings });
}

for (const checkbox of checkboxes) {
  checkbox.addEventListener("change", () => save().catch(console.error));
}

load().catch(console.error);
