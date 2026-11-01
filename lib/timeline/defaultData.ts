import defaultTimelineData from "./defaultTimeline.json";
import type { TimelineItem, TimelineTag } from "./types";

const data = defaultTimelineData as unknown as {
  items: TimelineItem[];
  tags: TimelineTag[];
};

export const defaultTimelineItems = data.items;
export const defaultTimelineTags = data.tags;
