import assert from "node:assert/strict";
import test from "node:test";
import { initialItems } from "./data";
import { getItemDistance } from "./geometry";
import { getLineageBounds, getLineageRoutes, getLineageSegments, type LineageNode } from "./lineageRoutes";

const AXIS_Y = 500;

function node(
  id: number,
  side: "above" | "below",
  row: number,
  x: number,
  title = "Item"
): LineageNode {
  const distance = getItemDistance(row, 1);
  return {
    item: { ...initialItems[0], id, title, position: side },
    row,
    x,
    endX: x,
    y: side === "above" ? AXIS_Y - distance : AXIS_Y + distance,
  };
}

const route = (nodes: LineageNode[], links: [number, number][]) =>
  getLineageRoutes(
    nodes,
    links.map(([teacherId, studentId]) => ({ teacherId, studentId })),
    AXIS_Y,
    1
  );

// Nodes positioned the way Timeline.tsx does: x scales with zoom, row distance scales with zoom.
function zoomedNode(
  id: number,
  side: "above" | "below",
  row: number,
  year: number,
  zoom: number,
  title = "Item",
  endYear?: number
): LineageNode {
  const pixelsPerYear = 0.5;
  const distance = getItemDistance(row, zoom);
  const x = year * pixelsPerYear * zoom;
  return {
    item: {
      ...initialItems[endYear === undefined ? 0 : 1],
      id,
      title,
      position: side,
    },
    row,
    x,
    endX: endYear === undefined ? x : endYear * pixelsPerYear * zoom,
    y: side === "above" ? -distance : distance,
  };
}

const zoomSamples: {
  name: string;
  build: (zoom: number) => LineageNode[];
  links: [number, number][];
}[] = [
  {
    name: "chain on one side",
    build: (zoom) => [
      zoomedNode(1, "above", 0, 100, zoom),
      zoomedNode(2, "above", 1, 700, zoom),
      zoomedNode(3, "above", 0, 1300, zoom),
    ],
    links: [[1, 2], [2, 3]],
  },
  {
    name: "fan out across the axis",
    build: (zoom) => [
      zoomedNode(1, "above", 0, 100, zoom, "Teacher"),
      zoomedNode(2, "below", 0, 900, zoom),
      zoomedNode(3, "above", 1, 1200, zoom),
      zoomedNode(4, "below", 1, 1500, zoom),
    ],
    links: [[1, 2], [1, 3], [1, 4]],
  },
  {
    name: "periods with a blocker",
    build: (zoom) => [
      zoomedNode(1, "below", 0, 100, zoom, "Period", 800),
      zoomedNode(2, "below", 0, 1000, zoom, "Blocker"),
      zoomedNode(3, "below", 1, 1600, zoom),
      zoomedNode(4, "above", 0, 1100, zoom, "Student"),
    ],
    links: [[1, 3], [1, 4]],
  },
];

test("routes computed at zoom 1 scale to match routes at other zooms except arrow size", () => {
  for (const sample of zoomSamples) {
    const links = sample.links.map(([teacherId, studentId]) => ({ teacherId, studentId }));
    const base = getLineageRoutes(sample.build(1), links, 0, 1);

    for (const zoom of [0.25, 0.5, 2, 5]) {
      const actual = getLineageRoutes(sample.build(zoom), links, 0, zoom);
      assert.equal(actual.length, base.length, `${sample.name} @${zoom}`);
      actual.forEach((result, index) => {
        const expected = base[index];
        assert.equal(result.key, expected.key);
        result.points.forEach((point, pointIndex) => {
          assert.ok(Math.abs(point.x - expected.points[pointIndex].x * zoom) < 1e-6, `${sample.name} @${zoom} x`);
          assert.ok(Math.abs(point.y - expected.points[pointIndex].y * zoom) < 1e-6, `${sample.name} @${zoom} y`);
        });
        assert.equal(result.arrow.angle, expected.arrow.angle);
        assert.deepEqual(
          result.segments.map(({ opacity }) => opacity),
          expected.segments.map(({ opacity }) => opacity),
          `${sample.name} @${zoom} opacities`
        );
      });
    }
  }
});

test("arrow size has a 3px floor, so scaled zoom-1 routes would draw the wrong arrow at low zoom", () => {
  const links = [{ teacherId: 1, studentId: 2 }];
  const nodes = (zoom: number) => [
    zoomedNode(1, "above", 0, 100, zoom),
    zoomedNode(2, "below", 2, 1200, zoom),
  ];
  const [base] = getLineageRoutes(nodes(1), links, 0, 1);
  const [small] = getLineageRoutes(nodes(0.25), links, 0, 0.25);

  assert.equal(small.arrow.size, 3);
  assert.ok(Math.abs(small.arrow.size - base.arrow.size * 0.25) > 1);
});

test("connectors use only horizontal and vertical segments", () => {
  const [result] = route([node(1, "above", 1, 100), node(2, "below", 0, 600)], [[1, 2]]);

  result.points.slice(1).forEach((point, index) => {
    const previous = result.points[index];
    assert.ok(point.x === previous.x || point.y === previous.y);
  });
});

test("only the portion of a connector crossing text is translucent", () => {
  const segments = getLineageSegments(
    [{ x: 0, y: 10 }, { x: 10, y: 10 }],
    [{ left: 4, right: 6, top: 8, bottom: 12 }]
  );

  assert.deepEqual(segments.map(({ start, end, opacity }) => ({
    start: start.x,
    end: end.x,
    opacity,
  })), [
    { start: 0, end: 4, opacity: 0.9 },
    { start: 4, end: 6, opacity: 0.12 },
    { start: 6, end: 10, opacity: 0.9 },
  ]);
});

test("lineage bounds enclose all item boxes and routes with padding", () => {
  const nodes = [node(1, "above", 0, 100), node(2, "below", 1, 500)];
  const bounds = getLineageBounds(nodes, [{
    key: "1-2",
    teacherId: 1,
    studentId: 2,
    dashed: false,
    points: [{ x: 100, y: 50 }, { x: 700, y: 650 }],
    segments: [],
    arrow: { tip: { x: 700, y: 650 }, angle: 90, size: 5, opacity: 1 },
  }], 10);

  assert.deepEqual(bounds, { left: 57, right: 710, top: 40, bottom: 716 });
});

test("lineage bounds scale item extents with zoom", () => {
  const bounds = getLineageBounds([node(1, "above", 0, 100)], [], 20, 2);

  assert.deepEqual(bounds, { left: 14, right: 186, top: 348, bottom: 452 });
});

test("lineage bounds start left of the teacher and center vertically on them", () => {
  const nodes = [node(1, "above", 0, 100), node(2, "below", 1, 500)];
  const bounds = getLineageBounds(nodes, [{
    key: "1-2",
    teacherId: 1,
    studentId: 2,
    dashed: false,
    points: [{ x: 100, y: 50 }, { x: 700, y: 650 }],
    segments: [],
    arrow: { tip: { x: 700, y: 650 }, angle: 90, size: 5, opacity: 1 },
  }], 10, 1, 400);

  assert.deepEqual(bounds, { left: 57, right: 710, top: 40, bottom: 760 });
  assert.ok(bounds!.left < 100);
  assert.equal((bounds!.top + bounds!.bottom) / 2, 400);
});

test("only grand-teacher links produce dashed routes with otherwise identical geometry", () => {
  const nodes = [node(1, "above", 0, 100), node(2, "above", 0, 400), node(3, "above", 0, 600)];
  const plain = getLineageRoutes(nodes, [{ teacherId: 1, studentId: 3 }], AXIS_Y, 1)[0];
  const [solid, dotted] = getLineageRoutes(
    nodes,
    [{ teacherId: 1, studentId: 2 }, { teacherId: 1, studentId: 3, grand: true }],
    AXIS_Y,
    1
  );

  assert.equal(solid.dashed, false);
  assert.equal(dotted.dashed, true);
  assert.equal(plain.dashed, false);
  assert.deepEqual(plain.points.at(-1), dotted.points.at(-1));
});

test("a connector between neighbours runs through the empty gap beside the axis", () => {
  const [result] = route([node(1, "above", 0, 100), node(2, "above", 0, 400)], [[1, 2]]);
  const channelY = result.points[2].y;

  assert.equal(result.points[3].y, channelY);
  assert.ok(channelY > result.points[0].y && channelY < AXIS_Y);
});

test("a blocked route to a lower student does not initially go upward", () => {
  const teacher = node(1, "below", 0, 100);
  const blockers = [
    node(3, "below", 0, 250),
    { ...node(4, "below", 0, 350), y: 650 },
  ];
  const student = node(2, "below", 1, 600);
  const [result] = route([teacher, ...blockers, student], [[1, 2]]);
  const verticalChanges = result.points.slice(1).map((point, index) =>
    point.y - result.points[index].y
  ).filter((change) => change !== 0);

  assert.ok(verticalChanges.length > 0);
  assert.ok(verticalChanges.every((change) => change > 0));
});

test("connectors start at the right edge of the teacher's box on its centre line", () => {
  const event = node(1, "above", 0, 100);
  const period = {
    ...node(1, "below", 0, 100),
    item: { ...initialItems[1], id: 1, position: "below" as const, title: "P" },
    endX: 300,
  };
  const [fromEvent] = route([event, node(2, "above", 0, 600)], [[1, 2]]);
  const [fromPeriod] = route([period, node(2, "below", 0, 600)], [[1, 2]]);

  // Event label "Item" is 4 * 11 + 22 wide, so its right edge is 33 past the centre.
  assert.deepEqual(fromEvent.points[0], { x: 133, y: event.y });
  assert.deepEqual(fromPeriod.points[0], { x: 300, y: period.y });
  [fromEvent, fromPeriod].forEach((result) => {
    assert.equal(result.points[1].y, result.points[0].y);
    assert.ok(result.points[1].x > result.points[0].x);
  });
});

test("connectors between opposite sides cross the axis", () => {
  const [result] = route([node(1, "above", 0, 100), node(2, "below", 0, 400)], [[1, 2]]);
  const ys = result.points.map((point) => point.y);

  assert.ok(Math.min(...ys) < AXIS_Y && Math.max(...ys) > AXIS_Y);
});

test("connectors sharing a gap are kept on separate lanes", () => {
  const nodes = [
    node(1, "above", 0, 100),
    node(2, "above", 0, 400),
    node(3, "above", 0, 250),
    node(4, "above", 0, 600),
  ];
  const [first, second] = route(nodes, [[1, 2], [3, 4]]);

  assert.notEqual(first.points[2].y, second.points[2].y);
});

test("overlapping routes from the same attachment point share a lane", () => {
  const nodes = [
    node(1, "above", 0, 100),
    node(2, "above", 0, 400),
    node(3, "above", 0, 600),
  ];
  const [first, second] = route(nodes, [[1, 2], [1, 3]]);

  assert.deepEqual(first.points[0], second.points[0]);
  assert.equal(first.points[2].y, second.points[2].y);
});

test("overlapping routes to the same attachment point share a lane", () => {
  const nodes = [
    node(1, "above", 0, 100),
    node(2, "above", 0, 250),
    node(3, "above", 0, 600),
  ];
  const [first, second] = route(nodes, [[1, 3], [2, 3]]);

  assert.deepEqual(first.arrow.tip, second.arrow.tip);
  assert.equal(first.points[2].y, second.points[2].y);
});

test("a teacher's student and grandstudent branches use separate vertical bends", () => {
  const nodes = [
    node(1, "above", 0, 100),
    node(2, "above", 0, 400),
    node(3, "above", 0, 600),
  ];
  const routes = route(nodes, [[1, 2], [2, 3], [1, 3]]);
  const toStudent = routes.find(({ key }) => key === "1-2")!;
  const toGrandstudent = routes.find(({ key }) => key === "1-3")!;

  assert.notEqual(toStudent.points[2].x, toGrandstudent.points[2].x);
});

test("the arrow tip sits on the student's box edge and points into it", () => {
  const [above] = route([node(1, "above", 0, 100), node(2, "above", 0, 400)], [[1, 2]]);
  const [below] = route([node(1, "below", 0, 100), node(2, "below", 0, 400)], [[1, 2]]);

  assert.equal(above.teacherId, 1);
  assert.equal(above.studentId, 2);
  assert.deepEqual(above.arrow.tip, above.points[4]);
  assert.equal(above.arrow.angle, -90);
  assert.equal(below.arrow.angle, 90);
});

test("a connector may enter any point along the student's top or bottom side", () => {
  const student = {
    ...node(2, "above", 0, 120),
    item: { ...initialItems[1], id: 2, position: "above" as const, title: "S" },
    endX: 400,
  };
  // The teacher sits in a farther row, directly above the student's bar.
  const [result] = route([node(1, "above", 1, 110), student], [[1, 2]]);
  const [, turn] = result.points;
  const tip = result.points[result.points.length - 1];

  assert.equal(tip.x, turn.x);
  assert.ok(tip.y < student.y);
  assert.equal(result.arrow.angle, 90);
});

test("a detoured connection from a lower teacher enters the student's bottom edge", () => {
  const teacher = node(1, "below", 1, 600);
  const student = {
    ...node(2, "below", 0, 100),
    item: { ...initialItems[1], id: 2, position: "below" as const, title: "Student" },
    endX: 400,
  };
  const [result] = route([teacher, student], [[1, 2]]);

  assert.equal(result.arrow.tip.y, student.y + 10);
});

test("a route can cross the student's title for a shorter translucent connection", () => {
  const teacher = node(1, "above", 3, 100);
  const student = {
    ...node(2, "above", 1, 100),
    item: { ...initialItems[1], id: 2, position: "above" as const, title: "Student" },
    endX: 800,
  };
  const [result] = route([teacher, student], [[1, 2]]);
  const titleLeft = student.x + 10;
  const titleRight = titleLeft + "Student".length * 11;

  assert.ok(result.arrow.tip.x > titleLeft && result.arrow.tip.x < titleRight);
  assert.equal(result.arrow.opacity, 1);
  assert.ok(result.segments.some(({ start, end, opacity }) =>
    start.x === result.arrow.tip.x && end.x === result.arrow.tip.x && opacity === 0.12
  ));
});

test("a connector slides along the student's side to avoid an item in the way", () => {
  const student = {
    ...node(2, "above", 1, 150),
    item: { ...initialItems[1], id: 2, position: "above" as const, title: "S" },
    endX: 600,
  };
  const nodes = [node(1, "above", 0, 100), student, node(3, "above", 0, 158, "I")];
  const [result] = route(nodes, [[1, 2]]);
  const blockerLeft = 158 - 33 / 2;
  const blockerRight = 158 + 33 / 2;
  const entryX = result.points[result.points.length - 1].x;

  assert.ok(entryX <= blockerLeft || entryX >= blockerRight);
});

test("links to items outside the lineage are skipped", () => {
  assert.deepEqual(route([node(1, "above", 0, 100)], [[1, 2]]), []);
});
