# A-Z Quick-Jump Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed right-edge A-Z index (plus a "#" for scroll-to-top) on the manager page's List and Card views, so users can jump straight to the first saved link whose title starts with a given letter instead of scrolling manually.

**Architecture:** A static `<nav id="az-index">` container in `manager.html`, populated once at startup with 26 letter buttons + one "#" button by `manager.js` (built once, not rebuilt per render). Every call to `render()` recomputes which letters have a matching title in the current search-filtered set and toggles each button's `disabled` state; clicking an enabled letter switches the page to ungrouped + title-asc mode (reusing the existing group-toggle/sort-select change handlers so persistence still fires), re-renders, then scrolls to the first matching `.link-item`/`.link-card` element (found via a new `data-id` attribute mirroring the existing pattern on `.favorite-card`). Hidden entirely outside List/Card view (Least Viewed, date-filtered, empty state).

**Tech Stack:** Vanilla JS (ES modules), DOM APIs (`scrollIntoView`, `window.scrollTo`), existing `sortLinks`/`filterLinks` from `src/`. `node --test` for the project's unit test suite (does not cover `manager.js`, which is DOM glue with no test harness in this codebase, consistent with `popup.js`) — verification here is manual, via loading the unpacked extension.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-az-quick-jump-design.md`
- Applies to **List** and **Card** views only; hidden in **Least Viewed** view.
- Jump target is the link's **title**, first letter, case-insensitive.
- The index reflects **the current search-filtered set**, not the full saved list.
- "#" always scrolls to page top and never changes group/sort settings.
- Letters with no matching title in the current filtered set are disabled/greyed, with no proximity-jump fallback.
- No changes to `src/storage.js`, `src/sortLinks.js`, `src/groupByDomain.js`, or `src/filterLinks.js` — only consume their existing exports.
- Both English and Chinese docs must be updated together in the same change (project `CLAUDE.md` rule), and matching mockups (`docs/images/en/`, `docs/images/zh/`) updated since this changes what's visually shown on the manager page.

---

### Task 1: Build and wire the A-Z index (manager.html + manager.js + manager.css)

**Files:**
- Modify: `manager.html:70` (add nav container before `</main>` closes, i.e. as a sibling after `<main class="main-content">`)
- Modify: `manager.js` (new functions + wiring; see exact insertion points below)
- Modify: `manager.css` (new styles, appended at end of file)

**Interfaces:**
- Consumes: `sortLinks` from `./src/sortLinks.js` (`sortLinks(links, mode): Link[]`), `filterLinks` from `./src/filterLinks.js` (`filterLinks(links, query): Link[]`), existing module-level state `currentLinks`, `searchQuery`, `groupByDomainEnabled`, `sortMode`, `viewMode`, `selectedDate`, and existing DOM refs (`groupToggle`, `sortSelect`).
- Produces: `renderAzIndex()` (no params — reads module state directly, called from `render()`), `data-id` attribute now present on every `.link-item` and `.link-card` element (later tasks/features can rely on this for DOM lookup by link id).

- [ ] **Step 1: Add the nav container to `manager.html`**

In `manager.html`, the `<main class="main-content">...</main>` block currently ends at line 70 (`</main>`), followed by `</div>` (closing `.page-layout`) at line 71. Add the new nav as a sibling of `.page-layout`'s children, right after the closing `</main>` tag and before the closing `</div>`:

```html
    </main>
    <nav id="az-index" class="az-index" hidden aria-label="Jump to letter"></nav>
  </div>
```

(This replaces the two lines `    </main>` and `  </div>` with the three lines above.)

- [ ] **Step 2: Add `data-id` to rendered link items and cards**

In `manager.js`, `renderLinkItem` (starts at line 118) currently begins:

```js
function renderLinkItem(link) {
  const li = document.createElement('li');
  li.className = 'link-item';
  li.append(renderSelectCheckbox(link));
```

Change to:

```js
function renderLinkItem(link) {
  const li = document.createElement('li');
  li.className = 'link-item';
  li.dataset.id = link.id;
  li.append(renderSelectCheckbox(link));
```

In `manager.js`, `renderLinkCard` (starts at line 243) currently begins:

```js
function renderLinkCard(link) {
  const card = document.createElement('div');
  card.className = 'link-card';
  card.append(renderSelectCheckbox(link));
```

Change to:

```js
function renderLinkCard(link) {
  const card = document.createElement('div');
  card.className = 'link-card';
  card.dataset.id = link.id;
  card.append(renderSelectCheckbox(link));
```

- [ ] **Step 3: Add the DOM ref and module-level helpers in `manager.js`**

Near the top of `manager.js`, after the existing `const bulkClearBtn = document.getElementById('bulk-clear-btn');` (line 49), add:

```js
const azIndexNav = document.getElementById('az-index');
```

After the `PLACEHOLDER_GRADIENTS` / helper functions area, anywhere before `render()` (a good spot is right after `domainToSlug` at line 406-408), add:

```js
const AZ_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)); // A-Z

// Which letters currently have at least one matching title, computed against
// the search-filtered set re-sorted as title-asc — independent of the page's
// actual sort/group settings, since this only answers "does content exist",
// not "in what order is it displayed".
function getFilteredTitleSortedLinks() {
  return sortLinks(filterLinks(currentLinks, searchQuery), 'title-asc');
}

function buildAzIndex() {
  const topBtn = document.createElement('button');
  topBtn.type = 'button';
  topBtn.className = 'az-index-btn az-index-top';
  topBtn.textContent = '#';
  topBtn.setAttribute('aria-label', 'Scroll to top');
  topBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  azIndexNav.append(topBtn);

  for (const letter of AZ_LETTERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'az-index-btn';
    btn.textContent = letter;
    btn.dataset.letter = letter;
    btn.addEventListener('click', () => onAzLetterClick(letter));
    azIndexNav.append(btn);
  }
}

function onAzLetterClick(letter) {
  const needsModeSwitch = groupByDomainEnabled || sortMode !== 'title-asc';
  if (needsModeSwitch) {
    groupByDomainEnabled = false;
    groupToggle.checked = false;
    setGroupByDomain(false).catch((err) => logUnexpected('saving group-by-domain', err));
    sortMode = 'title-asc';
    sortSelect.value = 'title-asc';
    setSortMode('title-asc').catch((err) => logUnexpected('saving sort mode', err));
    render();
  }

  const match = getFilteredTitleSortedLinks().find((link) => link.title.charAt(0).toUpperCase() === letter);
  if (!match) return;
  const target = document.querySelector(`[data-id="${CSS.escape(match.id)}"]`);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Recomputes which letters have matching content in the current
// search-filtered set and shows/hides the whole index for the active view.
// Called from render() — never rebuilds the 27 buttons, only toggles state.
// Note: the nav stays visible even with zero saved links (all 26 letters
// simply end up disabled) — "#" must keep working per the spec's error
// table ("No saved links at all" → letters disabled, "#" still works).
function renderAzIndex() {
  const showIndex = !selectedDate && viewMode !== 'least-viewed';
  azIndexNav.hidden = !showIndex;
  if (!showIndex) return;

  const availableLetters = new Set(
    getFilteredTitleSortedLinks().map((link) => link.title.charAt(0).toUpperCase())
  );
  for (const btn of azIndexNav.querySelectorAll('.az-index-btn[data-letter]')) {
    btn.disabled = !availableLetters.has(btn.dataset.letter);
  }
}
```

- [ ] **Step 4: Call `renderAzIndex()` from `render()` and initialize the index once at startup**

In `manager.js`, `render()` (starts at line 669) has several early-return branches. Add a call to `renderAzIndex()` as the **first line of the function body**, so it runs on every render call regardless of which branch is taken:

Current start of `render()`:

```js
function render() {
  linkList.innerHTML = '';
  renderSites();
  renderFavorites();
```

Change to:

```js
function render() {
  renderAzIndex();
  linkList.innerHTML = '';
  renderSites();
  renderFavorites();
```

At the bottom of `manager.js`, find the `init()` function (starts at line 862). As the very first statement inside `init()`, before the existing `try { applyViewMode(...) }` block, add the one-time button construction:

```js
async function init() {
  buildAzIndex();

  try {
    applyViewMode(await getViewMode());
```

- [ ] **Step 5: Add CSS for the index**

Append to the end of `manager.css`:

```css
.az-index {
  position: fixed;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  z-index: 10;
}

.az-index[hidden] {
  display: none;
}

.az-index-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 11px;
  line-height: 1.4;
  font-weight: 600;
  padding: 0 4px;
  cursor: pointer;
  border-radius: 3px;
}

.az-index-btn:hover:not(:disabled) {
  background: var(--surface);
}

.az-index-btn:disabled {
  color: var(--border);
  cursor: default;
}

.az-index-top {
  font-size: 13px;
  margin-bottom: 4px;
}
```

- [ ] **Step 6: Manual verification**

There is no automated test harness for `manager.js` in this codebase (DOM/Chrome-API glue, same as `popup.js`). Verify manually:

1. Run the existing test suite to confirm no regression in the pure logic modules this task touches only as consumers:
   ```bash
   npm test
   ```
   Expected: all existing tests pass, unchanged from before this task (this task adds no new test files since `sortLinks`/`filterLinks` themselves are untouched).
2. Load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked), connect a file with several saved links whose titles span different starting letters (save a handful of tabs with varied titles, or hand-edit the connected JSON file to have titles like "Apple", "Banana", "Zebra", "apple lowercase test").
3. Open the manager page. Confirm the A-Z strip appears on the right edge in **List** view, with letters that have no matching title greyed out and unclickable, and letters with matches clickable.
4. With **Group by site** checked (default) and sort mode not `title-asc`, click a letter that has a match. Confirm: the group toggle unchecks, the sort dropdown switches to "Title A→Z", and the page scrolls to the first matching link.
5. Click "#". Confirm the page scrolls back to the top, and group/sort settings are unchanged from step 4 (still ungrouped/title-asc).
6. Switch to **Cards** view and repeat steps 3-5 — confirm the same behavior works against `.link-card` elements.
7. Switch to **Least Viewed** view. Confirm the A-Z index disappears entirely.
8. Type a search query that excludes some titles. Confirm the letters for the now-excluded titles become disabled, and clicking a still-enabled letter still lands correctly (search query is preserved, per spec).
9. Reload the manager page (letters should remain functional — `buildAzIndex()` runs once in `init()`).
10. Remove all saved links (or connect a fresh empty file) so the manager page shows its empty state. Confirm the A-Z strip is still visible with all 26 letters disabled/greyed, and clicking "#" still scrolls to top without erroring.

- [ ] **Step 7: Commit**

```bash
git add manager.html manager.js manager.css && git commit -m "$(cat <<'EOF'
feat: add A-Z quick-jump index to manager page

Adds a fixed right-edge alphabet strip (List/Card views only) that
jumps to the first saved link whose title starts with a clicked
letter, switching to ungrouped + title-asc mode first if needed, plus
a "#" button to scroll back to the top.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Update English docs (README.md, user-guide.md) and mockups

**Files:**
- Modify: `README.md` (manager-page feature list)
- Modify: `docs/user-guide.md` (add a new subsection under the manager-page section)
- Modify: `docs/images/en/manager-list.svg`, `docs/images/en/manager-card.svg`

**Interfaces:**
- Consumes: nothing from Task 1's code (docs describe user-facing behavior only).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Check README.md's manager-page feature list and add the A-Z index**

Read `README.md`'s "Managing saved links" section (search for `### Managing saved links`, currently starting around line 69). Find the bullet list describing manager-page features (sorting, grouping, search, etc. — likely items like "Sort links by...", "Group links by site..."). Add a new bullet in the same style, e.g.:

```markdown
- Click a letter in the **A-Z index** on the right edge (List/Cards view) to
  jump straight to the first link whose title starts with that letter —
  switches to ungrouped, title-sorted view if needed. Click **"#"** to
  scroll back to the top.
```

Insert it after the existing sorting/grouping bullets, matching the surrounding bullet style and indentation exactly (read the actual current bullets first, since exact wording/order in the file may differ slightly from what's summarized here).

- [ ] **Step 2: Add a new subsection to `docs/user-guide.md`**

Read `docs/user-guide.md`'s table of contents and the section covering List/Card views (likely near where sorting and grouping are documented — search for "Sorting" or "Grouping" headings). Add a new `###`-level subsection immediately after the grouping documentation, e.g.:

```markdown
### Jumping to a letter

In List or Card view, an A-Z strip appears along the right edge of the page.
Click a letter to jump straight to the first saved link whose title starts
with it — letters with no matching titles are greyed out. If the page isn't
already sorted alphabetically, clicking a letter switches it to **ungrouped,
"Title A→Z"** sorting first, then jumps.

Click **"#"** at the top of the strip to scroll back to the top of the page
without changing your sort or grouping settings.

The A-Z index isn't shown in Least Viewed view, and reflects your current
search filter — if you've typed a search query, only letters with matching
results are clickable.
```

Also add the corresponding entry to the table of contents near the top of the file, matching the existing TOC link format (e.g. `- [Jumping to a letter](#jumping-to-a-letter)`), placed after the sorting/grouping TOC entries.

- [ ] **Step 3: Update the English mockups**

Read `docs/images/en/manager-list.svg` and `docs/images/en/manager-card.svg`. Both are SVG mockups matching the real CSS (no live browser available in this environment, per project convention). Add a vertical strip of small text elements along the right edge of each SVG representing the A-Z index — a column of single-letter `<text>` elements (A through Z, using a subset like A, B, C, ... Z or an abbreviated visual with a few visible letters and a `⋮`-style indication is acceptable as long as it's recognizable as an alphabet index), plus a "#" at the top, positioned near the right edge of the existing viewBox, styled consistent with the SVG's existing font/colors (check the existing `<style>` or inline `fill`/`font-family` attributes used elsewhere in the file and match them, particularly the `--accent` blue for the letters).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/user-guide.md docs/images/en/manager-list.svg docs/images/en/manager-card.svg && git commit -m "$(cat <<'EOF'
docs: document the A-Z quick-jump index

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update Chinese docs (docs/zh/README.md, docs/zh/user-guide.md) and mockups

**Files:**
- Modify: `docs/zh/README.md` (manager-page feature list)
- Modify: `docs/zh/user-guide.md` (add a new subsection under the manager-page section)
- Modify: `docs/images/zh/manager-list.svg`, `docs/images/zh/manager-card.svg`

**Interfaces:**
- Consumes: nothing from Task 1 or Task 2's changes directly, but must stay conceptually parallel to Task 2's English content.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the equivalent bullet to `docs/zh/README.md`**

Read `docs/zh/README.md`'s "使用方法" / manager-page feature list section (parallel to the English "Managing saved links" section from Task 2 Step 1). Add a new bullet in the same style and position (after the sorting/grouping bullets), conceptually matching Task 2 Step 1's English bullet, e.g.:

```markdown
- 点击右侧边缘的 **A-Z 索引** 中的字母（列表/卡片视图），可直接跳转到第一个以该字母开头的链接标题——如有需要会自动切换为未分组、按标题排序的视图。点击 **"#"** 可回到页面顶部。
```

- [ ] **Step 2: Add the equivalent subsection to `docs/zh/user-guide.md`**

Read `docs/zh/user-guide.md`'s TOC and the section covering List/Card views (parallel to Task 2 Step 2's location, near sorting/grouping docs). Add a new `###`-level subsection matching Task 2 Step 2's English content in meaning and structure, e.g.:

```markdown
### 按字母跳转

在列表视图或卡片视图下，页面右侧边缘会出现一个 A-Z 字母索引。点击某个字母，即可直接跳转到第一个以该字母开头的已保存链接标题——没有匹配标题的字母会显示为灰色不可点击。如果当前视图还没有按字母排序，点击字母会先自动切换为**未分组、"标题 A→Z"**排序，再跳转。

点击索引顶部的 **"#"** 可以回到页面顶部，不会改变你当前的排序或分组设置。

Least Viewed（最少查看）视图下不会显示 A-Z 索引；索引也会根据当前的搜索关键词过滤——如果你输入了搜索内容，只有匹配结果中存在的字母才可以点击。
```

Also add the corresponding TOC entry near the top of the file, matching the existing TOC format (e.g. `- [按字母跳转](#按字母跳转)`), placed after the sorting/grouping TOC entries.

- [ ] **Step 3: Update the Chinese mockups**

Read `docs/images/zh/manager-list.svg` and `docs/images/zh/manager-card.svg`. Apply the same visual addition as Task 2 Step 3 (A-Z strip + "#" along the right edge), matching each file's existing style/colors — these are separate SVG files from the English ones, so the same edit must be applied to both independently (no shared source).

- [ ] **Step 4: Commit**

```bash
git add docs/zh/README.md docs/zh/user-guide.md docs/images/zh/manager-list.svg docs/images/zh/manager-card.svg && git commit -m "$(cat <<'EOF'
docs: 同步中文文档，说明 A-Z 快速跳转索引

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
