import type { TimelineItem } from "./types";
import type { HistoricalDate } from "../timeline";
import { isCalendarEra, isChronologicalRange, isPositiveWholeYear } from "./validation";
import { pruneTeacherIds } from "./lineage";

const storageKey = "timeline-items";
const storageEvent = "timeline-items-updated";
let cachedRaw: string | null = null;
let cachedItems: TimelineItem[] | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRaw: string | null = null;

function schedulePersist(raw: string) {
  pendingRaw = raw;
  if (writeTimer !== null) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const toWrite = pendingRaw;
    pendingRaw = null;
    if (toWrite !== null) {
      try {
        window.localStorage.setItem(storageKey, toWrite);
        cachedRaw = null;
      } catch {
        // Ignore quota or storage failures.
      }
    }
  }, 150);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (writeTimer !== null) clearTimeout(writeTimer);
    writeTimer = null;
    if (pendingRaw !== null) {
      try {
        window.localStorage.setItem(storageKey, pendingRaw);
        cachedRaw = null;
      } catch {
        // Ignore quota or storage failures.
      }
      pendingRaw = null;
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStoredDate(value: unknown): HistoricalDate | null {
  if (!isRecord(value) || !isPositiveWholeYear(value.year) || !isCalendarEra(value.era)) {
    return null;
  }

  const month = value.month;
  const day = value.day;
  if (month !== undefined && (!Number.isSafeInteger(month) || Number(month) < 1 || Number(month) > 12)) {
    return null;
  }
  if (
    day !== undefined &&
    (!Number.isSafeInteger(day) || Number(day) < 1 || Number(day) > 31 || month === undefined)
  ) {
    return null;
  }

  return {
    year: value.year,
    era: value.era,
    ...(month === undefined ? {} : { month: Number(month) }),
    ...(day === undefined ? {} : { day: Number(day) }),
    ...(value.approximate === true ? { approximate: true } : {}),
  };
}

function normalizeStoredItem(value: unknown): TimelineItem | null {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) <= 0 ||
    (value.type !== "event" && value.type !== "period") ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    (value.position !== "above" && value.position !== "below")
  ) {
    return null;
  }

  const startDate = normalizeStoredDate(value.startDate);
  if (!startDate) return null;

  const endDate = value.endDate === undefined
    ? undefined
    : normalizeStoredDate(value.endDate);
  if (value.type === "period" && (!endDate || !isChronologicalRange(
    startDate.year,
    startDate.era,
    endDate.year,
    endDate.era
  ))) {
    return null;
  }

  return {
    id: Number(value.id),
    type: value.type,
    title: value.title.trim(),
    ...(typeof value.fullName === "string" ? { fullName: value.fullName } : {}),
    description: typeof value.description === "string" ? value.description : "",
    ...(typeof value.works === "string" ? { works: value.works } : {}),
    color: typeof value.color === "string" ? value.color : "#ddd",
    textColor: typeof value.textColor === "string" ? value.textColor : "#ffffff",
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      : [],
    ...(Array.isArray(value.teacherIds)
      ? { teacherIds: value.teacherIds.filter((id): id is number => Number.isSafeInteger(id) && id > 0) }
      : {}),
    ...(Array.isArray(value.grandTeacherIds)
      ? { grandTeacherIds: value.grandTeacherIds.filter((id): id is number => Number.isSafeInteger(id) && id > 0) }
      : {}),
    startDate,
    ...(endDate ? { endDate } : {}),
    position: value.position,
  };
}

export function normalizeStoredItems(value: unknown, fallback: TimelineItem[]) {
  if (!Array.isArray(value)) return fallback;

  const seenIds = new Set<number>();
  return pruneTeacherIds(value.flatMap((candidate): TimelineItem[] => {
    const item = normalizeStoredItem(candidate);
    if (!item || seenIds.has(item.id)) return [];
    seenIds.add(item.id);
    return [item];
  }));
}

export function parseStoredItems(stored: string | null, fallback: TimelineItem[]) {
  if (stored === null) return fallback;
  try {
    return normalizeStoredItems(JSON.parse(stored), fallback);
  } catch {
    return fallback;
  }
}

export function readStoredItems(fallback: TimelineItem[]) {
  if (typeof window === "undefined") return fallback;
  if (pendingRaw !== null && cachedItems !== null) return cachedItems;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === cachedRaw && cachedItems) {
      return cachedItems;
    }

    cachedRaw = stored;
    cachedItems = parseStoredItems(stored, fallback);

    return cachedItems;
  } catch {
    cachedRaw = null;
    cachedItems = null;
    return fallback;
  }
}

export function writeStoredItems(items: TimelineItem[]) {
  const serialized = JSON.stringify(items);
  cachedRaw = serialized;
  cachedItems = items;
  schedulePersist(serialized);
  window.dispatchEvent(new Event(storageEvent));
}

export function subscribeToStoredItems(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      if (pendingRaw === null) {
        cachedRaw = null;
        cachedItems = null;
      }
      onChange();
    }
  };
  const handleTimelineUpdate = () => {
    cachedRaw = null;
    onChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(storageEvent, handleTimelineUpdate);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(storageEvent, handleTimelineUpdate);
  };
}
