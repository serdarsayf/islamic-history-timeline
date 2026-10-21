import { useSyncExternalStore } from "react";
import { defaultTags, normalizeTimelineTags } from "../lib/timeline/tags";
import type { TimelineTag } from "../lib/timeline/types";

const storageKey = "timeline-tags";
const updateEvent = "timeline-tags-updated";
let cachedRaw: string | null = null;
let cachedTags: TimelineTag[] | null = null;

function readTags() {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === cachedRaw && cachedTags) return cachedTags;
    cachedRaw = stored;
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    cachedTags = Array.isArray(parsed)
      ? normalizeTimelineTags(parsed)
      : stored
        ? defaultTags
        : defaultTags;
  } catch {
    cachedRaw = null;
    cachedTags = defaultTags;
  }
  return cachedTags;
}

function subscribe(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) onChange();
  };
  const handleUpdate = () => onChange();
  window.addEventListener("storage", handleStorage);
  window.addEventListener(updateEvent, handleUpdate);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(updateEvent, handleUpdate);
  };
}

export function useTimelineTags() {
  const tags = useSyncExternalStore(subscribe, readTags, () => defaultTags);

  function setTags(update: TimelineTag[] | ((tags: TimelineTag[]) => TimelineTag[])) {
    const nextTags = normalizeTimelineTags(
      typeof update === "function" ? update(tags) : update
    );
    const serialized = JSON.stringify(nextTags);
    cachedRaw = serialized;
    cachedTags = nextTags;
    window.localStorage.setItem(storageKey, serialized);
    window.dispatchEvent(new Event(updateEvent));
  }

  return [tags, setTags] as const;
}
