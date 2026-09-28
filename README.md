# safari-controller

Safari Controller is a Safari Web Extension that adds two productivity features:

- Rename Safari windows with persistent custom names (and attempt to apply a title prefix when supported).
- Move any tab to any open Safari window from one popup UI.

## Extension structure

- `/home/runner/work/safari-controller/safari-controller/extension/manifest.json` – extension manifest.
- `/home/runner/work/safari-controller/safari-controller/extension/background.js` – window name persistence, title prefix application, and tab move logic.
- `/home/runner/work/safari-controller/safari-controller/extension/popup.html` – popup UI.
- `/home/runner/work/safari-controller/safari-controller/extension/popup.js` – popup interactions.
- `/home/runner/work/safari-controller/safari-controller/extension/popup.css` – popup styles.

## Load in Safari

1. Open Xcode and create a new **Safari Extension App** project.
2. Add the files from `/home/runner/work/safari-controller/safari-controller/extension` to the extension target.
3. Build and run the macOS app target once.
4. In Safari, go to **Settings → Extensions** and enable **Safari Controller**.

## Usage

1. Click the Safari Controller toolbar button.
2. In **Rename windows**, enter and save a custom name for any window.
3. In **Move tab**, pick a source tab and destination window, then click **Move tab**.
