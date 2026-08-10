# Popup inline file connect — design

Date: 2026-08-10

## Problem

First-time users open the popup, see "Save All Tabs" / "Save Current Tab"
disabled (greyed out), with a small status line reading "No file connected.
Open 'View saved links' to connect one." To actually save anything, they
must:

1. Click "View saved links" → opens `manager.html` in a new tab.
2. Click "Connect a file" there → pick/create a JSON file via
   `showSaveFilePicker`.
3. Go back to the popup and click Save again.

This detour is confusing — users expect the Save button to just work, or at
least to explain itself without leaving the popup. The File System Access
picker requires a real user gesture, but a button click inside the popup
*is* a valid gesture, so there's no technical reason to force the
manager-page round trip.

## Goal

Clicking "Save All Tabs" / "Save Current Tab" in the popup should work
end-to-end on the first try: if no file is connected yet, the same click
triggers the file picker inline, and on success proceeds to save
immediately. No trip to the manager page required (though it remains
available as an alternate entry point).

## Approach

Modify `popup.js` only. No changes to `storage.js` (`connectFile()` is
reused as-is) or `manager.html`/`manager.js`.

### `init()`

- Stop disabling `saveAllBtn` / `saveCurrentBtn` when
  `getConnectedFileForAction()` resolves to `null` (no file ever connected).
  Buttons stay enabled in this case.
- Status text for the "no file yet" case changes from `NO_FILE_MESSAGE`
  ("No file connected. Open 'View saved links' to connect one.") to a new
  message reflecting the inline flow, e.g. `"Click Save to connect a file."`
- Unexpected errors (not `PERMISSION_DENIED`, not "no handle") still disable
  the buttons and show an error message — this path is unchanged.
- `PERMISSION_DENIED` at load (stored handle exists but permission lapsed)
  is unchanged: buttons stay enabled, relying on `saveTabs()`'s retry.

### `saveTabs(tabs)`

- Import `connectFile` from `./src/storage.js`.
- When `getConnectedFileForAction()` returns `null` (no handle stored yet),
  instead of setting `NO_FILE_MESSAGE` and returning, call `connectFile()`
  inline:
  - On success, use the returned handle and fall through to the existing
    save logic (read → merge → write → maybe close tabs).
  - `connectFile()`'s existing backup-file picker (second
    `showSaveFilePicker` call) is kept as-is — same two-step prompt users
    already see from the manager page, so behavior is consistent between
    entry points.
  - If the user cancels the main file picker, `showSaveFilePicker` rejects
    with `DOMException` `name === 'AbortError'`. Catch this specifically,
    set status to `"Save canceled — no file selected."`, and return without
    writing anything or disabling the buttons (so the user can just click
    Save again to retry).
  - Any other error from `connectFile()` falls through to the existing
    unexpected-error handling (`logUnexpected`, generic failure message).

### Manager page

No changes. `manager.js` keeps its own "Connect a file" / "Connect a
different file" buttons calling `connectFile()` directly, for users who
open the manager page first or want to switch files.

## Data flow (new)

```
click "Save All Tabs" (file connected or not)
  → chrome.tabs.query() reads tabs
  → getConnectedFileForAction()
      has handle → use it
      no handle  → connectFile() shows file picker(s) inline
                     user picks file(s) → proceed with new handle
                     user cancels       → "Save canceled", nothing written
  → read/merge/write links file, optionally close saved tabs
```

## Error handling summary

| Case | Behavior |
|---|---|
| No file ever connected, user completes picker | Save proceeds normally with new handle |
| No file ever connected, user cancels picker | Status: "Save canceled — no file selected." Buttons stay enabled. |
| Stored handle, permission lapsed (Chrome reset it) | Unchanged: `getConnectedFileForAction` re-prompts for permission (not the file picker) |
| Stored handle, permission denied by user | Unchanged: `PERMISSION_DENIED_MESSAGE` |
| Unexpected error during connect or save | Unchanged: buttons disabled (init-time) or generic failure message (click-time), logged via `logUnexpected` |

## Documentation updates required

Per project convention, doc updates ship in the same change:

- `README.md` / `docs/zh/README.md`: update the "first use" bullet
  (currently: "Click 'View saved links' to open the manager page, then
  'Connect a file'...") to describe connecting inline from the popup as the
  primary path, keeping the manager-page route as an alternative.
- `docs/user-guide.md` / `docs/zh/user-guide.md`: update the "First use:
  connect a save file" section (~line 95) to show the popup-first flow;
  keep the manager-page flow documented as the alternate path (still valid,
  still used by "Connect a different file").
- Mockups: check `docs/images/en/popup.svg` /
  `docs/images/zh/popup.svg` — if either depicts the greyed-out
  "No file connected" button state, update to show buttons enabled with the
  new status text. `manager-connect.svg` is unaffected (manager flow
  unchanged).

## Out of scope

- No changes to `connectFile()`, the backup-file flow, or manager.html.
- No changes to permission-lapsed / reconnect flows.
- No new settings or toggles.
