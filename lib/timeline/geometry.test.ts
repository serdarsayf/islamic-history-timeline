import assert from "node:assert/strict";
import test from "node:test";
import {
  getItemDistance,
  getItemRows,
  getItemRowsAroundLineage,
  getLineageClearanceRows,
  haveSameItemLayout,
  isItemInRenderRange,
  optimizeLineageRows,
  scoreLineageRows,
} from "./geometry";
import type { TimelineItem } from "./types";
import { dateToNumber } from "../timeline";

function cullItem(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: 1,
    type: "event",
    title: "Fifteen chars!!",
    description: "",
    color: "#fff",
    textColor: "#000",
    tags: [],
    startDate: { year: 1000, era: "CE" },
    position: "above",
    ...overrides,
  };
}

test("item layout comparison ignores colour and description but not layout or lineage fields", () => {
  const base = cullItem({ teacherIds: [2], grandTeacherIds: [3] });
  const recoloured = { ...base, color: "#000", textColor: "#111", description: "changed", title: "Fifteen chars??" };

  assert.equal(haveSameItemLayout([base], [recoloured]), true);
  assert.equal(haveSameItemLayout([base], [{ ...base, title: "Longer title here" }]), false);
  assert.equal(haveSameItemLayout([base], [{ ...base, position: "below" }]), false);
  assert.equal(haveSameItemLayout([base], [{ ...base, startDate: { year: 1001, era: "CE" } }]), false);
  assert.equal(haveSameItemLayout([base], [{ ...base, teacherIds: [4] }]), false);
  assert.equal(haveSameItemLayout([base], [{ ...base, teacherIds: [4] }], false), true);
  assert.equal(haveSameItemLayout([base], [base, base]), false);
});

test("render range includes an event just outside the years whose label reaches the viewport", () => {
  // At 0.5 px/year and zoom 5 the 15-character label has a half-width of about 470 px.
  const viewStart = dateToNumber({ year: 1, era: "CE" });
  const item = cullItem({ startDate: { year: 1250, era: "CE" } });

  assert.equal(isItemInRenderRange(viewStart, viewStart + 999, 0.5, 5, item), true);
});

test("render range excludes an event far outside the viewport", () => {
  const item = cullItem({ startDate: { year: 9000, era: "CE" } });

  assert.equal(isItemInRenderRange(1, 1000, 0.5, 5, item), false);
});

test("render range includes a short period ending left of the viewport whose title reaches into view", () => {
  const item = cullItem({
    type: "period",
    title: "A very long period title",
    startDate: { year: 100, era: "CE" },
    endDate: { year: 110, era: "CE" },
  });
  const viewStart = dateToNumber({ year: 1000, era: "CE" });

  assert.equal(isItemInRenderRange(viewStart, viewStart + 1000, 4, 1, item), false);
  assert.equal(isItemInRenderRange(viewStart, viewStart + 1000, 0.25, 1, item), true);
});

test("render range matches the old year-buffer filter at 4 px/year and zoom 1", () => {
  const viewStart = dateToNumber({ year: 1000, era: "CE" });
  const viewEnd = viewStart + 400;
  const oldFilter = (item: TimelineItem) => {
    const start = dateToNumber(item.startDate);
    const end = item.endDate ? dateToNumber(item.endDate) : start;
    return end >= viewStart - 100 && start <= viewEnd + 100;
  };
  const candidates = [
    cullItem({ title: "Battle", startDate: { year: 1200, era: "CE" } }),
    cullItem({ title: "Treaty", startDate: { year: 1010, era: "CE" } }),
    cullItem({ title: "Founding", startDate: { year: 3000, era: "CE" } }),
    cullItem({ title: "Empire", type: "period", startDate: { year: 1100, era: "CE" }, endDate: { year: 1300, era: "CE" } }),
    cullItem({ title: "Dynasty", type: "period", startDate: { year: 2000, era: "CE" }, endDate: { year: 2200, era: "CE" } }),
  ];

  for (const item of candidates) {
    assert.equal(isItemInRenderRange(viewStart, viewEnd, 4, 1, item), oldFilter(item), item.title);
  }
});

const items: TimelineItem[] = [
  {
    id: 1,
    type: "event",
    title: "A",
    description: "",
    color: "#000000",
    textColor: "#ffffff",
    tags: [],
    startDate: { year: 1, era: "CE" },
    position: "above",
  },
  {
    id: 2,
    type: "event",
    title: "B",
    description: "",
    color: "#000000",
    textColor: "#ffffff",
    tags: [],
    startDate: { year: 11, era: "CE" },
    position: "above",
  },
  {
    id: 3,
    type: "event",
    title: "C",
    description: "",
    color: "#000000",
    textColor: "#ffffff",
    tags: [],
    startDate: { year: 21, era: "CE" },
    position: "above",
  },
];

test("item rows reflow with year spacing", () => {
  assert.deepEqual(
    [...getItemRows(items, 1).values()],
    [0, 1, 2]
  );
  assert.deepEqual(
    [...getItemRows(items, 100).values()],
    [0, 0, 0]
  );
});

test("item row distances scale proportionally with zoom", () => {
  const baseDistance = getItemDistance(2, 1);

  assert.equal(getItemDistance(2, 0.25), baseDistance * 0.25);
  assert.equal(getItemDistance(2, 5), baseDistance * 5);
});

test("non-overlapping item bounds share a row regardless of input order", () => {
  const period: TimelineItem = {
    ...items[0],
    id: 4,
    type: "period",
    title: "Period",
    startDate: { year: 10, era: "CE" },
    endDate: { year: 20, era: "CE" },
  };
  const event: TimelineItem = {
    ...items[1],
    id: 5,
    title: "Event",
    startDate: { year: 130, era: "CE" },
  };
  const rows = getItemRows([event, period], 1);

  assert.equal(rows.get(period.id), 0);
  assert.equal(rows.get(event.id), 0);
});

test("overlapping visible item bounds occupy separate rows", () => {
  const period: TimelineItem = {
    ...items[0],
    id: 4,
    type: "period",
    title: "Period",
    startDate: { year: 10, era: "CE" },
    endDate: { year: 20, era: "CE" },
  };
  const event: TimelineItem = {
    ...items[1],
    id: 5,
    title: "Event",
    startDate: { year: 30, era: "CE" },
  };
  const rows = getItemRows([period, event], 1);

  assert.notEqual(rows.get(period.id), rows.get(event.id));
});

test("priority items take the rows nearest the axis and others move beyond them", () => {
  const spread = items.map((item, index) => ({
    ...item,
    id: index + 1,
    startDate: { year: 1 + index * 1000, era: "CE" as const },
  }));
  const unprioritized = getItemRows(spread, 1);
  const prioritized = getItemRows(spread, 1, new Set([3]));

  assert.deepEqual([...unprioritized.values()], [0, 0, 0]);
  assert.equal(prioritized.get(3), 0);
  assert.equal(prioritized.get(1), 1);
  assert.equal(prioritized.get(2), 1);
});

test("a student far from its teacher's row is pulled onto it when nothing blocks", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 1, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 500, era: "CE" as const } },
  ];
  const rows = optimizeLineageRows(
    lineage, 1, new Map([[1, 2], [2, 5]]), new Set([1, 2]), [{ teacherId: 1, studentId: 2 }], 1, new Set([1])
  );

  assert.equal(rows.get(1), 2);
  assert.equal(rows.get(2), 2);
});

test("students that collide gather on the rows nearest their teacher", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 1, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 500, era: "CE" as const } },
    { ...items[2], id: 3, startDate: { year: 500, era: "CE" as const } },
  ];
  const rows = optimizeLineageRows(
    lineage,
    1,
    new Map([[1, 2], [2, 6], [3, 7]]),
    new Set([1, 2, 3]),
    [{ teacherId: 1, studentId: 2 }, { teacherId: 1, studentId: 3 }],
    1,
    new Set([1])
  );

  assert.equal(rows.get(1), 2);
  assert.deepEqual([rows.get(2), rows.get(3)].sort(), [1, 2]);
});

test("a student on the other side of the axis moves toward the axis", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 1, era: "CE" as const } },
    { ...items[1], id: 2, position: "below" as const, startDate: { year: 500, era: "CE" as const } },
  ];
  const rows = optimizeLineageRows(
    lineage, 1, new Map([[1, 4], [2, 6]]), new Set([1, 2]), [{ teacherId: 1, studentId: 2 }], 1
  );

  assert.equal(rows.get(1), 4);
  assert.equal(rows.get(2), 0);
});

test("a student behind its teacher is not placed on the teacher's own row", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 500, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 1, era: "CE" as const } },
  ];
  const rows = optimizeLineageRows(
    lineage, 1, new Map([[1, 3], [2, 6]]), new Set([1, 2]), [{ teacherId: 1, studentId: 2 }], 1
  );

  assert.equal(Math.abs(rows.get(2)! - rows.get(1)!), 1);
});

test("same-row backward links count as reversals", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 500, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 1, era: "CE" as const } },
  ];
  const links = [{ teacherId: 1, studentId: 2 }];
  const score = (studentRow: number) =>
    scoreLineageRows(lineage, 1, new Map([[1, 2], [2, studentRow]]), new Set([1, 2]), links);

  assert.equal(score(2).reversals, 1);
  assert.equal(score(3).reversals, 0);
});

test("unrelated connectors with close, overlapping vertical runs score as crowded", () => {
  const pair = (offset: number) => [
    { ...items[0], id: 1, startDate: { year: 100, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 110, era: "CE" as const } },
    { ...items[0], id: 3, startDate: { year: 105 + offset, era: "CE" as const } },
    { ...items[1], id: 4, startDate: { year: 115 + offset, era: "CE" as const } },
  ];
  const links = [{ teacherId: 1, studentId: 2 }, { teacherId: 3, studentId: 4 }];
  const rows = new Map([[1, 0], [2, 3], [3, 1], [4, 4]]);
  const ids = new Set([1, 2, 3, 4]);

  assert.ok(scoreLineageRows(pair(0), 1, rows, ids, links).crowding > 100);
  assert.equal(scoreLineageRows(pair(500), 1, rows, ids, links).crowding, 0);
});

test("connectors that share a box are never counted as crowded", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 100, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 110, era: "CE" as const } },
    { ...items[2], id: 3, startDate: { year: 112, era: "CE" as const } },
  ];
  const score = scoreLineageRows(
    lineage,
    1,
    new Map([[1, 0], [2, 3], [3, 4]]),
    new Set([1, 2, 3]),
    [{ teacherId: 1, studentId: 2 }, { teacherId: 1, studentId: 3 }]
  );

  assert.equal(score.crowding, 0);
});

test("optimizing lineage rows never worsens the combined score", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 100, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 110, era: "CE" as const } },
    { ...items[0], id: 3, startDate: { year: 105, era: "CE" as const } },
    { ...items[1], id: 4, startDate: { year: 115, era: "CE" as const } },
  ];
  const links = [{ teacherId: 1, studentId: 2 }, { teacherId: 3, studentId: 4 }];
  const ids = new Set([1, 2, 3, 4]);
  const teachers = new Set([1, 3]);
  const start = new Map([[1, 0], [2, 3], [3, 1], [4, 4]]);
  const optimized = optimizeLineageRows(lineage, 1, start, ids, links, 1, teachers);

  assert.ok(
    scoreLineageRows(lineage, 1, optimized, ids, links, teachers).total <=
      scoreLineageRows(lineage, 1, start, ids, links, teachers).total
  );
  assert.equal(optimized.get(1), 0);
});

test("a box with more lines gets the row nearest its teacher over a box with one line", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 1, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 499, era: "CE" as const } },
    { ...items[2], id: 3, startDate: { year: 500, era: "CE" as const } },
    { ...items[0], id: 4, startDate: { year: 900, era: "CE" as const } },
    { ...items[1], id: 5, startDate: { year: 1300, era: "CE" as const } },
  ];
  const rows = optimizeLineageRows(
    lineage,
    1,
    new Map([[1, 2], [2, 6], [3, 5], [4, 6], [5, 7]]),
    new Set([1, 2, 3, 4, 5]),
    [
      { teacherId: 1, studentId: 2 },
      { teacherId: 1, studentId: 3 },
      { teacherId: 3, studentId: 4 },
      { teacherId: 3, studentId: 5 },
    ],
    1,
    new Set([1, 3])
  );

  assert.equal(rows.get(3), rows.get(1));
  assert.equal(Math.abs(rows.get(2)! - rows.get(1)!), 1);
});

test("lineage members that collide are never placed on the same row", () => {
  const lineage = [
    { ...items[0], id: 1, startDate: { year: 1, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 20, era: "CE" as const } },
    { ...items[2], id: 3, startDate: { year: 20, era: "CE" as const } },
  ];
  const rows = optimizeLineageRows(
    lineage,
    1,
    new Map([[1, 0], [2, 1], [3, 2]]),
    new Set([1, 2, 3]),
    [{ teacherId: 1, studentId: 2 }, { teacherId: 1, studentId: 3 }],
    1,
    new Set([1])
  );

  assert.equal(new Set([rows.get(1), rows.get(2), rows.get(3)]).size, 3);
});

test("lineage members pack into the nearest free rows around the pinned teacher", () => {
  const overlapping = [...items, ...items.slice(0, 2)].map((item, index) => ({
    ...item,
    id: index + 1,
    startDate: { year: 100, era: "CE" as const },
  }));
  const originalRows = getItemRows(overlapping, 1);
  const priorityIds = new Set([1, 3, 4]);
  const rows = getItemRows(overlapping, 1, priorityIds, { id: 3, row: originalRows.get(3)! });

  assert.equal(originalRows.get(3), 2);
  assert.equal(rows.get(3), 2);
  assert.equal(rows.get(1), 1);
  assert.equal(rows.get(4), 3);
});

test("lineage students pack around the pinned start and only corridor intruders move", () => {
  const spread = [
    { ...items[0], id: 1, startDate: { year: 1, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 11, era: "CE" as const } },
    { ...items[2], id: 3, startDate: { year: 21, era: "CE" as const } },
    { ...items[0], id: 4, startDate: { year: 100, era: "BC" as const } },
    { ...items[1], id: 5, startDate: { year: 2000, era: "CE" as const } },
  ];
  const originalRows = getItemRows(spread, 1);
  const lineageIds = new Set([1, 3]);
  const lineageRows = getItemRows(spread, 1, lineageIds, { id: 1, row: originalRows.get(1)! });
  const rearranged = getItemRowsAroundLineage(
    spread,
    1,
    originalRows,
    lineageRows,
    lineageIds,
    { start: 0, end: 30 },
    { above: { min: 0, max: 3 }, below: null }
  );

  assert.equal(rearranged.get(1), originalRows.get(1));
  assert.ok(lineageRows.get(3)! < originalRows.get(3)!);
  assert.equal(rearranged.get(3), lineageRows.get(3));
  assert.ok(rearranged.get(2)! > 3);
  assert.equal(rearranged.get(4), originalRows.get(4));
  assert.equal(rearranged.get(5), originalRows.get(5));
});

test("a student starting just right of its teacher moves off the teacher's row", () => {
  const nearby = [
    { ...items[0], id: 1, startDate: { year: 1, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 54, era: "CE" as const } },
  ];
  const withoutClearance = getItemRows(nearby, 1, new Set([1, 2]));
  const withClearance = getItemRows(nearby, 1, new Set([1, 2]), undefined, new Set([1]));

  assert.equal(withoutClearance.get(2), withoutClearance.get(1));
  assert.notEqual(withClearance.get(2), withClearance.get(1));
});

test("outside boxes just right of a teacher leave the teacher's connector run clear", () => {
  const nearby = [
    { ...items[0], id: 1, startDate: { year: 1, era: "CE" as const } },
    { ...items[1], id: 2, startDate: { year: 54, era: "CE" as const } },
  ];
  const originalRows = getItemRows(nearby, 1);
  const lineageRows = new Map([[1, originalRows.get(1)!]]);
  const noBands = { above: null, below: null };
  const unchanged = getItemRowsAroundLineage(
    nearby, 1, originalRows, lineageRows, new Set([1]), null, noBands
  );
  const cleared = getItemRowsAroundLineage(
    nearby, 1, originalRows, lineageRows, new Set([1]), null, noBands, new Set([1])
  );

  assert.equal(unchanged.get(2), unchanged.get(1));
  assert.notEqual(cleared.get(2), cleared.get(1));
});

test("lineage frame clearance covers every row intersecting its vertical span", () => {
  assert.deepEqual(
    getLineageClearanceRows({ top: 0, bottom: 800 }, 500, 1),
    { above: { min: 0, max: 4 }, below: { min: 0, max: 2 } }
  );
  assert.deepEqual(
    getLineageClearanceRows({ top: 200, bottom: 600 }, 500, 2),
    { above: { min: 0, max: 1 }, below: null }
  );
});

test("frame collisions can move to available rows above or below the frame", () => {
  const spread = items.map((item, index) => ({
    ...item,
    id: index + 1,
    startDate: { year: 100, era: "CE" as const },
  }));
  const rows = getItemRows(spread, 1);
  const lineageIds = new Set([1]);
  const lineageRows = new Map([[1, 2]]);
  const rearranged = getItemRowsAroundLineage(
    spread,
    1,
    rows,
    lineageRows,
    lineageIds,
    { start: 0, end: 200 },
    { above: { min: 1, max: 2 }, below: null }
  );

  assert.equal(rearranged.get(1), 2);
  assert.equal(rearranged.get(2), 0);
  assert.equal(rearranged.get(3), 3);
});