import assert from "node:assert/strict";
import test from "node:test";
import { initialItems } from "./data";
import { normalizeStoredItems, parseStoredItems } from "./storage";

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