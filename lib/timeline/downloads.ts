import {
  exportTimelineCategory,
} from "./categoryPackages";
import { exportTimelineCsv } from "./timelineCsv";
import type { TimelineItem, TimelineTag } from "./types";

export function downloadTimelineCsv(items: TimelineItem[], tags: TimelineTag[]) {
  const url = URL.createObjectURL(new Blob([exportTimelineCsv(items, tags)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "timeline-items.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadTimelineCategory(
  category: TimelineTag,
  items: TimelineItem[],
  tags: TimelineTag[]
) {
  const safeName = category.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  const url = URL.createObjectURL(
    new Blob([exportTimelineCategory(category, items, tags)], {
      type: "application/json;charset=utf-8",
    })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName || "category"}.timeline-category.json`;
  link.click();
  URL.revokeObjectURL(url);
}
