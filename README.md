# safari-controller

Safari Controller is a Safari Web Extension that adds:

- **Custom Safari window names** stored per window so you can stop relying on changing tab titles.
- **Move any tab to any Safari window** from a single popup workflow.

## Project layout

- `/manifest.json` – WebExtension manifest.
- `/popup.html` – Popup UI.
- `/popup.css` – Popup styles.
- `/popup.js` – Popup logic for window naming and tab moves.

## Use in Safari

1. Open this directory in Xcode with Safari web extension support (File → New → Project → Safari Extension App), or convert this WebExtension with `xcrun safari-web-extension-converter`.
2. Build and run the app extension target.
3. In Safari, enable the extension in **Settings → Extensions**.
4. Open the extension popup to rename windows and move tabs.

## Notes

- Safari does not expose an API to directly replace the native browser-window title bar text.
- This extension keeps stable custom names in extension state and uses those names throughout the popup UI as the primary identifier.
