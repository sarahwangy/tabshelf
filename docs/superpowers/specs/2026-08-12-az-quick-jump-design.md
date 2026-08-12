# A-Z quick-jump index — design

Date: 2026-08-12

## Problem

The manager page's link list can grow long. Users currently have to scroll
manually to find a link near the end of the alphabet, then scroll all the
way back up. There's no quick way to jump to a section by first letter, the
way iOS Contacts' right-edge A-Z strip works.

## Goal

Add a fixed A-Z index strip on the right edge of the manager page (plus a
"#" at the top) that lets users jump straight to the first saved link whose
title starts with a given letter, and jump back to the top of the page.

## Scope

- Applies to **List** and **Card** views only. Hidden in **Least Viewed**
  view (that view has its own independent sort/data source — view count,
  not title — so an alphabet index doesn't map onto it).
- Jump target is the link's **title**, first letter, case-insensitive.
- The index operates on **whatever is currently visible after the search
  filter** — if the user has typed a search query, disabled/enabled
  letters and jump targets reflect the filtered set, not the full saved
  list.
- "#" always scrolls to the top of the page. It does not double as a jump
  target for non-alphabetic titles — titles starting with a digit or
  symbol have no dedicated quick-jump entry.

## Behavior

### Rendering the index

Recomputed every time the link list re-renders (sort change, group
toggle, search input, add/remove a link):

1. Take the current search-filtered set of links.
2. Re-sort that set as **title-asc** (independent of the user's actual
   sort-mode setting — this is just for computing which letters have
   content) and extract each title's first character, case-insensitive.
3. For each of the 26 letters, mark its button enabled if at least one
   filtered title starts with it, otherwise disabled (greyed out,
   unclickable — no wrap-to-nearest-letter behavior).

### Clicking a letter

1. If the manager page is not currently in "ungrouped + title-asc" mode,
   silently switch to it: turn off the group-by-domain toggle
   (`#group-toggle`) and set the sort select (`#sort-select`) to
   `title-asc`. This triggers the existing re-render path.
2. After re-render, scan the now-rendered items in the current view
   (`.link-item` for List, `.link-card` for Card) for the first one whose
   title starts with the clicked letter (case-insensitive), and call
   `element.scrollIntoView({ behavior: 'smooth', block: 'start' })` — the
   same technique already used by the Recent 7 Days sidebar
   (`manager.js:478`).
3. Search filter, if any, is left as-is — only grouping and sort change.

### Clicking "#"

`window.scrollTo({ top: 0, behavior: 'smooth' })`. Does not touch group/sort
settings.

### Disabled letters

Letters with no matching title in the current filtered set are rendered
with a disabled/greyed style and are not clickable. No proximity-jump
fallback.

## Architecture

- **`manager.html`**: add a `<nav class="az-index">` container with 26
  letter buttons + one "#" button, positioned as a sibling within
  `.page-layout` (or fixed to the viewport's right edge — implementation
  detail for the plan) so it doesn't participate in the page's normal flow
  and stays visible while scrolling.
- **`manager.js`**: add a render function (e.g. `renderAzIndex(filteredLinks)`)
  called from the same place the main list render happens, after the
  search filter is applied. Add a click handler on the nav that:
  - for `#`: scrolls to top
  - for a letter: switches mode if needed (via the existing group-toggle
    and sort-select change handlers, so all existing side effects like
    persisting the setting via `setGroupByDomain`/`setSortMode` still
    fire), waits for re-render, then scrolls to the matching element.
- **`manager.css`**: fixed-position right-edge vertical strip, disabled
  letter styling, no new dependencies.
- No changes to `src/storage.js`, `src/sortLinks.js`, `src/groupByDomain.js`,
  or `src/filterLinks.js` — this task only consumes their existing outputs.

## Error handling / edge cases

| Case | Behavior |
|---|---|
| No saved links at all | All 26 letters disabled; "#" still works (scrolls to empty state) |
| Letter clicked but re-render produces zero matches (race: link removed between render and click) | No-op — scrollIntoView simply isn't called if no matching element is found |
| Least Viewed view active | A-Z index hidden entirely |
| Search filter narrows results to zero | All letters disabled |

## Documentation updates required

Per project convention, doc updates ship in the same change:

- `docs/user-guide.md` / `docs/zh/user-guide.md`: document the new A-Z
  index — what it does, that it only applies to List/Card views, and that
  clicking a letter may switch grouping/sort settings.
- `README.md` / `docs/zh/README.md`: brief mention in the manager-page
  feature list, consistent with how other manager features (sorting,
  grouping) are already listed there.
- Mockups: update `docs/images/en/manager-list.svg` and
  `docs/images/en/manager-card.svg` (and their `docs/images/zh/`
  counterparts) to show the new right-edge A-Z strip.

## Out of scope

- Mobile/narrow-viewport layout adjustments.
- Any change to Least Viewed view.
- Jumping by domain name (only title-based, per earlier decision).
- Digit/symbol quick-jump entries.
