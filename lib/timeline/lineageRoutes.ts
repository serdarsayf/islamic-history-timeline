import { getItemDistance } from "./geometry";
import type { TimelineItem } from "./types";

type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };
type Side = TimelineItem["position"];
export type LineageBounds = Rect;

export type LineageNode = {
  item: TimelineItem;
  row: number;
  x: number;
  endX: number;
  y: number;
};

export type LineageRoute = {
  key: string;
  teacherId: number;
  studentId: number;
  dashed: boolean;
  points: Point[];
  segments: { start: Point; end: Point; opacity: number }[];
  arrow: { tip: Point; angle: number; size: number; opacity: number };
};

export function getLineageBounds(
  nodes: LineageNode[],
  routes: LineageRoute[],
  padding = 12,
  zoom = 1,
  centerY?: number
): LineageBounds | null {
  const rects = nodes.flatMap((node) => getRects(node, zoom));
  const points = routes.flatMap((route) => route.points);
  const left = Math.min(...rects.map((rect) => rect.left), ...points.map((point) => point.x));
  const right = Math.max(...rects.map((rect) => rect.right), ...points.map((point) => point.x));
  const top = Math.min(...rects.map((rect) => rect.top), ...points.map((point) => point.y));
  const bottom = Math.max(...rects.map((rect) => rect.bottom), ...points.map((point) => point.y));

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }

  const verticalPadding = Number.isFinite(centerY)
    ? Math.max(centerY! - top, bottom - centerY!) + padding
    : undefined;

  return {
    left: left - padding,
    right: right + padding,
    top: verticalPadding === undefined ? top - padding : centerY! - verticalPadding,
    bottom: verticalPadding === undefined ? bottom + padding : centerY! + verticalPadding,
  };
}

// Mirrors the 11px-per-character label width estimate used for row packing.
const CHARACTER_WIDTH = 11;

function getRects({ item, x, endX, y }: LineageNode, zoom: number): Rect[] {
  const textWidth = item.title.length * CHARACTER_WIDTH * zoom;

  if (item.type === "event") {
    const half = (textWidth + 22 * zoom) / 2;
    return [{ left: x - half, right: x + half, top: y - 16 * zoom, bottom: y + 16 * zoom }];
  }

  const titleTop = item.position === "above" ? y - 38 * zoom : y + 25 * zoom;
  return [
    { left: x, right: endX, top: y - 10 * zoom, bottom: y + 10 * zoom },
    { left: x + 10 * zoom, right: x + 10 * zoom + textWidth, top: titleTop, bottom: titleTop + 24 * zoom },
  ];
}

function getTextRects(node: LineageNode, zoom: number): Rect[] {
  const rects = getRects(node, zoom);
  return node.item.type === "event" ? rects : rects.slice(1);
}

export function getLineageSegments(points: Point[], textRects: Rect[]) {
  return points.slice(1).flatMap((end, index) => {
    const start = points[index];
    const horizontal = start.y === end.y;
    const vertical = start.x === end.x;
    if (!horizontal && !vertical) {
      return [{ start, end, opacity: 0.9 }];
    }

    const startValue = horizontal ? start.x : start.y;
    const endValue = horizontal ? end.x : end.y;
    const low = Math.min(startValue, endValue);
    const high = Math.max(startValue, endValue);
    const fixedValue = horizontal ? start.y : start.x;
    const boundaries = new Set([startValue, endValue]);

    textRects.forEach((rect) => {
      const fixedLow = horizontal ? rect.top : rect.left;
      const fixedHigh = horizontal ? rect.bottom : rect.right;
      const rangeLow = horizontal ? rect.left : rect.top;
      const rangeHigh = horizontal ? rect.right : rect.bottom;
      if (fixedValue < fixedLow || fixedValue > fixedHigh) return;
      const overlapLow = Math.max(low, rangeLow);
      const overlapHigh = Math.min(high, rangeHigh);
      if (overlapLow < overlapHigh) {
        boundaries.add(overlapLow);
        boundaries.add(overlapHigh);
      }
    });

    const ordered = [...boundaries].sort((first, second) => first - second);
    if (endValue < startValue) ordered.reverse();

    return ordered.slice(1).map((value, boundaryIndex) => {
      const previousValue = ordered[boundaryIndex];
      const midpoint = (previousValue + value) / 2;
      const overlapsText = textRects.some((rect) => {
        const fixedLow = horizontal ? rect.top : rect.left;
        const fixedHigh = horizontal ? rect.bottom : rect.right;
        const rangeLow = horizontal ? rect.left : rect.top;
        const rangeHigh = horizontal ? rect.right : rect.bottom;
        return fixedValue > fixedLow && fixedValue < fixedHigh && midpoint > rangeLow && midpoint < rangeHigh;
      });
      const pointAt = (coordinate: number): Point => horizontal
        ? { x: coordinate, y: fixedValue }
        : { x: fixedValue, y: coordinate };

      return {
        start: pointAt(previousValue),
        end: pointAt(value),
        opacity: overlapsText ? 0.12 : 0.9,
      };
    });
  });
}

// The edge of the box that faces the timeline axis, where connectors attach.
function getEdgeY(node: LineageNode, zoom: number) {
  const half = node.item.type === "event" ? 16 * zoom : 10 * zoom;
  return node.item.position === "above" ? node.y + half : node.y - half;
}

function getFarEdgeY(node: LineageNode, zoom: number) {
  const half = node.item.type === "event" ? 16 * zoom : 10 * zoom;
  return node.item.position === "above" ? node.y - half : node.y + half;
}

// Where along a box's top or bottom side a connector may land, if anywhere.
function getEntryRange(node: LineageNode, zoom: number) {
  const rects = getRects(node, zoom);
  const bar = rects[0];
  const margin = Math.min(8 * zoom, (bar.right - bar.left) / 4);
  const left = bar.left + margin;
  const right = bar.right - margin;

  return left < right ? { left, right } : null;
}

// Centre of the empty band on the axis side of a row.
function getGapY(side: Side, gap: number, axisY: number, zoom: number) {
  const distance = getItemDistance(gap, zoom) - (side === "above" ? 34 : 28) * zoom;
  return side === "above" ? axisY - distance : axisY + distance;
}

function countHits(
  x: number,
  fromY: number,
  toY: number,
  rectsById: Map<number, Rect[]>,
  ignoredIds: number[]
) {
  return countSegmentHits(x, fromY, x, toY, rectsById, ignoredIds);
}

function countSegmentHits(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rectsById: Map<number, Rect[]>,
  ignoredIds: number[]
) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  let hits = 0;

  rectsById.forEach((rects, id) => {
    if (ignoredIds.includes(id)) return;
    if (rects.some((rect) => right > rect.left && left < rect.right && bottom > rect.top && top < rect.bottom)) {
      hits += 1;
    }
  });

  return hits;
}

// Finds a short stub off the teacher's right edge that is clear of neighbouring items.
function pickStubX(
  start: Point,
  channelY: number,
  zoom: number,
  rectsById: Map<number, Rect[]>,
  ignoredIds: number[],
  excludedXs: number[] = []
) {
  let best = { x: start.x + 10 * zoom, hits: Infinity };

  for (const offset of [10, 16, 22, 30, 40, 50, 60, 75, 90]) {
    const x = start.x + offset * zoom;
    if (excludedXs.includes(x)) continue;
    const hits =
      countSegmentHits(start.x, start.y, x, start.y, rectsById, ignoredIds) +
      countSegmentHits(x, start.y, x, channelY, rectsById, ignoredIds);
    if (hits < best.hits) best = { x, hits };
    if (hits === 0) break;
  }

  return best;
}

// Prefers the base x, but slides along the box to avoid crossing other items.
function pickX(
  baseX: number,
  range: { left: number; right: number },
  fromY: number,
  toY: number,
  rectsById: Map<number, Rect[]>,
  ignoredIds: number[]
) {
  const candidates = [baseX, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
    (step) => range.left + ((range.right - range.left) * step) / 10
  )].sort((first, second) => Math.abs(first - baseX) - Math.abs(second - baseX));

  let best = { x: baseX, hits: Infinity };
  for (const x of candidates) {
    const hits = countHits(x, fromY, toY, rectsById, ignoredIds);
    if (hits < best.hits) best = { x, hits };
    if (hits === 0) break;
  }

  return best;
}

type PlannedRoute = {
  key: string;
  teacherId: number;
  studentId: number;
  channel: string;
  side: Side;
  gapY: number;
  start: Point;
  stubX: number;
  studentX: number;
  studentEdgeY: number;
  direct?: boolean;
};

function isDescendant(ancestorId: number, descendantId: number, studentsByTeacher: Map<number, number[]>) {
  const pending = [...(studentsByTeacher.get(ancestorId) ?? [])];
  const visited = new Set<number>();

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === descendantId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(studentsByTeacher.get(current) ?? []));
  }

  return false;
}

function areRelatedStudents(firstId: number, secondId: number, studentsByTeacher: Map<number, number[]>) {
  return firstId !== secondId && (
    isDescendant(firstId, secondId, studentsByTeacher) ||
    isDescendant(secondId, firstId, studentsByTeacher)
  );
}

export function getLineageRoutes(
  nodes: LineageNode[],
  links: { teacherId: number; studentId: number; grand?: boolean }[],
  axisY: number,
  zoom: number
): LineageRoute[] {
  const nodesById = new Map(nodes.map((node) => [node.item.id, node]));
  const rectsById = new Map(nodes.map((node) => [node.item.id, getRects(node, zoom)]));
  const textRects = nodes.flatMap((node) => getTextRects(node, zoom));
  const grandLinkKeys = new Set(
    links.filter(({ grand }) => grand).map(({ teacherId, studentId }) => `${teacherId}-${studentId}`)
  );
  const studentsByTeacher = new Map<number, number[]>();
  links.forEach(({ teacherId, studentId }) => {
    studentsByTeacher.set(teacherId, [...(studentsByTeacher.get(teacherId) ?? []), studentId]);
  });
  const planned: PlannedRoute[] = [];

  links.forEach(({ teacherId, studentId }) => {
    const teacher = nodesById.get(teacherId);
    const student = nodesById.get(studentId);
    if (!teacher || !student) return;

    const teacherBar = rectsById.get(teacherId)![0];
    // Connectors always leave a teacher from the right.
    const start = { x: teacherBar.right, y: teacher.y };
    const routeRectsById = new Map(rectsById);
    routeRectsById.set(studentId, rectsById.get(studentId)!.slice(0, 1));
    const studentBar = rectsById.get(studentId)![0];
    const preferredStudentEdgeY = start.y < studentBar.top
      ? studentBar.top
      : start.y > studentBar.bottom
        ? studentBar.bottom
        : null;
    const studentDirection = Math.sign(student.y - start.y);
    const sameSide = teacher.item.position === student.item.position;
    const sides = sameSide ? [teacher.item.position] : [teacher.item.position, student.item.position];
    const relatedRoutes = planned.filter((route) =>
      route.teacherId === teacherId && areRelatedStudents(route.studentId, studentId, studentsByTeacher)
    );
    const reservedBranchXs = relatedRoutes.map((route) => route.direct ? route.studentX : route.stubX);
    let best = null as (PlannedRoute & { cost: number }) | null;

    // Each option is a gap to route through and which side of the student to enter by.
    const options: { side: Side; gap: number; entry: "axis" | "away" }[] = [];
    sides.forEach((side) => {
      const deepestGap = sameSide
        ? Math.min(teacher.row, student.row)
        : side === teacher.item.position ? teacher.row : student.row;
      for (let gap = 0; gap <= deepestGap; gap += 1) options.push({ side, gap, entry: "axis" });
    });
    if (!sameSide || student.row + 1 <= teacher.row) {
      options.push({ side: student.item.position, gap: student.row + 1, entry: "away" });
    }

    options.forEach(({ side, gap, entry }) => {
      const entryRange = getEntryRange(student, zoom);
      if (!entryRange) return;

      const gapY = getGapY(side, gap, axisY, zoom);
      const studentEdgeY = entry === "axis" ? getEdgeY(student, zoom) : getFarEdgeY(student, zoom);
      if (preferredStudentEdgeY !== null && studentEdgeY !== preferredStudentEdgeY) return;
      if (studentDirection !== 0 && (gapY - start.y) * studentDirection < 0) return;
      const stubPick = pickStubX(start, gapY, zoom, routeRectsById, [teacherId], reservedBranchXs);
      const idealX = Math.min(Math.max(stubPick.x, entryRange.left), entryRange.right);
      const entryPick = pickX(idealX, entryRange, gapY, studentEdgeY, rectsById, [studentId]);
      const cost =
        (stubPick.hits + entryPick.hits) * 100000 +
        (stubPick.x - start.x) +
        Math.abs(start.y - gapY) +
        Math.abs(gapY - studentEdgeY) +
        Math.abs(stubPick.x - entryPick.x);

      if (!best || cost < best.cost) {
        best = {
          key: `${teacherId}-${studentId}`,
          teacherId,
          studentId,
          channel: `${side}:${gap}`,
          side,
          gapY,
          start,
          stubX: stubPick.x,
          studentX: entryPick.x,
          studentEdgeY,
          cost,
        };
      }
    });

    // The student edge facing the teacher's centre line, if the two rows don't overlap.
    const approachEdgeY = start.y <= studentBar.top ? studentBar.top
      : start.y >= studentBar.bottom ? studentBar.bottom : null;

    if (approachEdgeY !== null) {
      const dir = approachEdgeY >= start.y ? 1 : -1;
      const entryRange = getEntryRange(student, zoom);

      if (entryRange) {
        const minX = start.x + 6 * zoom;
        const xs = [Math.max(entryRange.left, minX), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
          (step) => entryRange.left + ((entryRange.right - entryRange.left) * step) / 10
        )].filter((x) => x >= minX && x <= entryRange.right && !reservedBranchXs.includes(x));

        // One turn: straight along the teacher's line, then straight into the student.
        xs.forEach((x) => {
          const hits =
            countSegmentHits(start.x, start.y, x, start.y, rectsById, [teacherId, studentId]) +
            countHits(x, start.y, approachEdgeY, rectsById, [teacherId, studentId]);
          const cost = hits * 100000 + (x - start.x) + Math.abs(approachEdgeY - start.y);

          if (!best || cost < best.cost) {
            best = {
              key: `${teacherId}-${studentId}`,
              teacherId,
              studentId,
              channel: "direct",
              side: teacher.item.position,
              gapY: start.y,
              start,
              stubX: x,
              studentX: x,
              studentEdgeY: approachEdgeY,
              direct: true,
              cost,
            };
          }
        });

        // Two turns with the sideways run just short of the student.
        const nearY = approachEdgeY - dir * 14 * zoom;
        if (dir * (nearY - start.y) > 0) {
          const stubPick = pickStubX(start, nearY, zoom, routeRectsById, [teacherId], reservedBranchXs);
          const idealX = Math.min(Math.max(stubPick.x, entryRange.left), entryRange.right);
          const entryPick = pickX(idealX, entryRange, nearY, approachEdgeY, rectsById, [studentId]);
          const crossHits = countSegmentHits(stubPick.x, nearY, entryPick.x, nearY, rectsById, [teacherId, studentId]);
          const cost =
            (stubPick.hits + entryPick.hits + crossHits) * 100000 +
            (stubPick.x - start.x) + Math.abs(nearY - start.y) +
            Math.abs(stubPick.x - entryPick.x) + Math.abs(approachEdgeY - nearY);

          if (!best || cost < best.cost) {
            best = {
              key: `${teacherId}-${studentId}`,
              teacherId,
              studentId,
              channel: `near:${studentId}`,
              side: teacher.item.position,
              gapY: nearY,
              start,
              stubX: stubPick.x,
              studentX: entryPick.x,
              studentEdgeY: approachEdgeY,
              cost,
            };
          }
        }
      }
    }

    if (best) planned.push(best);
  });

  // Routes sharing a gap get their own lane when their horizontal spans overlap.
  const lanes = new Map<PlannedRoute, { lane: number; count: number }>();
  const byChannel = new Map<string, PlannedRoute[]>();
  planned.filter((route) => !route.direct).forEach((route) => {
    byChannel.set(route.channel, [...(byChannel.get(route.channel) ?? []), route]);
  });

  byChannel.forEach((routes) => {
    const laneEnds: number[] = [];
    const sortedRoutes = [...routes].sort((first, second) =>
      Math.min(first.stubX, first.studentX) - Math.min(second.stubX, second.studentX)
    );
    sortedRoutes.forEach((route, index) => {
        const start = Math.min(route.stubX, route.studentX);
        const end = Math.max(route.stubX, route.studentX);
        const sharedPortRoute = sortedRoutes.slice(0, index).find((other) =>
          !areRelatedStudents(other.studentId, route.studentId, studentsByTeacher) && (
            (other.start.x === route.start.x && other.start.y === route.start.y) ||
            (other.studentX === route.studentX && other.studentEdgeY === route.studentEdgeY)
          )
        );
        let lane = sharedPortRoute ? lanes.get(sharedPortRoute)!.lane : -1;
        if (lane === -1) {
          lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
          if (lane === -1) lane = laneEnds.length;
        }
        laneEnds[lane] = Math.max(laneEnds[lane] ?? end, end);
        lanes.set(route, { lane, count: 0 });
      });
    routes.forEach((route) => {
      lanes.get(route)!.count = laneEnds.length;
    });
  });

  return planned.map((route) => {
    if (route.direct) {
      const length = route.studentEdgeY - route.start.y;
      const tip = { x: route.studentX, y: route.studentEdgeY };
      const size = Math.max(3, Math.min(7 * zoom, Math.abs(length) / 2.2));
      const points = [route.start, { x: route.studentX, y: route.start.y }, { x: route.studentX, y: route.studentEdgeY }];
      return {
        key: route.key,
        teacherId: route.teacherId,
        studentId: route.studentId,
        dashed: grandLinkKeys.has(route.key),
        points,
        segments: getLineageSegments(points, textRects),
        arrow: {
          tip,
          angle: length >= 0 ? 90 : -90,
          size,
          opacity: 1,
        },
      };
    }

    const { lane, count } = lanes.get(route)!;
    const halfWidth = (route.side === "above" ? 15 : 9) * zoom;
    const spacing = count > 1 ? Math.min(5 * zoom, (2 * halfWidth) / (count - 1)) : 0;
    const laneY = route.gapY + (lane - (count - 1) / 2) * spacing;
    const lastLength = route.studentEdgeY - laneY;
    const tip = { x: route.studentX, y: route.studentEdgeY };
    const size = Math.max(3, Math.min(7 * zoom, Math.abs(lastLength) / 2.2));
    const points = [
      route.start,
      { x: route.stubX, y: route.start.y },
      { x: route.stubX, y: laneY },
      { x: route.studentX, y: laneY },
      { x: route.studentX, y: route.studentEdgeY },
    ];

    return {
      key: route.key,
      teacherId: route.teacherId,
      studentId: route.studentId,
      dashed: grandLinkKeys.has(route.key),
      points,
      segments: getLineageSegments(points, textRects),
      arrow: {
        tip,
        angle: lastLength >= 0 ? 90 : -90,
        size,
        opacity: 1,
      },
    };
  });
}
