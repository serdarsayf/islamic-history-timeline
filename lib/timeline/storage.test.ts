import assert from "node:assert/strict";
import test from "node:test";
import { initialItems } from "./data";
import {
  normalizeStoredItems,
  onPersistError,
  parseStoredItems,
  readStoredItems,
  writeStoredItems,
} from "./storage";

function stubWindow() {
  const store = new Map<string, string>();
  const target = new EventTarget() as EventTarget & { localStorage: unknown };
  const state = { failWrites: false, setItemCalls: 0 };
  target.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      state.setItemCalls += 1;
      if (state.failWrites) throw new Error("QuotaExceededError");
      store.set(key, value);
    },
  };
  (globalThis as { window?: unknown }).window = target;
  return { target, store, state };
}

test("flushed writes keep the cached array and item identity", () => {
  const { target } = stubWindow();
  const items = initialItems.map((item) => ({ ...item }));

  writeStoredItems(items);
  target.dispatchEvent(new Event("pagehide"));

  const read = readStoredItems([]);
  assert.equal(read, items);
  assert.equal(read[0], items[0]);
});

test("failed writes stay in memory, report errors, and retry later", () => {
  const { target, store, state } = stubWindow();
  const messages: Array<string | null> = [];
  const unsubscribe = onPersistError((message) => messages.push(message));
  const edited = initialItems.map((item) => ({ ...item, title: `${item.title} edited` }));

  state.failWrites = true;
  writeStoredItems(edited);
  target.dispatchEvent(new Event("pagehide"));

  assert.equal(readStoredItems([]), edited);
  assert.equal(messages.length, 1);
  assert.match(String(messages[0]), /Could not save/);

  state.failWrites = false;
  const next = edited.map((item) => ({ ...item, title: `${item.title}!` }));
  writeStoredItems(next);
  target.dispatchEvent(new Event("pagehide"));

  assert.equal(store.get("timeline-items"), JSON.stringify(next));
  assert.equal(readStoredItems([]), next);
  assert.deepEqual(messages.slice(1), [null]);
  unsubscribe();
});

test("pagehide flushes a pending write immediately", () => {
  const { target, store, state } = stubWindow();

  writeStoredItems(initialItems);
  assert.equal(state.setItemCalls, 0);
  target.dispatchEvent(new Event("pagehide"));

  assert.equal(state.setItemCalls, 1);
  assert.equal(store.get("timeline-items"), JSON.stringify(initialItems));
});

test("stored item normalization preserves valid item details", () => {
  const item = {
    ...initialItems[1],
    fullName: "The Abbasid Caliphate",
    works: "Book One\nBook Two",
    tags: ["History", "  ", "Primary sources"],
    startDate: { ...initialItems[1].startDate, approximate: true },
  };

  assert.deepEqual(normalizeStoredItems([item], []), [{
    ...item,
    tags: ["History", "Primary sources"],
  }]);
});

test("stored item normalization drops malformed and duplicate records", () => {
  const duplicate = { ...initialItems[0], title: "Duplicate id" };
  const malformedDate = { ...initialItems[0], id: 4, startDate: { year: 0, era: "CE" } };
  const invalidPeriod = { ...initialItems[1], id: 5, endDate: { year: 1, era: "BC" } };

  assert.deepEqual(
    normalizeStoredItems([initialItems[0], duplicate, malformedDate, invalidPeriod], []),
    [initialItems[0]]
  );
});

test("non-array storage payloads preserve the existing fallback", () => {
  assert.deepEqual(normalizeStoredItems({ item: initialItems[0] }, initialItems), initialItems);
});

test("malformed storage JSON preserves the existing fallback", () => {
  assert.deepEqual(parseStoredItems("{broken", initialItems), initialItems);
});

test("stored teacher references are kept only when they point at other stored items", () => {
  const stored = [
    initialItems[0],
    { ...initialItems[1], teacherIds: [1, 1, 2, 99, "3"] },
  ];

  assert.deepEqual(normalizeStoredItems(stored, []), [
    initialItems[0],
    { ...initialItems[1], teacherIds: [1] },
  ]);
});