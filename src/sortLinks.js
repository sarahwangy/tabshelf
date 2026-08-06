export const SORT_MODES = ['newest', 'oldest', 'title-asc', 'title-desc'];

export function sortLinks(links, mode) {
  const sorted = [...links];
  switch (mode) {
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
    case 'title-asc':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'title-desc':
      return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'newest':
    default:
      return sorted.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }
}
