import { getTagItemPosition } from "./tags";
import type { ItemFormState, TimelineItem, TimelineTag } from "./types";
import { buildTimelineItemData } from "./validation";

export function itemToFormState(item: TimelineItem): ItemFormState {
  return {
    itemType: item.type,
    title: item.title,
    fullName: item.fullName ?? "",
    description: item.description,
    works: item.works ?? "",
    color: item.color,
    textColor: item.textColor,
    tags: item.tags,
    teacherIds: item.teacherIds ?? [],
    grandTeacherIds: item.grandTeacherIds ?? [],
    startYear: String(item.startDate.year),
    startEra: item.startDate.era,
    startMonth: item.startDate.month ? String(item.startDate.month) : "",
    startDay: item.startDate.day ? String(item.startDate.day) : "",
    startApproximate: item.startDate.approximate === true,
    endYear: item.endDate ? String(item.endDate.year) : "",
    endEra: item.endDate?.era ?? "CE",
    endMonth: item.endDate?.month ? String(item.endDate.month) : "",
    endDay: item.endDate?.day ? String(item.endDate.day) : "",
    endApproximate: item.endDate?.approximate === true,
    position: item.position,
  };
}

// Tag-driven position wins over the form's own position, as for live edits before.
export function buildItemDataWithTagPosition(
  form: ItemFormState,
  tags: TimelineTag[]
): Omit<TimelineItem, "id"> | null {
  const itemData = buildTimelineItemData(form);
  if (!itemData) return null;

  return {
    ...itemData,
    position: getTagItemPosition(tags, itemData.tags) ?? itemData.position,
  };
}
