import { getNextItemId } from "./types";
import { pruneTeacherIds } from "./lineage";
import type { TimelineItem } from "./types";

export function addTimelineItem(
  items: TimelineItem[],
  itemData: Omit<TimelineItem, "id">
) {
  return [...items, { ...itemData, id: getNextItemId(items) }];
}

export function updateTimelineItem(
  items: TimelineItem[],
  itemId: number,
  itemData: Omit<TimelineItem, "id">
) {
  return items.map((item) =>
    item.id === itemId ? { ...itemData, id: itemId } : item
  );
}

export function duplicateTimelineItem(items: TimelineItem[], itemId: number) {
  const source = items.find((item) => item.id === itemId);
  return source
    ? [...items, { ...source, id: getNextItemId(items) }]
    : items;
}

export function deleteTimelineItem(items: TimelineItem[], itemId: number) {
  return pruneTeacherIds(items.filter((item) => item.id !== itemId));
}

export function renameTagOnTimelineItems(
  items: TimelineItem[],
  oldName: string,
  newName: string
) {
  if (oldName === newName) return items;
  return items.map((item) => ({
    ...item,
    tags: item.tags.map((name) => name === oldName ? newName : name),
  }));
}

export function removeTagFromTimelineItems(
  items: TimelineItem[],
  tagName: string
) {
  return items.map((item) => ({
    ...item,
    tags: item.tags.filter((name) => name !== tagName),
  }));
}