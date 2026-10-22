import { useState } from "react";
import { haveSameItemLayout } from "../lib/timeline/geometry";
import type { TimelineItem } from "../lib/timeline/types";

// Returns the previous array while only non-layout fields (colour, description, ...) changed.
export function useLayoutStableItems(items: TimelineItem[]) {
  const [stable, setStable] = useState(items);
  if (haveSameItemLayout(stable, items)) return stable;
  setStable(items);
  return items;
}
