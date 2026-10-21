import { useCallback, useSyncExternalStore } from "react";
import { defaultTags, normalizeTimelineTags } from "../lib/timeline/tags";
import type { TimelineTag } from "../lib/timeline/types";

const storageKey = "timeline-tags";
const updateEvent = "timeline-tags-updated";
let cachedRaw: string | null = null;
let cachedTags: TimelineTag[] | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRaw: string | null = null;
let unloadHandler: (() => void) | null = null;

function removeUnloadHandler() {
  if (unloadHandler === null) return;
  window.removeEventListener("beforeunload", unloadHandler);
  unloadHandler = null;
}

function flushPendingWrite() {
  if (writeTimer !== null) clearTimeout(writeTimer);
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
  removeUnloadHandler();
}

function schedulePersist(raw: string) {
  pendingRaw = raw;
  if (writeTimer === null) {
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
      removeUnloadHandler();
    }, 150);
  }

  if (unloadHandler === null) {
    unloadHandler = flushPendingWrite;
    window.addEventListener("beforeunload", unloadHandler);
  }
}

function readTags() {
  if (pendingRaw !== null && cachedTags !== null) return cachedTags;
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
    if (event.key === storageKey) {
      if (pendingRaw === null) {
        cachedRaw = null;
        cachedTags = null;
      }
      onChange();
    }
  };
  const handleUpdate = () => {
    cachedRaw = null;
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
  const tags = useSyncExternalStore(subscribe, readTags, () => defaultTags);

  const setTags = useCallback((update: TimelineTag[] | ((tags: TimelineTag[]) => TimelineTag[])) => {
    const nextTags = normalizeTimelineTags(
      typeof update === "function" ? update(tags) : update
    );
    const serialized = JSON.stringify(nextTags);
    cachedRaw = serialized;
    cachedTags = nextTags;
    schedulePersist(serialized);
    window.dispatchEvent(new Event(updateEvent));
  }, [tags]);

  return [tags, setTags] as const;
}
