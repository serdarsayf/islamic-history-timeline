import { useCallback, useSyncExternalStore } from "react";
import { initialItems } from "../lib/timeline/data";
import {
  readStoredItems,
  subscribeToStoredItems,
  writeStoredItems,
} from "../lib/timeline/storage";
import type { TimelineItem } from "../lib/timeline/types";

export function useTimelineItems() {
  const items = useSyncExternalStore(
    subscribeToStoredItems,
    () => readStoredItems(initialItems),
    () => initialItems
  );

  // Stable across renders: reads the latest items itself instead of
  // closing over `items`, so effects depending on it never re-fire
  // just because the array reference changed.
  const setItems = useCallback(
    (update: TimelineItem[] | ((items: TimelineItem[]) => TimelineItem[])) => {
      const currentItems = readStoredItems(initialItems);
      const nextItems = typeof update === "function" ? update(currentItems) : update;
      writeStoredItems(nextItems);
    },
    []
  );

  return [items, setItems] as const;
}
