import assert from "node:assert/strict";
import test from "node:test";
import { initialItems } from "./data";
import {
  getDescendantIds,
  getLineageIds,
  getLineageLinks,
  pruneTeacherIds,
  getStudentLineageIds,
} from "./lineage";

const item = (id: number, teacherIds?: number[]) => ({
  ...initialItems[0],
  id,
  ...(teacherIds ? { teacherIds } : {}),
});
const byNumber = (first: number, second: number) => first - second;

// 1 teaches 2 and 4; 2 teaches 3; 5 is unrelated.
const items = [item(1), item(2, [1]), item(3, [2]), item(4, [1]), item(5)];

test("lineage covers teachers and students transitively but not siblings", () => {
  assert.deepEqual([...getLineageIds(items, 2)!].sort(byNumber), [1, 2, 3]);
  assert.deepEqual([...getLineageIds(items, 1)!].sort(byNumber), [1, 2, 3, 4]);
  assert.equal(getLineageIds(items, 5), null);
  assert.equal(getLineageIds(items, 99), null);
});

test("lineage links join each teacher to their student within the lineage", () => {
  assert.deepEqual(getLineageLinks(items, new Set([1, 2, 3])), [
    { teacherId: 1, studentId: 2 },
    { teacherId: 2, studentId: 3 },
  ]);
});

test("descendants exclude the item itself and its teachers", () => {
  assert.deepEqual([...getDescendantIds(items, 1)].sort(byNumber), [2, 3, 4]);
  assert.deepEqual([...getDescendantIds(items, 3)], []);
});

test("student lineage contains the clicked item and only its downstream students", () => {
  assert.deepEqual([...getStudentLineageIds(items, 2)!].sort(byNumber), [2, 3]);
  assert.deepEqual([...getStudentLineageIds(items, 1)!].sort(byNumber), [1, 2, 3, 4]);
  assert.equal(getStudentLineageIds(items, 3), null);
  assert.equal(getStudentLineageIds(items, 99), null);
});

test("circular teacher references still terminate", () => {
  const cycle = [item(1, [2]), item(2, [1])];

  assert.deepEqual([...getLineageIds(cycle, 1)!].sort(byNumber), [1, 2]);
});

test("pruning drops self, duplicate, and unknown teachers but keeps clean items", () => {
  const messy = [item(1, [1, 2, 2, 99]), item(2, [99]), items[0]];
  const pruned = pruneTeacherIds(messy);

  assert.deepEqual(pruned[0].teacherIds, [2]);
  assert.equal(pruned[1].teacherIds, undefined);
  assert.equal(pruned[2], messy[2]);
});

test("pruning keeps grand-teachers only among surviving teachers", () => {
  const pruned = pruneTeacherIds([
    item(1),
    { ...item(2, [1, 99]), grandTeacherIds: [1, 99, 5] },
    { ...item(3), grandTeacherIds: [1] },
  ]);

  assert.deepEqual(pruned[1].grandTeacherIds, [1]);
  assert.equal(pruned[2].grandTeacherIds, undefined);
});

test("lineage links flag grand-teacher relations", () => {
  const withGrand = [item(1), { ...item(2, [1]), grandTeacherIds: [1] }, item(3, [2])];

  assert.deepEqual(getLineageLinks(withGrand, new Set([1, 2, 3])), [
    { teacherId: 1, studentId: 2, grand: true },
    { teacherId: 2, studentId: 3 },
  ]);
});
