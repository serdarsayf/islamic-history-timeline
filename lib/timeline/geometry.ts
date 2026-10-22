import { dateToNumber } from "../timeline";
import type { TimelineItem } from "./types";

export function getMinorTickInterval(
  pixelsPerYear: number,
  zoom: number
) {
  const effectivePixelsPerYear =
    pixelsPerYear * zoom;

  if (effectivePixelsPerYear < 0.05) {
    return 10000;
  }

  if (effectivePixelsPerYear < 0.2) {
    return 1000;
  }

  if (effectivePixelsPerYear < 0.5) {
    return 500;
  }

  if (effectivePixelsPerYear < 1) {
    return 100;
  }

  if (effectivePixelsPerYear < 2) {
    return 50;
  }

  if (effectivePixelsPerYear < 4) {
    return 25;
  }

  if (effectivePixelsPerYear < 8) {
    return 10;
  }

  if (effectivePixelsPerYear < 16) {
    return 5;
  }

  return 1;
}

export function getLabelInterval(
  pixelsPerYear: number,
  zoom: number
) {
  const effectivePixelsPerYear =
    pixelsPerYear * zoom;
  const minimumLabelSpacing = 72;
  const labelIntervals = [
    25,
    50,
    100,
    250,
    500,
    1000,
    2500,
    5000,
    10000,
    25000,
    50000,
  ];

  return (
    labelIntervals.find(
      (interval) =>
        interval *
          effectivePixelsPerYear >=
        minimumLabelSpacing
    ) ??
    labelIntervals[labelIntervals.length - 1]
  );
}

export function getItemDistance(
  row: number,
  zoom: number
) {
  const firstRowDistance = 100 * zoom;
  const rowHeight = 90 * zoom;

  return (
    firstRowDistance +
    row * rowHeight
  );
}

export function getItemY(
  item: TimelineItem,
  row: number,
  axisY: number,
  zoom: number
) {
  const distance =
    getItemDistance(row, zoom);

  return item.position === "above"
    ? axisY - distance
    : axisY + distance;
}

type ItemRange = {
  item: TimelineItem;
  rangeStart: number;
  rangeEnd: number;
};

// Pixels kept clear to the right of a teacher for its connector's first horizontal run.
const TEACHER_STUB_CLEARANCE = 40;

function getItemRanges(
  items: TimelineItem[],
  pixelsPerYear: number,
  stubTeacherIds?: Set<number>
): ItemRange[] {
  return items.map((item) => {
    const start = dateToNumber(item.startDate);
    const end = item.endDate ? dateToNumber(item.endDate) : start;
    const textWidthInYears = (item.title.length * 11) / pixelsPerYear;
    let rangeStart: number;
    let rangeEnd: number;

    if (item.type === "event") {
      const labelWidthInYears = textWidthInYears + 22 / pixelsPerYear;
      rangeStart = start - labelWidthInYears / 2;
      rangeEnd = start + labelWidthInYears / 2;
    } else {
      rangeStart = Math.min(start, end);
      rangeEnd = Math.max(
        Math.max(start, end) + 2 / pixelsPerYear,
        start + 10 / pixelsPerYear + textWidthInYears
      );
    }

    if (stubTeacherIds?.has(item.id)) {
      rangeEnd += TEACHER_STUB_CLEARANCE / pixelsPerYear;
    }

    return { item, rangeStart, rangeEnd };
  });
}

export function getLineageClearanceRows(
  bounds: { top: number; bottom: number },
  axisY: number,
  zoom: number
) {
  const rowsIntersecting = (position: "above" | "below") => {
    if (zoom <= 0) return null;
    const maxReach = Math.max(Math.abs(bounds.top - axisY), Math.abs(bounds.bottom - axisY));
    const maxRow = Math.ceil((maxReach / zoom + 150) / 90) + 1;
    let min = Infinity;
    let max = -1;

    for (let row = 0; row <= maxRow; row += 1) {
      const center = axisY + (position === "above" ? -1 : 1) * getItemDistance(row, zoom);
      const itemTop = center - 50 * zoom;
      const itemBottom = center + 50 * zoom;
      if (itemBottom > bounds.top && itemTop < bounds.bottom) {
        min = Math.min(min, row);
        max = row;
      }
    }

    return max < 0 ? null : { min, max };
  };

  return {
    above: rowsIntersecting("above"),
    below: rowsIntersecting("below"),
  };
}

export function getItemRows(
  items: TimelineItem[],
  pixelsPerYear: number,
  priorityIds?: Set<number>,
  pinnedItem?: { id: number; row: number },
  stubTeacherIds?: Set<number>
) {
  const itemRows = new Map<number, number>();
  const priorityRowRanges: Record<
    "above" | "below",
    { start: number; end: number }[][]
  > = {
    above: [],
    below: [],
  };
  const rowRanges: Record<
    "above" | "below",
    { start: number; end: number }[][]
  > = {
    above: [],
    below: [],
  };

  const itemRanges = getItemRanges(items, pixelsPerYear, stubTeacherIds);

  const placeItem = (
    range: typeof itemRanges[number],
    rowsByPosition: typeof rowRanges,
    rowOffset: number,
    fixedRow?: number
  ) => {
    const rows = rowsByPosition[range.item.position];
    let row = fixedRow ?? 0;
    if (fixedRow === undefined) {
      while (rows[row]?.some((placed) =>
        range.rangeStart < placed.end && range.rangeEnd > placed.start
      )) row += 1;
    }

    (rows[row] ??= []).push({ start: range.rangeStart, end: range.rangeEnd });
    itemRows.set(range.item.id, rowOffset + row);
  };

  const placeItems = (
    ranges: typeof itemRanges,
    rowsByPosition: typeof rowRanges,
    rowOffset: (position: "above" | "below") => number,
    preferredRow?: number
  ) => [...ranges]
    .sort((first, second) => first.rangeStart - second.rangeStart)
    .forEach((range) => {
      const offset = rowOffset(range.item.position);
      if (preferredRow === undefined) {
        placeItem(range, rowsByPosition, offset);
        return;
      }

      const rows = rowsByPosition[range.item.position];
      let row = preferredRow;
      for (let distance = 0; rows[row]?.some((placed) =>
        range.rangeStart < placed.end && range.rangeEnd > placed.start
      ); distance += 1) {
        const nearerRow = preferredRow - distance - 1;
        const fartherRow = preferredRow + distance + 1;
        row = nearerRow >= 0 && !rows[nearerRow]?.some((placed) =>
          range.rangeStart < placed.end && range.rangeEnd > placed.start
        ) ? nearerRow : fartherRow;
      }
      placeItem(range, rowsByPosition, offset, row);
    });

  const isPriority = (id: number) => priorityIds?.has(id) === true;
  const pinnedRange = pinnedItem && itemRanges.find(({ item }) => item.id === pinnedItem.id);
  if (pinnedRange) placeItem(pinnedRange, priorityRowRanges, 0, pinnedItem.row);
  placeItems(
    itemRanges.filter(({ item }) => isPriority(item.id) && item.id !== pinnedItem?.id),
    priorityRowRanges,
    () => 0,
    pinnedItem?.row
  );
  placeItems(
    itemRanges.filter(({ item }) => !isPriority(item.id) && item.id !== pinnedItem?.id),
    rowRanges,
    (position) => priorityRowRanges[position].length
  );

  return itemRows;
}

// Two unrelated connectors whose vertical runs sit within this many pixels count as crowded.
const CROWD_DISTANCE = 16;
// Same-row backward students force a U-turn, so this arrangement is made very costly.
const REVERSAL_PENALTY = 1000;

function getBarEdges(item: TimelineItem, pixelsPerYear: number) {
  const start = dateToNumber(item.startDate);

  if (item.type === "event") {
    const half = (item.title.length * 11 + 22) / pixelsPerYear / 2;
    return { left: start - half, right: start + half };
  }

  const end = item.endDate ? dateToNumber(item.endDate) : start;
  return { left: Math.min(start, end), right: Math.max(start, end) };
}

function buildLineageModel(
  items: TimelineItem[],
  pixelsPerYear: number,
  lineageIds: Set<number>,
  links: { teacherId: number; studentId: number }[],
  stubTeacherIds?: Set<number>
) {
  const members = getItemRanges(
    items.filter((item) => lineageIds.has(item.id)),
    pixelsPerYear,
    stubTeacherIds
  );
  const membersById = new Map(members.map((range) => [range.item.id, range]));
  const margin = 8 / pixelsPerYear;

  const infos = links.flatMap(({ teacherId, studentId }) => {
    const teacher = membersById.get(teacherId)?.item;
    const student = membersById.get(studentId)?.item;
    if (!teacher || !student) return [];

    const teacherEdges = getBarEdges(teacher, pixelsPerYear);
    const studentEdges = getBarEdges(student, pixelsPerYear);
    const low = studentEdges.left + margin;
    const high = studentEdges.right - margin;
    // Where the connector's main vertical run is expected to sit.
    const x = low <= high
      ? Math.min(Math.max(teacherEdges.right + 10 / pixelsPerYear, low), high)
      : (studentEdges.left + studentEdges.right) / 2;

    return [{
      teacherId,
      studentId,
      x,
      behind: studentEdges.right <= teacherEdges.right + 6 / pixelsPerYear,
    }];
  });

  const incident = new Map<number, number[]>();
  infos.forEach(({ teacherId, studentId }, index) => {
    const teacherLinks = incident.get(teacherId);
    if (teacherLinks) teacherLinks.push(index);
    else incident.set(teacherId, [index]);

    const studentLinks = incident.get(studentId);
    if (studentLinks) studentLinks.push(index);
    else incident.set(studentId, [index]);
  });

  const threshold = CROWD_DISTANCE / pixelsPerYear;
  const linksByX = infos
    .map((info, index) => ({ index, x: info.x }))
    .sort((first, second) => first.x - second.x || first.index - second.index);
  const firstNearX = (x: number) => {
    let low = 0;
    let high = linksByX.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (linksByX[middle].x < x) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  // Only links within the horizontal crowding threshold can interact.
  const near = infos.map((first, firstIndex) => {
    const neighbors: { index: number; weight: number }[] = [];
    for (
      let candidate = firstNearX(first.x - threshold);
      candidate < linksByX.length && linksByX[candidate].x - first.x < threshold;
      candidate += 1
    ) {
      const secondIndex = linksByX[candidate].index;
      if (firstIndex === secondIndex) continue;
      const second = infos[secondIndex];
      const distance = Math.abs(first.x - second.x);
      const related = first.teacherId === second.teacherId ||
        first.teacherId === second.studentId ||
        first.studentId === second.teacherId ||
        first.studentId === second.studentId;
      if (!related && distance < threshold) {
        neighbors.push({ index: secondIndex, weight: 1 - distance / threshold });
      }
    }
    neighbors.sort((firstNeighbor, secondNeighbor) => firstNeighbor.index - secondNeighbor.index);
    return neighbors;
  });

  return {
    members,
    membersById,
    // A student with more lines in and out pays more for distance, so busy boxes stay near their teachers.
    infos: infos.map((info) => ({ ...info, lineCount: incident.get(info.studentId)!.length })),
    incident,
    near,
  };
}

type LineageModel = ReturnType<typeof buildLineageModel>;

function getRowY(item: TimelineItem, row: number) {
  return (item.position === "above" ? -1 : 1) * getItemDistance(row, 1);
}

function getLinkSpan(
  model: LineageModel,
  index: number,
  rows: Map<number, number>,
  overrideId?: number,
  overrideRow?: number
) {
  const { teacherId, studentId } = model.infos[index];
  const yOf = (id: number) => getRowY(
    model.membersById.get(id)!.item,
    id === overrideId ? overrideRow! : rows.get(id) ?? 0
  );
  const teacherY = yOf(teacherId);
  const studentY = yOf(studentId);

  return {
    teacherY,
    studentY,
    low: Math.min(teacherY, studentY),
    high: Math.max(teacherY, studentY),
  };
}

function getSpanOverlap(first: { low: number; high: number }, second: { low: number; high: number }) {
  return Math.max(0, Math.min(first.high, second.high) - Math.max(first.low, second.low));
}

function getLinkCost(
  model: LineageModel,
  index: number,
  span: ReturnType<typeof getLinkSpan>,
  spans: ReturnType<typeof getLinkSpan>[]
) {
  let cost = (span.high - span.low) * model.infos[index].lineCount;

  if (model.infos[index].behind && span.teacherY === span.studentY) cost += REVERSAL_PENALTY;

  model.near[index].forEach(({ index: otherIndex, weight }) => {
    cost += weight * getSpanOverlap(span, spans[otherIndex]);
  });

  return cost;
}

export function scoreLineageRows(
  items: TimelineItem[],
  pixelsPerYear: number,
  rows: Map<number, number>,
  lineageIds: Set<number>,
  links: { teacherId: number; studentId: number }[],
  stubTeacherIds?: Set<number>
) {
  const model = buildLineageModel(items, pixelsPerYear, lineageIds, links, stubTeacherIds);
  let length = 0;
  let weightedLength = 0;
  let reversals = 0;
  let crowding = 0;

  model.infos.forEach((info, index) => {
    const span = getLinkSpan(model, index, rows);
    length += span.high - span.low;
    weightedLength += (span.high - span.low) * info.lineCount;
    if (info.behind && span.teacherY === span.studentY) reversals += 1;

    model.near[index].forEach(({ index: otherIndex, weight }) => {
      if (otherIndex > index) {
        crowding += weight * getSpanOverlap(span, getLinkSpan(model, otherIndex, rows));
      }
    });
  });

  return {
    length,
    weightedLength,
    reversals,
    crowding,
    total: weightedLength + reversals * REVERSAL_PENALTY + crowding,
  };
}

// Moves each lineage box to the free row that keeps its connectors short, forward-going and uncrowded.
export function optimizeLineageRows(
  items: TimelineItem[],
  pixelsPerYear: number,
  startRows: Map<number, number>,
  lineageIds: Set<number>,
  links: { teacherId: number; studentId: number }[],
  pinnedId: number,
  stubTeacherIds?: Set<number>
) {
  const rows = new Map(startRows);
  const model = buildLineageModel(items, pixelsPerYear, lineageIds, links, stubTeacherIds);
  const { members, incident } = model;
  // Unrelated links never share a box, so a moving box only changes its own links' spans.
  const spans = model.infos.map((_, index) => getLinkSpan(model, index, rows));

  const costAt = (range: ItemRange, row: number) =>
    (incident.get(range.item.id) ?? []).reduce(
      (sum, index) => sum + getLinkCost(
        model,
        index,
        getLinkSpan(model, index, rows, range.item.id, row),
        spans
      ),
      0
    );
  const rowKey = (item: TimelineItem, row: number) => `${item.position}:${row}`;
  const occupants = new Map<string, ItemRange[]>();
  members.forEach((range) => {
    const key = rowKey(range.item, rows.get(range.item.id) ?? 0);
    occupants.set(key, [...(occupants.get(key) ?? []), range]);
  });
  const isFree = (range: ItemRange, row: number) =>
    !(occupants.get(rowKey(range.item, row)) ?? []).some((other) =>
      other.item.id !== range.item.id &&
      range.rangeStart < other.rangeEnd &&
      range.rangeEnd > other.rangeStart
    );

  const movable = members
    .filter((range) => range.item.id !== pinnedId && incident.has(range.item.id))
    // Busier boxes choose first so they get the rows nearest their teachers.
    .sort((first, second) =>
      incident.get(second.item.id)!.length - incident.get(first.item.id)!.length ||
      first.rangeStart - second.rangeStart
    );
  const highestRow = Math.max(0, ...members.map((range) => rows.get(range.item.id) ?? 0)) + 1;

  for (let pass = 0; pass < 50; pass += 1) {
    let changed = false;

    movable.forEach((range) => {
      let bestRow = rows.get(range.item.id) ?? 0;
      let bestCost = costAt(range, bestRow);

      for (let row = 0; row <= highestRow; row += 1) {
        if (row === bestRow || !isFree(range, row)) continue;
        const cost = costAt(range, row);
        if (cost < bestCost || (cost === bestCost && row < bestRow)) {
          bestRow = row;
          bestCost = cost;
        }
      }

      if (bestRow !== rows.get(range.item.id)) {
        const previousKey = rowKey(range.item, rows.get(range.item.id) ?? 0);
        occupants.set(previousKey, (occupants.get(previousKey) ?? []).filter((other) => other !== range));
        const nextKey = rowKey(range.item, bestRow);
        occupants.set(nextKey, [...(occupants.get(nextKey) ?? []), range]);
        rows.set(range.item.id, bestRow);
        (incident.get(range.item.id) ?? []).forEach((index) => {
          spans[index] = getLinkSpan(model, index, rows);
        });
        changed = true;
      }
    });

    if (!changed) break;
  }

  return rows;
}

export function getItemRowsAroundLineage(
  items: TimelineItem[],
  pixelsPerYear: number,
  originalRows: Map<number, number>,
  lineageRows: Map<number, number>,
  lineageIds: Set<number>,
  routeRange: { start: number; end: number } | null,
  clearThroughRows: {
    above: { min: number; max: number } | null;
    below: { min: number; max: number } | null;
  },
  stubTeacherIds?: Set<number>
) {
  const itemRows = new Map<number, number>();
  const occupiedRows: Record<"above" | "below", { start: number; end: number }[][]> = {
    above: [],
    below: [],
  };
  const itemRanges = getItemRanges(items, pixelsPerYear, stubTeacherIds);
  const lineageRanges = itemRanges.filter(({ item }) => lineageIds.has(item.id));
  const corridor = routeRange && lineageRanges.length > 0
    ? {
        start: Math.min(routeRange.start, ...lineageRanges.map(({ rangeStart }) => rangeStart)),
        end: Math.max(routeRange.end, ...lineageRanges.map(({ rangeEnd }) => rangeEnd)),
      }
    : routeRange;

  const reserve = (range: ItemRange, row: number) => {
    const rows = occupiedRows[range.item.position];
    (rows[row] ??= []).push({ start: range.rangeStart, end: range.rangeEnd });
    itemRows.set(range.item.id, row);
  };

  const findFreeRow = (range: ItemRange, startRow: number) => {
    const rows = occupiedRows[range.item.position];
    let row = startRow;
    while (rows[row]?.some((placed) =>
      range.rangeStart < placed.end && range.rangeEnd > placed.start
    )) row += 1;
    return row;
  };

  lineageRanges.forEach((range) => reserve(range, lineageRows.get(range.item.id) ?? 0));

  const overlapsCorridor = (range: ItemRange) => Boolean(corridor &&
    range.rangeStart < corridor.end && range.rangeEnd > corridor.start
  );
  const outsideLineage = itemRanges.filter(({ item }) => !lineageIds.has(item.id));
  const clearanceConflicts = outsideLineage.filter((range) => {
    const row = originalRows.get(range.item.id) ?? 0;
    const band = clearThroughRows[range.item.position];
    return band !== null && row >= band.min && row <= band.max && overlapsCorridor(range);
  });
  const preserveOriginalRow = outsideLineage.filter((range) => !clearanceConflicts.includes(range));

  preserveOriginalRow.forEach((range) => {
    const originalRow = originalRows.get(range.item.id) ?? 0;
    reserve(range, findFreeRow(range, originalRow));
  });
  clearanceConflicts
    .sort((first, second) => first.rangeStart - second.rangeStart)
    .forEach((range) => {
      const originalRow = originalRows.get(range.item.id) ?? 0;
      const band = clearThroughRows[range.item.position]!;
      const rows = occupiedRows[range.item.position];
      let aboveRow: number | null = null;
      for (let row = band.min - 1; row >= 0; row -= 1) {
        if (!rows[row]?.some((placed) =>
          range.rangeStart < placed.end && range.rangeEnd > placed.start
        )) {
          aboveRow = row;
          break;
        }
      }
      const belowRow = findFreeRow(range, band.max + 1);
      const destination = aboveRow !== null &&
        Math.abs(aboveRow - originalRow) < Math.abs(belowRow - originalRow)
        ? aboveRow
        : belowRow;
      reserve(range, destination);
    });

  return itemRows;
}
