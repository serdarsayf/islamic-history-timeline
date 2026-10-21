import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteTimelineTag,
  filterItemsByTags,
  getTagBranchNames,
  getTagDepth,
  getTagItemPosition,
  isMetaTag,
  moveTimelineTag,
  nestTimelineTag,
  normalizeTimelineTags,
  setTimelineTagParent,
  setTimelineTagItemPosition,
  unnestTimelineTag,
} from "./tags";
import type { TimelineTag } from "./types";
import { initialItems } from "./data";

const tags: TimelineTag[] = [
  { name: "History", color: "#112233" },
  { name: "Ancient", color: "#223344", parentName: "History" },
  { name: "Modern", color: "#334455" },
  { name: "Recent", color: "#445566", parentName: "Modern" },
  { name: "Other", color: "#556677" },
];

test("tag ordering moves complete sibling subtrees", () => {
  assert.deepEqual(
    moveTimelineTag(tags, "Modern", -1).map((tag) => tag.name),
    ["Modern", "Recent", "History", "Ancient", "Other"]
  );
});

test("tags can be nested and promoted without losing their children", () => {
  const nested = nestTimelineTag(tags, "Modern");
  assert.equal(nested.find((tag) => tag.name === "Modern")?.parentName, "History");
  assert.equal(nested.find((tag) => tag.name === "Recent")?.parentName, "Modern");

  const promoted = unnestTimelineTag(nested, "Modern");
  assert.equal(promoted.find((tag) => tag.name === "Modern")?.parentName, undefined);
  assert.equal(promoted.find((tag) => tag.name === "Recent")?.parentName, "Modern");
});

test("a tag can be assigned under a selected parent without creating cycles", () => {
  const nested = setTimelineTagParent(tags, "Other", "History");
  assert.equal(nested.find((tag) => tag.name === "Other")?.parentName, "History");

  const rejected = setTimelineTagParent(nested, "History", "Other");
  assert.equal(rejected, nested);

  const unparented = setTimelineTagParent(nested, "Other", null);
  assert.equal(unparented.find((tag) => tag.name === "Other")?.parentName, undefined);
});

test("deleting a tag promotes its children and branch queries include descendants", () => {
  const deleted = deleteTimelineTag(tags, "History");
  assert.equal(deleted.find((tag) => tag.name === "Ancient")?.parentName, undefined);
  assert.deepEqual(getTagBranchNames(tags, "History"), ["History", "Ancient"]);
  assert.equal(getTagDepth(tags, "Ancient"), 1);
});

test("tag normalization removes missing parents and hierarchy cycles", () => {
  const normalized = normalizeTimelineTags([
    { name: "A", color: "#000000", parentName: "B", isMeta: true },
    { name: "B", color: "#111111", parentName: "A" },
    { name: "C", color: "#222222", parentName: "Missing" },
  ]);

  assert.equal(normalized.find((tag) => tag.name === "A")?.parentName, undefined);
  assert.equal(normalized.find((tag) => tag.name === "A")?.isMeta, true);
  assert.equal(normalized.find((tag) => tag.name === "B")?.parentName, undefined);
  assert.equal(normalized.find((tag) => tag.name === "C")?.parentName, undefined);
});

test("meta-tag status belongs only to the tag explicitly marked meta", () => {
  const hierarchy = normalizeTimelineTags([
    { name: "Metadata", color: "#000000", isMeta: true },
    { name: "Author", color: "#111111", parentName: "Metadata" },
  ]);

  assert.equal(isMetaTag(hierarchy, "Metadata"), true);
  assert.equal(isMetaTag(hierarchy, "Author"), false);
  assert.equal(
    isMetaTag(
      normalizeTimelineTags([
        ...hierarchy,
        { name: "Source", color: "#222222", parentName: "Metadata", isMeta: true },
      ]),
      "Source"
    ),
    true
  );
});

test("items follow the most recently changed tag position", () => {
  const belowHistory = setTimelineTagItemPosition(tags, "History", "below", 1);
  const aboveAncient = setTimelineTagItemPosition(belowHistory, "Ancient", "above", 2);

  assert.equal(getTagItemPosition(aboveAncient, ["History", "Ancient"]), "above");
  assert.equal(getTagItemPosition(aboveAncient, ["History"]), "below");
});

test("selecting a parent category includes items in nested categories", () => {
  const categorizedItems = [
    { ...initialItems[0], tags: ["Ancient"] },
    { ...initialItems[1], tags: ["Modern"] },
  ];

  assert.deepEqual(
    filterItemsByTags(categorizedItems, ["History"], tags),
    [categorizedItems[0]]
  );
});
