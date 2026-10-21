import assert from "node:assert/strict";
import test from "node:test";
import {
  addTimelineItem,
  deleteTimelineItem,
  duplicateTimelineItem,
  removeTagFromTimelineItems,
  renameTagOnTimelineItems,
  updateTimelineItem,
} from "./itemActions";
import { initialItems } from "./data";

test("item actions preserve and assign stable unique IDs", () => {
  const itemData = { ...initialItems[0], title: "Added" };
  const added = addTimelineItem(initialItems, itemData);
  const duplicated = duplicateTimelineItem(added, initialItems[0].id);

  assert.equal(added.at(-1)?.id, 4);
  assert.equal(duplicated.at(-1)?.id, 5);
  assert.equal(duplicateTimelineItem(added, 999), added);
});

test("item actions update and delete only the requested item", () => {
  const itemData = { ...initialItems[1], title: "Updated" };
  const updated = updateTimelineItem(initialItems, 2, itemData);

  assert.equal(updated[1].title, "Updated");
  assert.equal(updated[1].id, 2);
  assert.deepEqual(deleteTimelineItem(updated, 2), [initialItems[0], initialItems[2]]);
});

test("deleting an item removes it as a teacher of other items", () => {
  const students = [
    initialItems[0],
    { ...initialItems[1], teacherIds: [1] },
    { ...initialItems[2], teacherIds: [1, 2] },
  ];
  const remaining = deleteTimelineItem(students, 1);

  assert.equal(remaining[0].teacherIds, undefined);
  assert.deepEqual(remaining[1].teacherIds, [2]);
});

test("tag actions update item references without dropping other tags", () => {
  const taggedItems = initialItems.map((item, index) => ({
    ...item,
    tags: index === 0 ? ["Old", "Keep"] : ["Other"],
  }));
  const renamed = renameTagOnTimelineItems(taggedItems, "Old", "New");

  assert.deepEqual(renamed[0].tags, ["New", "Keep"]);
  assert.deepEqual(removeTagFromTimelineItems(renamed, "New")[0].tags, ["Keep"]);
});