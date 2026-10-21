import type { HistoricalDate } from "../timeline";

export type CalendarMode =
  | "gregorian"
  | "hijri";

export type TimelineTag = {
  name: string;
  color: string;
  parentName?: string;
  isMeta?: boolean;
  itemPosition?: "above" | "below";
  itemPositionUpdatedAt?: number;
};

export type TimelineItem = {
  id: number;
  type: "event" | "period";

  title: string;
  fullName?: string;
  description: string;
  works?: string;
  color: string;
  textColor: string;
  tags: string[];
  teacherIds?: number[];
  // Subset of teacherIds whose connector to this item is drawn dotted.
  grandTeacherIds?: number[];

  startDate: HistoricalDate;
  endDate?: HistoricalDate;

  position: "above" | "below";
};

// Assigns a new item an id one higher than any existing item, so ids
// stay unique and stable regardless of when items were created.
export function getNextItemId(items: TimelineItem[]) {
  return items.reduce((maxId, item) => Math.max(maxId, item.id), 0) + 1;
}


// Draft state backing the add/edit item form. Fields are kept as
// strings while editing and only parsed into a HistoricalDate on submit.
export type ItemFormState = {
  itemType: TimelineItem["type"];
  title: string;
  fullName: string;
  description: string;
  works: string;
  color: string;
  textColor: string;
  tags: string[];
  teacherIds: number[];
  grandTeacherIds: number[];
  startYear: string;
  startEra: "BC" | "CE";
  startMonth: string;
  startDay: string;
  startApproximate: boolean;
  endYear: string;
  endEra: "BC" | "CE";
  endMonth: string;
  endDay: string;
  endApproximate: boolean;
  position: TimelineItem["position"];
};

export const initialItemFormState: ItemFormState = {
  itemType: "event",
  title: "",
  fullName: "",
  description: "",
  works: "",
  color: "#ddd",
  textColor: "#ffffff",
  tags: [],
  teacherIds: [],
  grandTeacherIds: [],
  startYear: "",
  startEra: "CE",
  startMonth: "",
  startDay: "",
  startApproximate: false,
  endYear: "",
  endEra: "CE",
  endMonth: "",
  endDay: "",
  endApproximate: false,
  position: "above",
};

