import assert from "node:assert/strict";
import test from "node:test";
import { defaultTimelineItems, defaultTimelineTags } from "./defaultData";

test("bundled timeline defaults preserve the full spreadsheet and its relationships", () => {
  const itemIds = new Set(defaultTimelineItems.map((item) => item.id));
  const tagNames = new Set(defaultTimelineTags.map((tag) => tag.name));

  assert.equal(defaultTimelineItems.length, 602);
  assert.equal(defaultTimelineTags.length, 30);
  assert.ok(defaultTimelineItems.every((item) =>
    item.tags.every((tag) => tagNames.has(tag)) &&
    (item.teacherIds ?? []).every((teacherId) => itemIds.has(teacherId)) &&
    (item.grandTeacherIds ?? []).every((teacherId) => item.teacherIds?.includes(teacherId))
  ));
});
