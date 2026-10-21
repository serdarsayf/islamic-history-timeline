import type { TimelineItem } from "./types";

function buildEdges(items: TimelineItem[]) {
  const ids = new Set(items.map((item) => item.id));
  const teachers = new Map<number, number[]>();
  const students = new Map<number, number[]>();

  items.forEach((item) => {
    const itemTeachers = (item.teacherIds ?? []).filter((id) => ids.has(id));
    teachers.set(item.id, itemTeachers);
    itemTeachers.forEach((teacherId) => {
      students.set(teacherId, [...(students.get(teacherId) ?? []), item.id]);
    });
  });

  return { teachers, students };
}

function walk(startId: number, edges: Map<number, number[]>) {
  const found = new Set<number>();
  const pending = [startId];

  while (pending.length > 0) {
    (edges.get(pending.pop()!) ?? []).forEach((id) => {
      if (found.has(id)) return;
      found.add(id);
      pending.push(id);
    });
  }

  return found;
}

export function getDescendantIds(items: TimelineItem[], itemId: number) {
  return walk(itemId, buildEdges(items).students);
}

export function getStudentLineageIds(items: TimelineItem[], itemId: number) {
  if (!items.some((item) => item.id === itemId)) return null;

  const descendants = getDescendantIds(items, itemId);
  return descendants.size > 0 ? new Set([itemId, ...descendants]) : null;
}

// Every teacher and student reachable from the item, or null when it has no relationships.
export function getLineageIds(items: TimelineItem[], itemId: number) {
  if (!items.some((item) => item.id === itemId)) return null;

  const { teachers, students } = buildEdges(items);
  const lineage = new Set([
    itemId,
    ...walk(itemId, teachers),
    ...walk(itemId, students),
  ]);

  return lineage.size > 1 ? lineage : null;
}

export function getLineageLinks(items: TimelineItem[], lineageIds: Set<number>) {
  return items.flatMap((item) =>
    (item.teacherIds ?? [])
      .filter((teacherId) => lineageIds.has(teacherId) && lineageIds.has(item.id))
      .map((teacherId) => ({
        teacherId,
        studentId: item.id,
        ...(item.grandTeacherIds?.includes(teacherId) ? { grand: true } : {}),
      }))
  );
}

export function pruneTeacherIds(items: TimelineItem[]): TimelineItem[] {
  const ids = new Set(items.map((item) => item.id));

  return items.map((item) => {
    if (!item.teacherIds) {
      if (!item.grandTeacherIds) return item;

      const { grandTeacherIds: _orphanGrand, ...withoutGrand } = item;
      void _orphanGrand;
      return withoutGrand;
    }

    const kept = [...new Set(item.teacherIds)].filter(
      (id) => id !== item.id && ids.has(id)
    );
    const keptGrand = [...new Set(item.grandTeacherIds ?? [])].filter(
      (id) => kept.includes(id)
    );
    const grandUnchanged = item.grandTeacherIds === undefined ||
      (keptGrand.length > 0 && keptGrand.length === item.grandTeacherIds.length);
    if (kept.length === item.teacherIds.length && kept.length > 0 && grandUnchanged) return item;

    const { teacherIds: _removed, grandTeacherIds: _removedGrand, ...rest } = item;
    void _removed;
    void _removedGrand;
    return {
      ...rest,
      ...(kept.length > 0 ? { teacherIds: kept } : {}),
      ...(kept.length > 0 && keptGrand.length > 0 ? { grandTeacherIds: keptGrand } : {}),
    };
  });
}
