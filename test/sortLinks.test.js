import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortLinks } from '../src/sortLinks.js';

const links = [
  { id: '1', url: 'https://example.com/a', title: 'Banana', savedAt: '2026-01-02T00:00:00.000Z' },
  { id: '2', url: 'https://example.com/b', title: 'apple', savedAt: '2026-01-03T00:00:00.000Z' },
  { id: '3', url: 'https://example.com/c', title: 'Cherry', savedAt: '2026-01-01T00:00:00.000Z' },
];

test('sortLinks "newest" sorts by savedAt descending', () => {
  const result = sortLinks(links, 'newest');
  assert.deepEqual(result.map((l) => l.id), ['2', '1', '3']);
});

test('sortLinks defaults to "newest" for an unknown mode', () => {
  const result = sortLinks(links, 'bogus');
  assert.deepEqual(result.map((l) => l.id), ['2', '1', '3']);
});

test('sortLinks "oldest" sorts by savedAt ascending', () => {
  const result = sortLinks(links, 'oldest');
  assert.deepEqual(result.map((l) => l.id), ['3', '1', '2']);
});

test('sortLinks "title-asc" sorts titles A→Z case-insensitively', () => {
  const result = sortLinks(links, 'title-asc');
  assert.deepEqual(result.map((l) => l.id), ['2', '1', '3']);
});

test('sortLinks "title-desc" sorts titles Z→A case-insensitively', () => {
  const result = sortLinks(links, 'title-desc');
  assert.deepEqual(result.map((l) => l.id), ['3', '1', '2']);
});

test('sortLinks does not mutate the input array', () => {
  const original = [...links];
  sortLinks(links, 'title-asc');
  assert.deepEqual(links, original);
});
