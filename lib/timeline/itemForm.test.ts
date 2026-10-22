import assert from "node:assert/strict";
import test from "node:test";
import { initialItems } from "./data";
import { buildItemDataWithTagPosition, itemToFormState } from "./itemForm";
import { initialItemFormState } from "./types";

test("an item survives a round trip through the form state", () => {
  for (const item of initialItems) {
    const { id, ...itemData } = item;
    void id;
    assert.deepEqual(buildItemDataWithTagPosition(itemToFormState(item), []), itemData);
  }
});

test("optional item fields become empty form strings", () => {
  const form = itemToFormState({ ...initialItems[0], fullName: undefined, works: undefined, teacherIds: undefined });

  assert.equal(form.fullName, "");
  assert.equal(form.works, "");
  assert.deepEqual(form.teacherIds, []);
});

test("the tag position overrides the form position", () => {
  const form = { ...itemToFormState(initialItems[0]), position: "above" as const, tags: ["Pinned"] };
  const tags = [{ name: "Pinned", color: "#fff", itemPosition: "below" as const, itemPositionUpdatedAt: 1 }];

  assert.equal(buildItemDataWithTagPosition(form, tags)?.position, "below");
  assert.equal(buildItemDataWithTagPosition(form, [])?.position, "above");
});

test("an invalid form produces no item data", () => {
  assert.equal(buildItemDataWithTagPosition(initialItemFormState, []), null);
});
