# Popup Inline File Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the popup's Save buttons work on the first click even when no file has ever been connected, by triggering the file-picker inline instead of forcing a detour to the manager page.

**Architecture:** Single-file change to `popup.js`: stop disabling the Save buttons when no file is connected, and have `saveTabs()` call `connectFile()` (already exported from `src/storage.js`, unchanged) inline when `getConnectedFileForAction()` reports no stored handle. `storage.js` and `manager.js`/`manager.html` are untouched — the manager page keeps its own independent "Connect a file" entry point using the same `connectFile()`.

**Tech Stack:** Vanilla JS (ES modules), Chrome Extension MV3 APIs (`chrome.tabs`), File System Access API (`showSaveFilePicker`), `node --test` for the project's existing unit tests (none apply directly to `popup.js`, which is DOM/Chrome-API glue with no test harness in this codebase — verification here is manual, via loading the unpacked extension, consistent with how `popup.js` and `manager.js` are handled elsewhere in the project).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-popup-inline-connect-design.md`
- No changes to `src/storage.js`, `manager.js`, or `manager.html` (spec "Out of scope").
- `connectFile()`'s existing two-step picker (main file + optional backup) is reused unmodified — do not add a "skip backup" option.
- Both English and Chinese docs must be updated together in the same change (project `CLAUDE.md` rule): `README.md` + `docs/zh/README.md`, `docs/user-guide.md` + `docs/zh/user-guide.md`. Keep each pair's `**Language:**` cross-link line intact.
- Mockups (`docs/images/en/popup.svg`, `docs/images/zh/popup.svg`) were inspected during planning and do **not** depict the disabled-button/"No file connected" state — no SVG edits are required by the spec's mockup clause.

---

### Task 1: Popup buttons stay enabled and connect inline on first save

**Files:**
- Modify: `popup.js:20` (message constants), `popup.js:43-95` (`saveTabs`), `popup.js:122-162` (`init`)

**Interfaces:**
- Consumes: `connectFile` from `./src/storage.js` (already exported, signature `async function connectFile(): Promise<FileSystemFileHandle>`, throws on picker failure, resolves normally even if the optional backup picker is cancelled — see `src/storage.js:79-102`).
- Produces: no new exports; this task only changes `popup.js` internal behavior.

- [ ] **Step 1: Update the "no file" message constant**

In `popup.js`, replace the existing constant at line 20:

```js
const NO_FILE_MESSAGE = 'No file connected. Open "View saved links" to connect one.';
```

with:

```js
const NO_FILE_MESSAGE = 'Click Save to connect a file.';
const SAVE_CANCELED_MESSAGE = 'Save canceled — no file selected.';
```

(Keep `PERMISSION_DENIED_MESSAGE` and `CORRUPTED_MESSAGE` on the following lines unchanged.)

- [ ] **Step 2: Import `connectFile` and handle the no-handle case inline in `saveTabs()`**

In `popup.js`, update the import block at the top (currently lines 1-7):

```js
import {
  getConnectedFileForAction,
  connectFile,
  readLinksFile,
  writeLinksFile,
  getCloseTabAfterSave,
  setCloseTabAfterSave,
} from './src/storage.js';
```

Then in `saveTabs()`, replace this block (currently lines 47-70):

```js
    let handle;
    try {
      // Runs inside a click handler, so it's allowed to silently re-request
      // permission if it was lost (Chrome resets File System Access grants on
      // every extension reload) — this self-heals without forcing the user
      // to reconnect the file from scratch.
      handle = await getConnectedFileForAction();
    } catch (err) {
      if (err.code === 'PERMISSION_DENIED') {
        // Expected when the user declines (or dismisses) the permission
        // prompt that getConnectedFileForAction() just showed — not a bug.
        logExpected('save: permission not granted', err);
        statusEl.textContent = PERMISSION_DENIED_MESSAGE;
      } else {
        logUnexpected('save: checking connected file', err);
        statusEl.textContent = NO_FILE_MESSAGE;
      }
      return;
    }
    if (!handle) {
      statusEl.textContent = NO_FILE_MESSAGE;
      return;
    }
```

with:

```js
    let handle;
    try {
      // Runs inside a click handler, so it's allowed to silently re-request
      // permission if it was lost (Chrome resets File System Access grants on
      // every extension reload) — this self-heals without forcing the user
      // to reconnect the file from scratch.
      handle = await getConnectedFileForAction();
    } catch (err) {
      if (err.code === 'PERMISSION_DENIED') {
        // Expected when the user declines (or dismisses) the permission
        // prompt that getConnectedFileForAction() just showed — not a bug.
        logExpected('save: permission not granted', err);
        statusEl.textContent = PERMISSION_DENIED_MESSAGE;
      } else {
        logUnexpected('save: checking connected file', err);
        statusEl.textContent = NO_FILE_MESSAGE;
      }
      return;
    }
    if (!handle) {
      // No file has ever been connected. The click that got us here is a
      // real user gesture, so it's safe to show the file picker right now
      // instead of bouncing the user to the manager page first.
      try {
        handle = await connectFile();
      } catch (err) {
        if (err.name === 'AbortError') {
          // Expected: the user closed/canceled the file picker.
          logExpected('save: file picker canceled', err);
          statusEl.textContent = SAVE_CANCELED_MESSAGE;
        } else {
          logUnexpected('save: connecting file', err);
          statusEl.textContent = NO_FILE_MESSAGE;
        }
        return;
      }
    }
```

- [ ] **Step 3: Stop disabling the Save buttons at load when no file is connected**

In `popup.js`, in `init()`, replace this block (currently lines 136-148):

```js
    const handle = await getConnectedFileForAction();
    if (!handle) {
      saveAllBtn.disabled = true;
      saveCurrentBtn.disabled = true;
      statusEl.textContent = NO_FILE_MESSAGE;
    } else {
      try {
        const { links, corrupted } = await readLinksFile(handle);
        setManageLinkCount(corrupted ? 0 : links.length);
      } catch (err) {
        logUnexpected('reading count at load', err);
      }
    }
```

with:

```js
    const handle = await getConnectedFileForAction();
    if (!handle) {
      // No file connected yet — buttons stay enabled; saveTabs() will
      // trigger the file picker inline on click.
      statusEl.textContent = NO_FILE_MESSAGE;
    } else {
      try {
        const { links, corrupted } = await readLinksFile(handle);
        setManageLinkCount(corrupted ? 0 : links.length);
      } catch (err) {
        logUnexpected('reading count at load', err);
      }
    }
```

Leave the `catch` block below (currently lines 149-161) unchanged — unexpected errors still disable the buttons; `PERMISSION_DENIED` at load still leaves them enabled relying on `saveTabs()`'s retry.

- [ ] **Step 4: Manual verification — first-time connect via popup**

There is no automated test harness for `popup.js` in this codebase (it's Chrome-API/DOM glue; the project's `node --test` suite only covers pure logic modules under `src/`). Verify manually:

1. Run `node --test test/` from the project root and confirm the existing suite still passes (this task doesn't touch any tested module, so this is a regression check):
   ```bash
   npm test
   ```
   Expected: all existing tests pass, unchanged from before this task.
2. In Chrome, go to `chrome://extensions`, remove any existing loaded copy of Tab Saver (or note you'll reload it), and use "Load unpacked" on the project folder — a fresh load has no stored file handle, simulating first use.
3. Click the Tab Saver toolbar icon. Confirm:
   - "Save All Tabs" and "Save Current Tab" are **enabled** (not greyed out).
   - Status text reads "Click Save to connect a file."
4. Click "Save Current Tab". Confirm the system file picker opens immediately (no need to visit the manager page first). Create a new file, e.g. `saved-tabs-test.json`.
5. Confirm a second picker appears for the optional backup file; click "Cancel" on it.
6. Confirm the popup then shows a "Saved 1 tab(s)..." status, and clicking "View saved links" shows the tab in the manager page.
7. Reload the popup (close and reopen) and click "Save All Tabs" again — confirm it now saves directly without any picker (handle already connected), same as before this change.
8. Test cancel path: in `chrome://extensions`, remove the extension's site data or use a fresh profile / disconnect via manager page's "Connect a different file" then cancel, OR simplest: use a fresh unpacked load again, click "Save Current Tab", and click "Cancel" on the first (main file) picker. Confirm status reads "Save canceled — no file selected." and the buttons remain enabled (clicking Save again re-opens the picker).

- [ ] **Step 5: Commit**

```bash
git add popup.js && git commit -m "$(cat <<'EOF'
feat: connect file inline from popup on first save

The popup's Save buttons required a detour to the manager page to
connect a file before they'd work at all. Since a Save button click
is itself a valid user gesture, trigger the file picker inline
instead — the same click that discovers no file is connected now
opens the picker and, on success, proceeds straight to saving.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Update English docs (README.md, user-guide.md)

**Files:**
- Modify: `README.md:51-58`, `docs/user-guide.md:95-118`

**Interfaces:**
- Consumes: nothing from Task 1's code (docs describe user-facing behavior only).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update `README.md`'s "First-time setup" section**

Replace (currently lines 51-58):

```markdown
### First-time setup

1. Click the Tab Saver toolbar icon.
2. Click "View saved links" to open the manager page, then "Connect a
   file" to create or choose the JSON file that will store your saved
   links. You'll be prompted a second time to optionally pick a backup
   file — its contents mirror the main file on every save/remove, and you
   can skip it by cancelling that picker.
```

with:

```markdown
### First-time setup

1. Click the Tab Saver toolbar icon.
2. Click "Save All Tabs" or "Save Current Tab" — since no file is
   connected yet, this opens a file picker to create or choose the JSON
   file that will store your saved links, then saves immediately. You'll
   be prompted a second time to optionally pick a backup file — its
   contents mirror the main file on every save/remove, and you can skip
   it by cancelling that picker.
   (Alternatively, you can connect a file ahead of time from the manager
   page: click "View saved links", then "Connect a file".)
```

- [ ] **Step 2: Update `docs/user-guide.md`'s "First use" section**

Replace (currently lines 95-118):

```markdown
## First use: connect a save file

The first time you use it, the extension isn't linked to any file yet — you
need to choose (or create) one yourself as the place your links get saved
to.

1. Click the Tab Saver toolbar icon, then click **"View saved links"** to
   open the manager page.
2. The manager page will say "No file connected yet" — click **"Connect a
   file"**.

   ![Connect a file](images/en/manager-connect.svg)

3. In the system file picker that opens, create or choose a `.json` file
   (e.g. `saved-tabs.json`) to use as the main file.
4. A second file picker will pop up right after, to optionally choose a
   **backup file**. If you'd like an automatically-mirrored backup, pick or
   create one; if not, just click "Cancel" to skip this step — it won't
   affect the main file at all.

Once connected, the manager page automatically reads from this file every
time you open it — **you won't need to connect again**, unless you switch
computers, or Chrome resets the permission after reloading the extension
(see [FAQ](#faq) below).
```

with:

```markdown
## First use: connect a save file

The first time you use it, the extension isn't linked to any file yet — you
need to choose (or create) one yourself as the place your links get saved
to. The easiest way is to just try saving:

1. Click the Tab Saver toolbar icon, then click **"Save All Tabs"** or
   **"Save Current Tab"**.
2. Since no file is connected yet, this immediately opens the system file
   picker — create or choose a `.json` file (e.g. `saved-tabs.json`) to use
   as the main file.
3. A second file picker will pop up right after, to optionally choose a
   **backup file**. If you'd like an automatically-mirrored backup, pick or
   create one; if not, just click "Cancel" to skip this step — it won't
   affect the main file at all.
4. Your tabs are saved right away, using the file you just picked.

Once connected, both the popup and the manager page automatically read from
this file every time you use them — **you won't need to connect again**,
unless you switch computers, or Chrome resets the permission after
reloading the extension (see [FAQ](#faq) below).

Alternatively, you can connect a file ahead of time (without saving
anything yet) from the manager page:

1. Click the Tab Saver toolbar icon, then click **"View saved links"** to
   open the manager page.
2. The manager page will say "No file connected yet" — click **"Connect a
   file"**.

   ![Connect a file](images/en/manager-connect.svg)

3. Follow the same file-picker steps as above.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/user-guide.md && git commit -m "$(cat <<'EOF'
docs: document inline file connect from the popup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update Chinese docs (docs/zh/README.md, docs/zh/user-guide.md)

**Files:**
- Modify: `docs/zh/README.md:50-58`, `docs/zh/user-guide.md:58-70`

**Interfaces:**
- Consumes: nothing from Task 1's code.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update `docs/zh/README.md`'s "首次设置" section**

Replace (currently lines 50-58):

```markdown
### 首次设置

1. 点击 Tab Saver 工具栏图标。
2. 点击"查看已保存的链接"打开管理页面，然后点击"连接一个文件"，创建或选择用于
   保存链接的 JSON 文件。接下来会再提示一次，用于可选地选择一个备份文件——它的
   内容会在每次保存/删除时与主文件保持同步；取消这次弹窗即可跳过备份文件。
```

with:

```markdown
### 首次设置

1. 点击 Tab Saver 工具栏图标。
2. 点击"保存全部标签页"或"保存当前标签页"——由于还没有连接任何文件，这时会
   直接弹出文件选择框，用来创建或选择保存链接的 JSON 文件，选完后立即完成保
   存。接下来会再提示一次，用于可选地选择一个备份文件——它的内容会在每次保存/
   删除时与主文件保持同步；取消这次弹窗即可跳过备份文件。
   （你也可以提前在管理页面连接文件：点击"查看已保存的链接"，再点击"连接一个
   文件"。）
```

- [ ] **Step 2: Update `docs/zh/user-guide.md`'s "首次使用" section**

Replace (currently lines 58-70):

```markdown
## 首次使用：连接一个保存文件

第一次使用时，插件还没有关联任何文件，需要你手动选择（或新建）一个文件作为"保存链接的地方"。

1. 点击工具栏上的 Tab Saver 图标，再点击**"查看已保存的链接"**，打开管理页面。
2. 管理页面会提示"还没有连接任何文件"，点击**"连接一个文件"**。

   ![连接文件](../images/zh/manager-connect.svg)

3. 在弹出的系统文件选择框中，新建或选择一个 `.json` 文件（例如 `saved-tabs.json`）作为主文件。
4. 紧接着会再弹出一次文件选择框，用来选择一个**备份文件**（可选）。如果你希望有一份自动同步的备份，选一个文件或新建一个即可；如果不需要，直接点击"取消"跳过这一步就行，不会影响主文件的使用。

连接完成后，以后每次打开管理页面都会自动读取这个文件，**不需要重复连接**（除非你换了电脑，或者 Chrome 重新加载了插件导致授权失效，见下方[常见问题](#常见问题)）。
```

with:

```markdown
## 首次使用：连接一个保存文件

第一次使用时，插件还没有关联任何文件，需要你手动选择（或新建）一个文件作为"保存链接的地方"。最简单的办法就是直接试着保存一下：

1. 点击工具栏上的 Tab Saver 图标，再点击**"保存全部标签页"**或**"保存当前标签页"**。
2. 由于还没有连接任何文件，这时会立即弹出系统文件选择框——新建或选择一个 `.json` 文件（例如 `saved-tabs.json`）作为主文件。
3. 紧接着会再弹出一次文件选择框，用来选择一个**备份文件**（可选）。如果你希望有一份自动同步的备份，选一个文件或新建一个即可；如果不需要，直接点击"取消"跳过这一步就行，不会影响主文件的使用。
4. 用你刚才选好的文件，标签页会立刻保存进去。

连接完成后，以后每次使用弹出面板或打开管理页面都会自动读取这个文件，**不需要重复连接**（除非你换了电脑，或者 Chrome 重新加载了插件导致授权失效，见下方[常见问题](#常见问题)）。

你也可以提前连接文件（先不保存任何内容），在管理页面操作：

1. 点击工具栏上的 Tab Saver 图标，再点击**"查看已保存的链接"**，打开管理页面。
2. 管理页面会提示"还没有连接任何文件"，点击**"连接一个文件"**。

   ![连接文件](../images/zh/manager-connect.svg)

3. 按上面同样的步骤选择文件即可。
```

- [ ] **Step 3: Commit**

```bash
git add docs/zh/README.md docs/zh/user-guide.md && git commit -m "$(cat <<'EOF'
docs: 同步中文文档，说明弹出面板内可直接连接文件

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
