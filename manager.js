import {
  getConnectedFile,
  connectFile,
  readLinksFile,
  writeLinksFile,
  regrantPermission,
  getViewMode,
  setViewMode,
  getSortMode,
  setSortMode,
  getGroupByDomain,
  setGroupByDomain,
} from './src/storage.js';
import { removeLink } from './src/linkMerge.js';
import { filterLinks } from './src/filterLinks.js';
import { sortLinks } from './src/sortLinks.js';
import { groupLinksByDomain, getDomain } from './src/groupByDomain.js';
import { getFavorites, toggleFavorite, reorderFavorites, sortGroupsByFavorite } from './src/favorites.js';
import { incrementOpenCount, getLeastViewed } from './src/leastViewed.js';
import { logExpected, logUnexpected } from './src/log.js';
import { getDateKey, getRecentDayGroups } from './src/recentDays.js';

const connectSection = document.getElementById('connect-section');
const listSection = document.getElementById('list-section');
const linkList = document.getElementById('link-list');
const connectMessageEl = document.getElementById('connect-message');
const connectBtn = document.getElementById('connect-btn');
const grantBtn = document.getElementById('grant-btn');
const reconnectBtn = document.getElementById('reconnect-btn');
const errorEl = document.getElementById('error');
const linkCountEl = document.getElementById('link-count');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const groupToggle = document.getElementById('group-toggle');
const groupToggleLabel = document.querySelector('.group-toggle');
const viewListBtn = document.getElementById('view-list-btn');
const viewCardBtn = document.getElementById('view-card-btn');
const viewLeastViewedBtn = document.getElementById('view-least-viewed-btn');
const sidebarColumn = document.querySelector('.sidebar-column');
const sitesSidebar = document.getElementById('sites-sidebar');
const sitesList = document.getElementById('sites-list');
const favoritesSidebar = document.getElementById('favorites-sidebar');
const favoritesList = document.getElementById('favorites-list');
const recentDaysSidebar = document.getElementById('recent-days-sidebar');
const recentDaysList = document.getElementById('recent-days-list');
const bulkBar = document.getElementById('bulk-bar');
const bulkCountEl = document.getElementById('bulk-count');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const bulkClearBtn = document.getElementById('bulk-clear-btn');
const azIndexNav = document.getElementById('az-index');

let currentHandle = null;
let currentLinks = [];
let searchQuery = '';
let busy = false;
const selectedIds = new Set();
let pendingHandle = null;
let viewMode = 'list';
let sortMode = 'newest';
let groupByDomainEnabled = true;
let selectedDate = null;

function showPermissionLostUI(handle) {
  pendingHandle = handle;
  connectMessageEl.textContent = 'Access to your previously connected file was lost.';
  grantBtn.hidden = false;
  connectBtn.textContent = 'Or connect a different file';
  connectBtn.classList.remove('btn-primary');
  connectBtn.classList.add('btn-secondary');
}

function resetConnectUI() {
  pendingHandle = null;
  connectMessageEl.textContent = 'No file connected yet.';
  grantBtn.hidden = true;
  connectBtn.textContent = 'Connect a file';
  connectBtn.classList.add('btn-primary');
  connectBtn.classList.remove('btn-secondary');
}

function showConnect() {
  connectSection.hidden = false;
  listSection.hidden = true;
  reconnectBtn.hidden = true;
  sidebarColumn.hidden = true;
  sitesSidebar.hidden = true;
  favoritesSidebar.hidden = true;
  recentDaysSidebar.hidden = true;
  linkCountEl.textContent = '';
}

function showList() {
  connectSection.hidden = true;
  listSection.hidden = false;
  reconnectBtn.hidden = false;
  sidebarColumn.hidden = false;
  sitesSidebar.hidden = false;
  favoritesSidebar.hidden = false;
  recentDaysSidebar.hidden = false;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function renderEmptyMessage(text) {
  const p = document.createElement('p');
  p.className = 'empty-row';
  p.textContent = text;
  linkList.append(p);
}

function renderLinkItem(link) {
  const li = document.createElement('li');
  li.className = 'link-item';
  li.dataset.id = link.id;
  li.append(renderSelectCheckbox(link));

  let hostname = '';
  try {
    hostname = new URL(link.url).hostname;
  } catch {
    hostname = link.url;
  }
  const cover = renderCardCover(link, hostname);
  cover.classList.add('link-item-cover');

  const main = document.createElement('div');
  main.className = 'link-main';

  const a = document.createElement('a');
  a.className = 'link-title';
  a.href = link.url;
  a.textContent = link.title;
  a.target = '_blank';
  a.addEventListener('click', () => onOpenLink(link.id));

  const meta = document.createElement('div');
  meta.className = 'link-meta';

  const urlSpan = document.createElement('span');
  urlSpan.className = 'link-url';
  urlSpan.textContent = link.url;

  const dotSpan = document.createElement('span');
  dotSpan.className = 'link-dot';
  dotSpan.textContent = '·';

  const savedAtSpan = document.createElement('span');
  savedAtSpan.className = 'link-date';
  savedAtSpan.textContent = new Date(link.savedAt).toLocaleDateString();

  meta.append(urlSpan, dotSpan, savedAtSpan);
  main.append(a, meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.append(renderFavoriteToggle(link), renderRemoveButton(link));

  li.append(cover, main, actions);
  return li;
}

const PLACEHOLDER_GRADIENTS = [
  ['#8b5cf6', '#6366f1'],
  ['#f472b6', '#ec4899'],
  ['#fb923c', '#f97316'],
  ['#22d3ee', '#0ea5e9'],
  ['#34d399', '#10b981'],
  ['#f87171', '#ef4444'],
  ['#a78bfa', '#7c3aed'],
];

function getYouTubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1);
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function hashToIndex(str, mod) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % mod;
}

function renderCardCover(link, hostname) {
  const cover = document.createElement('div');
  cover.className = 'card-cover';

  const youTubeId = getYouTubeId(link.url);
  if (youTubeId) {
    const img = document.createElement('img');
    img.className = 'card-cover-img';
    img.src = `https://img.youtube.com/vi/${youTubeId}/mqdefault.jpg`;
    img.alt = '';
    img.loading = 'lazy';

    const play = document.createElement('span');
    play.className = 'card-cover-play';
    play.textContent = '▶';

    cover.append(img, play);

    const badge = document.createElement('span');
    badge.className = 'card-cover-badge';
    badge.textContent = hostname.replace(/^www\./, '');
    cover.append(badge);
  } else {
    const [from, to] = PLACEHOLDER_GRADIENTS[hashToIndex(hostname, PLACEHOLDER_GRADIENTS.length)];
    cover.classList.add('card-cover-placeholder');
    cover.style.background = `linear-gradient(135deg, ${from}, ${to})`;

    const iconBox = document.createElement('div');
    iconBox.className = 'card-cover-icon-box';

    const favicon = document.createElement('img');
    favicon.className = 'card-cover-favicon';
    favicon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
    favicon.alt = '';

    iconBox.append(favicon);
    cover.append(iconBox);
  }

  return cover;
}

function renderLinkCard(link) {
  const card = document.createElement('div');
  card.className = 'link-card';
  card.dataset.id = link.id;
  card.append(renderSelectCheckbox(link));

  let hostname = '';
  try {
    hostname = new URL(link.url).hostname;
  } catch {
    hostname = link.url;
  }

  const cover = renderCardCover(link, hostname);

  const body = document.createElement('div');
  body.className = 'card-body';

  const a = document.createElement('a');
  a.className = 'card-title';
  a.href = link.url;
  a.textContent = link.title;
  a.target = '_blank';
  a.addEventListener('click', () => onOpenLink(link.id));

  const hostSpan = document.createElement('div');
  hostSpan.className = 'card-host';
  hostSpan.textContent = hostname;

  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const dateSpan = document.createElement('span');
  dateSpan.className = 'card-date';
  dateSpan.textContent = new Date(link.savedAt).toLocaleDateString();

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.append(renderFavoriteToggle(link), renderRemoveButton(link));

  footer.append(dateSpan, actions);
  body.append(a, hostSpan, footer);
  card.append(cover, body);
  return card;
}

function updateBulkBar() {
  const count = selectedIds.size;
  bulkBar.hidden = count === 0;
  bulkCountEl.textContent = `${count} selected`;
}

function onToggleSelect(id, checked) {
  if (checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }
  updateBulkBar();
}

function renderSelectCheckbox(link) {
  const wrap = document.createElement('label');
  wrap.className = 'select-checkbox-wrap';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'select-checkbox';
  checkbox.checked = selectedIds.has(link.id);
  checkbox.setAttribute('aria-label', `Select ${link.title}`);
  checkbox.addEventListener('change', () => onToggleSelect(link.id, checkbox.checked));

  wrap.append(checkbox);
  return wrap;
}

async function onBulkDelete() {
  if (busy || selectedIds.size === 0) return;
  const count = selectedIds.size;
  if (!window.confirm(`Remove ${count} saved link${count === 1 ? '' : 's'}? This can't be undone.`)) return;
  busy = true;
  try {
    const remaining = currentLinks.filter((link) => !selectedIds.has(link.id));
    try {
      await writeLinksFile(currentHandle, remaining);
      currentLinks = remaining;
      selectedIds.clear();
      updateBulkBar();
      render();
    } catch (err) {
      logUnexpected('bulk removing links', err);
      showError('Could not remove the selected links. Please reconnect.');
      await loadAndRender();
    }
  } finally {
    busy = false;
  }
}

function onBulkClear() {
  selectedIds.clear();
  updateBulkBar();
  render();
}

function renderFavoriteToggle(link) {
  const btn = document.createElement('button');
  btn.className = 'btn-favorite' + (link.favorite ? ' is-favorite' : '');
  btn.textContent = link.favorite ? '★' : '☆';
  btn.title = link.favorite ? 'Remove from favorites' : 'Add to favorites';
  btn.addEventListener('click', () => onToggleFavorite(link.id));
  return btn;
}

function renderRemoveButton(link) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-remove';
  btn.textContent = 'Remove';
  btn.addEventListener('click', () => onRemove(link.id));
  return btn;
}

function applyViewMode(mode) {
  viewMode = mode === 'card' || mode === 'least-viewed' ? mode : 'list';
  viewListBtn.setAttribute('aria-pressed', String(viewMode === 'list'));
  viewCardBtn.setAttribute('aria-pressed', String(viewMode === 'card'));
  viewLeastViewedBtn.setAttribute('aria-pressed', String(viewMode === 'least-viewed'));
}

function renderFavoriteCard(link) {
  const card = document.createElement('div');
  card.className = 'favorite-card';
  card.draggable = true;
  card.dataset.id = link.id;

  card.addEventListener('dragstart', () => {
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    persistFavoritesOrder();
  });

  const a = document.createElement('a');
  a.className = 'favorite-title';
  a.href = link.url;
  a.textContent = link.title;
  a.target = '_blank';
  a.addEventListener('click', () => onOpenLink(link.id));

  const urlDiv = document.createElement('div');
  urlDiv.className = 'favorite-url';
  urlDiv.textContent = link.url;

  const unfavBtn = document.createElement('button');
  unfavBtn.className = 'unfavorite-btn';
  unfavBtn.title = 'Remove from favorites';
  unfavBtn.textContent = '★';
  unfavBtn.addEventListener('click', () => onToggleFavorite(link.id));

  card.append(a, urlDiv, unfavBtn);
  return card;
}

function domainToSlug(domain) {
  return `group-${domain.replace(/[^a-z0-9]+/gi, '-')}`;
}

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
  const target = linkList.querySelector(`.link-item[data-id="${CSS.escape(match.id)}"], .link-card[data-id="${CSS.escape(match.id)}"]`);
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

function getSiteGroups(links) {
  const byDomain = new Map();
  for (const link of links) {
    const domain = getDomain(link.url);
    byDomain.set(domain, (byDomain.get(domain) || 0) + 1);
  }
  return Array.from(byDomain, ([domain, count]) => ({ domain, count })).sort((a, b) =>
    a.domain.localeCompare(b.domain)
  );
}

function renderSiteButton(site) {
  const btn = document.createElement('button');
  btn.className = 'site-btn';
  btn.type = 'button';

  const favicon = document.createElement('img');
  favicon.className = 'site-favicon';
  favicon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.domain)}&sz=32`;
  favicon.alt = '';

  const label = document.createElement('span');
  label.className = 'site-label';
  label.textContent = site.domain;

  const count = document.createElement('span');
  count.className = 'site-count';
  count.textContent = String(site.count);

  btn.append(favicon, label, count);
  btn.addEventListener('click', () => onSelectSite(site.domain));
  return btn;
}

function renderSites() {
  sitesList.innerHTML = '';
  const sites = getSiteGroups(currentLinks);
  if (sites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'sites-empty';
    empty.textContent = 'No sites yet.';
    sitesList.append(empty);
    return;
  }
  for (const site of sites) {
    sitesList.append(renderSiteButton(site));
  }
}

// Jumping to a site only makes sense against the grouped, unfiltered list —
// so this resets search/date/least-viewed state back to the plain list
// view before scrolling, the same way a stale filter would otherwise hide
// the very group being jumped to.
function onSelectSite(domain) {
  selectedDate = null;
  searchQuery = '';
  searchInput.value = '';
  if (viewMode === 'least-viewed') {
    applyViewMode('list');
    setViewMode('list').catch((err) => logUnexpected('saving view mode', err));
  }
  if (!groupByDomainEnabled) {
    groupByDomainEnabled = true;
    groupToggle.checked = true;
    setGroupByDomain(true).catch((err) => logUnexpected('saving group-by-domain', err));
  }
  render();
  const target = document.getElementById(domainToSlug(domain));
  if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
}

function renderFavorites() {
  favoritesList.innerHTML = '';
  const favorites = getFavorites(currentLinks);
  if (favorites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'favorites-empty';
    empty.textContent = 'No favorites yet — click ☆ on a link to pin it here.';
    favoritesList.append(empty);
    return;
  }
  for (const link of favorites) {
    favoritesList.append(renderFavoriteCard(link));
  }
}

function formatDayLabel(dateKey) {
  const todayKey = getDateKey(new Date());
  if (dateKey === todayKey) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === getDateKey(yesterday)) return 'Yesterday';

  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

function renderRecentDayButton(group) {
  const btn = document.createElement('button');
  btn.className = 'recent-day-btn';
  btn.type = 'button';
  btn.setAttribute('aria-pressed', String(group.date === selectedDate));

  const label = document.createElement('span');
  label.className = 'recent-day-label';
  label.textContent = formatDayLabel(group.date);

  const count = document.createElement('span');
  count.className = 'recent-day-count';
  count.textContent = String(group.links.length);

  btn.append(label, count);
  btn.addEventListener('click', () => onSelectDate(group.date));
  return btn;
}

function renderRecentDays() {
  recentDaysList.innerHTML = '';
  const groups = getRecentDayGroups(currentLinks, 7);
  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'recent-days-empty';
    empty.textContent = 'No recent tabs yet.';
    recentDaysList.append(empty);
    return;
  }
  for (const group of groups) {
    recentDaysList.append(renderRecentDayButton(group));
  }
}

function onSelectDate(date) {
  selectedDate = selectedDate === date ? null : date;
  render();
}

function renderDateFiltered(date) {
  searchInput.hidden = true;
  sortSelect.hidden = true;
  groupToggleLabel.hidden = true;
  const dayLinks = currentLinks
    .filter((link) => getDateKey(new Date(link.savedAt)) === date)
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  linkCountEl.textContent = `${dayLinks.length} tab${dayLinks.length === 1 ? '' : 's'} from ${formatDayLabel(date)}`;

  if (dayLinks.length === 0) {
    renderEmptyMessage('No saved links for this day.');
    return;
  }

  const container = document.createElement('ul');
  container.className = 'link-list';
  for (const link of dayLinks) {
    container.append(renderLinkItem(link));
  }
  linkList.append(container);
}

// Classic vertical drag-reorder: while dragging, move the dragged card in the
// DOM to whichever side of its nearest sibling the pointer is closest to.
// The actual persisted order is only computed and written once, in
// persistFavoritesOrder(), after the drag ends.
function getDragAfterElement(container, y) {
  const elements = [...container.querySelectorAll('.favorite-card:not(.dragging)')];
  return elements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

favoritesList.addEventListener('dragover', (e) => {
  e.preventDefault();
  const dragging = favoritesList.querySelector('.dragging');
  if (!dragging) return;
  const afterElement = getDragAfterElement(favoritesList, e.clientY);
  if (afterElement == null) {
    favoritesList.appendChild(dragging);
  } else {
    favoritesList.insertBefore(dragging, afterElement);
  }
});

async function persistFavoritesOrder() {
  const orderedIds = [...favoritesList.querySelectorAll('.favorite-card')].map((el) => el.dataset.id);
  currentLinks = reorderFavorites(currentLinks, orderedIds);
  try {
    await writeLinksFile(currentHandle, currentLinks);
  } catch (err) {
    logUnexpected('saving favorites order', err);
    showError('Could not save the new favorites order. Please reconnect.');
    await loadAndRender();
  }
}

async function onToggleFavorite(id) {
  if (busy) return;
  busy = true;
  try {
    currentLinks = toggleFavorite(currentLinks, id);
    try {
      await writeLinksFile(currentHandle, currentLinks);
      render();
    } catch (err) {
      logUnexpected('toggling favorite', err);
      showError('Could not update favorite — the file may be unavailable. Please reconnect.');
      await loadAndRender();
    }
  } finally {
    busy = false;
  }
}

// Opening a saved link doesn't block on the write — the tab opens
// immediately regardless — but is still funneled through the `busy` guard
// so it can't race a concurrent favorite/remove mutation on `currentLinks`.
async function onOpenLink(id) {
  if (busy) return;
  busy = true;
  try {
    currentLinks = incrementOpenCount(currentLinks, id);
    try {
      await writeLinksFile(currentHandle, currentLinks);
      if (viewMode === 'least-viewed') render();
    } catch (err) {
      logUnexpected('recording link open', err);
    }
  } finally {
    busy = false;
  }
}

function renderLeastViewed() {
  searchInput.hidden = true;
  sortSelect.hidden = true;
  groupToggleLabel.hidden = true;
  const leastViewed = getLeastViewed(currentLinks, 5);
  linkCountEl.textContent = `${leastViewed.length} least-viewed link${leastViewed.length === 1 ? '' : 's'}`;

  if (leastViewed.length === 0) {
    renderEmptyMessage('No saved links yet.');
    return;
  }

  const container = document.createElement('ul');
  container.className = 'link-list';
  for (const link of leastViewed) {
    container.append(renderLinkItem(link));
  }
  linkList.append(container);
}

function render() {
  renderAzIndex();
  linkList.innerHTML = '';
  renderSites();
  renderFavorites();

  if (currentLinks.length === 0) {
    selectedDate = null;
    renderRecentDays();
    linkCountEl.textContent = '';
    searchInput.hidden = false;
    sortSelect.hidden = false;
    groupToggleLabel.hidden = false;
    renderEmptyMessage('No links saved yet — use the popup to save your first tab.');
    return;
  }

  if (selectedDate && !currentLinks.some((link) => getDateKey(new Date(link.savedAt)) === selectedDate)) {
    selectedDate = null;
  }
  renderRecentDays();

  if (selectedDate) {
    renderDateFiltered(selectedDate);
    return;
  }

  if (viewMode === 'least-viewed') {
    renderLeastViewed();
    return;
  }
  searchInput.hidden = false;
  sortSelect.hidden = false;
  groupToggleLabel.hidden = false;

  const visibleLinks = sortLinks(filterLinks(currentLinks, searchQuery), sortMode);

  linkCountEl.textContent =
    searchQuery.trim() === ''
      ? `${currentLinks.length} saved link${currentLinks.length === 1 ? '' : 's'}`
      : `${visibleLinks.length} of ${currentLinks.length} saved link${currentLinks.length === 1 ? '' : 's'}`;

  if (visibleLinks.length === 0) {
    renderEmptyMessage('No saved links match your search.');
    return;
  }

  if (!groupByDomainEnabled) {
    const container = document.createElement(viewMode === 'card' ? 'div' : 'ul');
    container.className = viewMode === 'card' ? 'link-cards' : 'link-list';
    for (const link of visibleLinks) {
      container.append(viewMode === 'card' ? renderLinkCard(link) : renderLinkItem(link));
    }
    linkList.append(container);
    return;
  }

  for (const group of sortGroupsByFavorite(groupLinksByDomain(visibleLinks))) {
    const section = document.createElement('section');
    section.className = 'link-group';
    section.id = domainToSlug(group.domain);

    const header = document.createElement('h2');
    header.className = 'group-header';
    header.textContent = group.domain;
    const countSpan = document.createElement('span');
    countSpan.className = 'group-count';
    countSpan.textContent = ` (${group.links.length})`;
    header.append(countSpan);

    const container = document.createElement(viewMode === 'card' ? 'div' : 'ul');
    container.className = viewMode === 'card' ? 'link-cards' : 'link-list';
    for (const link of group.links) {
      container.append(viewMode === 'card' ? renderLinkCard(link) : renderLinkItem(link));
    }

    section.append(header, container);
    linkList.append(section);
  }
}

async function loadAndRender() {
  try {
    const { links, corrupted } = await readLinksFile(currentHandle);
    currentLinks = links;
    if (corrupted) {
      showError('Saved file was unreadable — starting from an empty list.');
    } else {
      clearError();
    }
    render();
    showList();
  } catch (err) {
    logUnexpected('reading connected file', err);
    showError('Could not read the connected file. Please reconnect.');
    showConnect();
  }
}

async function onRemove(id) {
  if (busy) return;
  busy = true;
  try {
    currentLinks = removeLink(currentLinks, id);
    try {
      await writeLinksFile(currentHandle, currentLinks);
      selectedIds.delete(id);
      updateBulkBar();
      render();
    } catch (err) {
      // The write failed (e.g. the file was moved/deleted or permission was
      // revoked after load), so `currentLinks` is now out of sync with disk.
      // Re-read from the handle rather than rendering the stale mutated array;
      // if that also fails, loadAndRender()'s own catch already surfaces the
      // inline error + reconnect path.
      logUnexpected('removing link', err);
      showError('Could not remove — the file may be unavailable. Please reconnect.');
      await loadAndRender();
    }
  } finally {
    busy = false;
  }
}

async function onConnectClick() {
  try {
    currentHandle = await connectFile();
    resetConnectUI();
    clearError();
    searchQuery = '';
    searchInput.value = '';
    await loadAndRender();
  } catch (err) {
    if (err.name !== 'AbortError') {
      logUnexpected('connecting file', err);
      showError('Could not connect the file. Please try again.');
    }
  }
}

async function onGrantClick() {
  if (!pendingHandle) return;
  try {
    const granted = await regrantPermission(pendingHandle);
    if (!granted) {
      logExpected('grant access', 'user did not grant permission');
      showError('Permission was not granted. Connect a different file instead.');
      return;
    }
    currentHandle = pendingHandle;
    resetConnectUI();
    clearError();
    await loadAndRender();
  } catch (err) {
    logUnexpected('granting access', err);
    showError('Could not verify permission. Please try again or connect a different file.');
  }
}

connectBtn.addEventListener('click', onConnectClick);
reconnectBtn.addEventListener('click', onConnectClick);
grantBtn.addEventListener('click', onGrantClick);
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  render();
});

sortSelect.addEventListener('change', () => {
  sortMode = sortSelect.value;
  render();
  setSortMode(sortMode).catch((err) => logUnexpected('saving sort mode', err));
});

groupToggle.addEventListener('change', () => {
  groupByDomainEnabled = groupToggle.checked;
  render();
  setGroupByDomain(groupByDomainEnabled).catch((err) => logUnexpected('saving group-by-domain', err));
});

bulkDeleteBtn.addEventListener('click', onBulkDelete);
bulkClearBtn.addEventListener('click', onBulkClear);

function onViewModeClick(mode) {
  if (mode === viewMode && selectedDate === null) return;
  selectedDate = null;
  applyViewMode(mode);
  render();
  setViewMode(mode).catch((err) => logUnexpected('saving view mode', err));
}

viewListBtn.addEventListener('click', () => onViewModeClick('list'));
viewCardBtn.addEventListener('click', () => onViewModeClick('card'));
viewLeastViewedBtn.addEventListener('click', () => onViewModeClick('least-viewed'));

async function init() {
  buildAzIndex();

  try {
    applyViewMode(await getViewMode());
  } catch (err) {
    logUnexpected('loading view mode', err);
  }

  try {
    sortMode = await getSortMode();
    sortSelect.value = sortMode;
  } catch (err) {
    logUnexpected('loading sort mode', err);
  }

  try {
    groupByDomainEnabled = await getGroupByDomain();
    groupToggle.checked = groupByDomainEnabled;
  } catch (err) {
    logUnexpected('loading group-by-domain', err);
  }

  try {
    currentHandle = await getConnectedFile();
  } catch (err) {
    if (err.code === 'PERMISSION_DENIED' && err.handle) {
      // Expected on every page load until the user clicks "Grant access" —
      // Chrome resets File System Access permission grants on every
      // extension reload, so this isn't a bug, just the normal pre-repair
      // state. Logged at debug level so it doesn't pile up as an extension
      // "error" in chrome://extensions.
      logExpected('permission check at load', err);
      showError('Permission to your saved-links file was lost.');
      showPermissionLostUI(err.handle);
    } else {
      logUnexpected('permission check at load', err);
      showError('Could not access the previously connected file. Please reconnect.');
      resetConnectUI();
    }
    showConnect();
    return;
  }
  if (!currentHandle) {
    resetConnectUI();
    showConnect();
    return;
  }
  await loadAndRender();
}

init();
