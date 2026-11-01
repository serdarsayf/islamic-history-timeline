import { useCallback, useSyncExternalStore } from "react";
import { normalizeTimelineTags } from "../lib/timeline/tags";
import { defaultTimelineTags } from "../lib/timeline/defaultData";
import { createPersistQueue } from "../lib/timeline/persistQueue";
import type { TimelineTag } from "../lib/timeline/types";

const storageKey = "timeline-tags";
const updateEvent = "timeline-tags-updated";
let cachedRaw: string | null = null;
let cachedTags: TimelineTag[] | null = null;

const persistQueue = createPersistQueue<TimelineTag[]>({
  key: storageKey,
  label: "timeline tags",
  onWritten(raw, tags) {
    cachedRaw = raw;
    cachedTags = tags;
  },
});

function readTags() {
  if (persistQueue.hasPending() && cachedTags !== null) return cachedTags;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === cachedRaw && cachedTags) return cachedTags;
    cachedRaw = stored;
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    cachedTags = Array.isArray(parsed)
      ? normalizeTimelineTags(parsed)
      : defaultTimelineTags;
  } catch {
    cachedRaw = null;
    cachedTags = defaultTimelineTags;
  }
  return cachedTags;
}

function subscribe(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      if (!persistQueue.hasPending()) {
        cachedRaw = null;
        cachedTags = null;
      }
      onChange();
    }
  };
  const handleUpdate = () => {
    onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(updateEvent, handleUpdate);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(updateEvent, handleUpdate);
  };
}

export function useTimelineTags() {
  const tags = useSyncExternalStore(subscribe, readTags, () => defaultTimelineTags);

  const setTags = useCallback((update: TimelineTag[] | ((tags: TimelineTag[]) => TimelineTag[])) => {
    const nextTags = normalizeTimelineTags(
      typeof update === "function" ? update(tags) : update
    );
    cachedTags = nextTags;
    persistQueue.schedule(nextTags);
    window.dispatchEvent(new Event(updateEvent));
  }, [tags]);

  return [tags, setTags] as const;
}
