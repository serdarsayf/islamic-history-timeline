import assert from "node:assert/strict";
import test from "node:test";
import {
  exportTimelineCategory,
  exportTimelineCsv,
  importTimelineCategory,
  importTimelineCsv,
  mergeTimelineCategoryItems,
} from "./dataExchange";
import { initialItems } from "./data";
import { initialItemFormState } from "./types";
import { buildTimelineItemData, isChronologicalRange, isPositiveWholeYear } from "./validation";

test("historical years are positive integers and ranges follow BC/CE order", () => {
  assert.equal(isPositiveWholeYear(1), true);
  assert.equal(isPositiveWholeYear(1.5), false);
  assert.equal(isPositiveWholeYear(Number.MAX_SAFE_INTEGER + 1), false);
  assert.equal(isChronologicalRange(2, "BC", 1, "BC"), true);
  assert.equal(isChronologicalRange(1, "BC", 1, "CE"), true);
  assert.equal(isChronologicalRange(10, "CE", 9, "CE"), false);
});

test("CSV export and import preserve valid timeline items", () => {
  const csv = exportTimelineCsv(initialItems, []);
  assert.deepEqual(importTimelineCsv(csv).items, initialItems);
});

test("full names round-trip without changing display names", () => {
  const items = initialItems.map((item, index) =>
    index === 0 ? { ...item, fullName: "The Hijra of the Prophet Muhammad" } : item
  );

  assert.deepEqual(importTimelineCsv(exportTimelineCsv(items, [])).items, items);
});

test("works text round-trips through CSV", () => {
  const items = initialItems.map((item, index) =>
    index === 0 ? { ...item, works: "Book One\nBook Two" } : item
  );

  assert.deepEqual(importTimelineCsv(exportTimelineCsv(items, [])).items, items);
});

test("CSV export and import preserve ordered tag hierarchy", () => {
  const tags = [
    { name: "History", color: "#112233" },
    { name: "Ancient", color: "#223344", parentName: "History", isMeta: true },
  ];
  const csv = exportTimelineCsv(initialItems, tags);

  assert.deepEqual(importTimelineCsv(csv).tags, tags);
});

test("CSV preserves unused tags even when the timeline has no items", () => {
  const tags = [
    { name: "Research", color: "#112233", isMeta: true, itemPosition: "above" as const, itemPositionUpdatedAt: 12 },
    { name: "Archive", color: "#223344", parentName: "Research" },
  ];

  assert.deepEqual(importTimelineCsv(exportTimelineCsv([], tags)), {
    items: [],
    tags,
  });
});

test("CSV preserves tag references containing delimiter characters", () => {
  const specialTag = { name: "A|B, \"quoted\"", color: "#123456" };
  const items = [{ ...initialItems[0], tags: [specialTag.name] }];
  const imported = importTimelineCsv(exportTimelineCsv(items, [specialTag]));

  assert.deepEqual(imported.items, items);
  assert.deepEqual(imported.tags, [specialTag]);
});

test("CSV round-trip preserves the complete tag catalog and item relations", () => {
  const tags = [
    {
      name: "Collections",
      color: "#123456",
      itemPosition: "below" as const,
      itemPositionUpdatedAt: 44,
    },
    {
      name: "Primary sources|letters",
      color: "#234567",
      parentName: "Collections",
      isMeta: true,
    },
    { name: "Unused tag", color: "#345678" },
  ];
  const items = [
    {
      ...initialItems[0],
      tags: [tags[0].name, tags[1].name],
      fullName: "Full display name",
      works: "Work one\nWork two",
    },
    { ...initialItems[1], tags: [tags[0].name] },
  ];

  assert.deepEqual(
    importTimelineCsv(exportTimelineCsv(items, tags)),
    { items, tags }
  );
});

test("approximate start and end dates round-trip through CSV", () => {
  const items = [{
    ...initialItems[1],
    startDate: { ...initialItems[1].startDate, approximate: true },
    endDate: { ...initialItems[1].endDate!, approximate: true },
  }, {
    ...initialItems[0],
    startDate: { ...initialItems[0].startDate, approximate: true },
  }, initialItems[2]];

  assert.deepEqual(importTimelineCsv(exportTimelineCsv(items, [])).items, items);
});

test("form conversion records which dates are approximate", () => {
  const item = buildTimelineItemData({
    ...initialItemFormState,
    itemType: "period",
    title: "Period",
    startYear: "10",
    startApproximate: true,
    endYear: "20",
  });

  assert.equal(item?.startDate.approximate, true);
  assert.equal(item?.endDate?.approximate, undefined);
});

test("CSV import remains compatible with files from previous formats", () => {
  const csv = exportTimelineCsv(initialItems, []);
  const withoutLastColumns = (count: number) => {
    let result = csv;
    for (let step = 0; step < count; step += 1) {
      result = result
        .split("\r\n")
        .map((row) => row.slice(0, row.lastIndexOf(",")))
        .join("\r\n");
    }
    return result;
  };

  // Counts 1, 2 and 4-8 are the shipped layouts; the two approximate columns were added together.
  [1, 2, 4, 5, 6, 7, 8].forEach((count) => {
    assert.deepEqual(importTimelineCsv(withoutLastColumns(count)).items, initialItems);
  });
});

test("category export preserves category details and only its items", () => {
  const category = {
    name: "Research",
    color: "#2563eb",
    itemPosition: "below" as const,
    itemPositionUpdatedAt: 10,
  };
  const childCategory = { name: "Archive", color: "#1d4ed8", parentName: "Research", isMeta: true };
  const otherCategory = { name: "Personal", color: "#16a34a" };
  const items = initialItems.map((item, index) => ({
    ...item,
    tags: index === 0 ? [childCategory.name] : [otherCategory.name],
  }));
  const packageJson = exportTimelineCategory(
    category,
    items,
    [category, childCategory, otherCategory]
  );

  assert.deepEqual(importTimelineCategory(packageJson), {
    category,
    items: [items[0]],
    tags: [category, childCategory],
  });
});

test("category import deduplicates items and remaps conflicting IDs", () => {
  const existing = [initialItems[0]];
  const imported = [
    initialItems[0],
    { ...initialItems[1], id: initialItems[0].id },
  ];

  const merged = mergeTimelineCategoryItems(existing, imported);

  assert.equal(merged.length, 2);
  assert.equal(merged[0], existing[0]);
  assert.notEqual(merged[1].id, existing[0].id);
});

test("CSV import rejects fractional years", () => {
  const csv = exportTimelineCsv(initialItems, []).replace("622,CE", "622.5,CE");
  assert.throws(() => importTimelineCsv(csv), /positive whole year/);
});

test("CSV import rejects duplicate IDs", () => {
  const csv = exportTimelineCsv(initialItems, []).replace("2,period,Abbasid Caliphate", "1,period,Abbasid Caliphate");
  assert.throws(() => importTimelineCsv(csv), /duplicated/);
});

test("CSV import rejects periods ending before their start", () => {
  const csv = exportTimelineCsv(initialItems, []).replace("1258,CE", "700,CE");
  assert.throws(() => importTimelineCsv(csv), /end date must not come before/);
});

test("form conversion rejects invalid years and reversed periods", () => {
  assert.equal(buildTimelineItemData({ ...initialItemFormState, title: "Event", startYear: "12.5" }), null);
  assert.equal(buildTimelineItemData({
    ...initialItemFormState,
    itemType: "period",
    title: "Period",
    startYear: "10",
    startEra: "CE",
    endYear: "9",
    endEra: "CE",
  }), null);
  assert.equal(buildTimelineItemData({ ...initialItemFormState, title: "Event", startYear: "12" })?.startDate.year, 12);
});

test("CSV import rejects rows with missing or extra columns", () => {
  const csv = exportTimelineCsv(initialItems, []);
  assert.throws(() => importTimelineCsv(csv.replace(",above,", ",")), /expected 24 columns/);
  assert.throws(() => importTimelineCsv(`${csv},extra`), /expected 24 columns/);
});

test("teacher relationships round-trip through CSV and reject missing teachers", () => {
  const items = [
    initialItems[0],
    { ...initialItems[1], teacherIds: [1] },
    { ...initialItems[2], teacherIds: [1, 2] },
  ];
  assert.deepEqual(importTimelineCsv(exportTimelineCsv(items, [])).items, items);

  const dangling = [{ ...initialItems[0], teacherIds: [99] }];
  assert.throws(
    () => importTimelineCsv(exportTimelineCsv(dangling, [])),
    /teacher id 99 is not present/
  );
});

test("category packages retain teachers outside the exported category", () => {
  const category = { name: "Research", color: "#2563eb" };
  const teacher = { ...initialItems[0], id: 10, tags: ["Other"] };
  const student = { ...initialItems[1], id: 11, tags: [category.name], teacherIds: [teacher.id] };
  const packageJson = exportTimelineCategory(category, [teacher, student], [category]);
  const imported = importTimelineCategory(packageJson);

  assert.deepEqual(imported.items, [student]);
  const merged = mergeTimelineCategoryItems([teacher], imported.items);
  assert.deepEqual(merged.find((item) => item.id === student.id)?.teacherIds, [teacher.id]);
});

test("category packages identify external teachers when IDs collide", () => {
  const category = { name: "Research", color: "#2563eb" };
  const teacher = { ...initialItems[0], id: 10, title: "External teacher", tags: ["Other"] };
  const wrongTeacher = { ...initialItems[0], id: 10, title: "Unrelated item" };
  const matchingTeacher = { ...teacher, id: 30 };
  const student = { ...initialItems[1], id: 11, tags: [category.name], teacherIds: [teacher.id] };
  const imported = importTimelineCategory(
    exportTimelineCategory(category, [teacher, student], [category])
  );
  const merged = mergeTimelineCategoryItems(
    [wrongTeacher, matchingTeacher],
    imported.items,
    imported.teacherReferences
  );

  assert.deepEqual(merged.find((item) => item.id === student.id)?.teacherIds, [matchingTeacher.id]);
});

test("category merge rejects unresolved external teachers instead of dropping them", () => {
  const imported = [{ ...initialItems[1], teacherIds: [99] }];

  assert.throws(
    () => mergeTimelineCategoryItems([], imported),
    /teacher item 99 is not present/
  );
});

test("category merge remaps teacher references to the new item IDs", () => {
  const existing = [initialItems[0]];
  const imported = [
    { ...initialItems[1], id: 1, teacherIds: [2] },
    { ...initialItems[2], id: 2, teacherIds: [1] },
  ];
  const merged = mergeTimelineCategoryItems(existing, imported);

  assert.deepEqual(merged.map((item) => item.id), [1, 2, 3]);
  assert.deepEqual(merged[1].teacherIds, [3]);
  assert.deepEqual(merged[2].teacherIds, [2]);
});

test("form conversion carries teacher selections", () => {
  const item = buildTimelineItemData({
    ...initialItemFormState,
    title: "Student",
    startYear: "10",
    teacherIds: [4, 7],
  });

  assert.deepEqual(item?.teacherIds, [4, 7]);
  assert.equal(
    buildTimelineItemData({ ...initialItemFormState, title: "Solo", startYear: "10" })?.teacherIds,
    undefined
  );
});

test("grand-teacher flags round-trip through CSV and must be real teachers", () => {
  const items = [
    initialItems[0],
    { ...initialItems[1], teacherIds: [1], grandTeacherIds: [1] },
    { ...initialItems[2], teacherIds: [1, 2], grandTeacherIds: [2] },
  ];
  assert.deepEqual(importTimelineCsv(exportTimelineCsv(items, [])).items, items);

  const notATeacher = [initialItems[0], { ...initialItems[1], teacherIds: [1], grandTeacherIds: [3] }, initialItems[2]];
  assert.throws(
    () => importTimelineCsv(exportTimelineCsv(notATeacher, [])),
    /grandTeacherIds must list ids/
  );
});

test("category merge remaps grand-teacher flags with their teachers", () => {
  const imported = [
    { ...initialItems[1], id: 1, teacherIds: [2], grandTeacherIds: [2] },
    { ...initialItems[2], id: 2, teacherIds: [1] },
  ];
  const merged = mergeTimelineCategoryItems([initialItems[0]], imported);

  assert.deepEqual(merged[1].teacherIds, [3]);
  assert.deepEqual(merged[1].grandTeacherIds, [3]);
  assert.equal(merged[2].grandTeacherIds, undefined);
});

test("form conversion keeps grand-teachers only when they are teachers", () => {
  const item = buildTimelineItemData({
    ...initialItemFormState,
    title: "Student",
    startYear: "10",
    teacherIds: [4, 7],
    grandTeacherIds: [7, 9],
  });

  assert.deepEqual(item?.grandTeacherIds, [7]);
  assert.equal(
    buildTimelineItemData({ ...initialItemFormState, title: "Solo", startYear: "10" })?.grandTeacherIds,
    undefined
  );
});