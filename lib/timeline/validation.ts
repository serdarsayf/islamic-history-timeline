import { parseOptionalInRange } from "../timeline";
import type { ItemFormState, TimelineItem } from "./types";

export type CalendarEra = "BC" | "CE";

export function isPositiveWholeYear(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export function isCalendarEra(value: unknown): value is CalendarEra {
  return value === "BC" || value === "CE";
}

export function historicalYearPosition(year: number, era: CalendarEra) {
  return era === "BC" ? 1 - year : year;
}

export function isChronologicalRange(
  startYear: number,
  startEra: CalendarEra,
  endYear: number,
  endEra: CalendarEra
) {
  return historicalYearPosition(endYear, endEra) >= historicalYearPosition(startYear, startEra);
}

export function buildTimelineItemData(
  form: ItemFormState
): Omit<TimelineItem, "id"> | null {
  if (!form.title.trim() || !isPositiveWholeYear(Number(form.startYear))) return null;

  const startYear = Number(form.startYear);
  const startMonth = parseOptionalInRange(form.startMonth, 1, 12);
  const startDay = parseOptionalInRange(form.startDay, 1, 31);
  if ((form.startMonth && startMonth === undefined) ||
      (form.startDay && (startDay === undefined || startMonth === undefined))) return null;

  let endDate: TimelineItem["endDate"];
  if (form.itemType === "period") {
    const endYear = Number(form.endYear);
    const endMonth = parseOptionalInRange(form.endMonth, 1, 12);
    const endDay = parseOptionalInRange(form.endDay, 1, 31);
    if (!isPositiveWholeYear(endYear) ||
        (form.endMonth && endMonth === undefined) ||
        (form.endDay && (endDay === undefined || endMonth === undefined)) ||
        !isChronologicalRange(startYear, form.startEra, endYear, form.endEra)) return null;
    endDate = {
      year: endYear,
      era: form.endEra,
      ...(endMonth === undefined ? {} : { month: endMonth }),
      ...(endDay === undefined ? {} : { day: endDay }),
      ...(form.endApproximate ? { approximate: true } : {}),
    };
  }

  const grandTeacherIds = form.grandTeacherIds.filter((id) => form.teacherIds.includes(id));

  return {
    type: form.itemType,
    title: form.title.trim(),
    ...(form.fullName.trim() ? { fullName: form.fullName.trim() } : {}),
    description: form.description,
    ...(form.works.trim() ? { works: form.works.trim() } : {}),
    color: form.color,
    textColor: form.textColor,
    tags: form.tags,
    ...(form.teacherIds.length > 0 ? { teacherIds: form.teacherIds } : {}),
    ...(grandTeacherIds.length > 0 ? { grandTeacherIds } : {}),
    startDate: {
      year: startYear,
      era: form.startEra,
      ...(startMonth === undefined ? {} : { month: startMonth }),
      ...(startDay === undefined ? {} : { day: startDay }),
      ...(form.startApproximate ? { approximate: true } : {}),
    },
    ...(endDate ? { endDate } : {}),
    position: form.position,
  };
}