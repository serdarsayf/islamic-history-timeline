import { memo, useMemo, useState } from "react";
import { dateToNumber, getYearLabel } from "../lib/timeline";
import type { TimelineItem } from "../lib/timeline/types";

type SortMode = "start" | "end" | "name";

const sortOptions: { value: SortMode; label: string }[] = [
  { value: "start", label: "Birth year" },
  { value: "end", label: "Death year" },
  { value: "name", label: "Name (A-Z)" },
];

function compareItems(first: TimelineItem, second: TimelineItem, sortMode: SortMode) {
  if (sortMode === "name") {
    return first.title.localeCompare(second.title);
  }

  // Items without an end date (events) fall back to their start date.
  const firstDate = sortMode === "end" ? (first.endDate ?? first.startDate) : first.startDate;
  const secondDate = sortMode === "end" ? (second.endDate ?? second.startDate) : second.startDate;

  return dateToNumber(firstDate) - dateToNumber(secondDate);
}

type TimelineItemListProps = {
  items: TimelineItem[];
  scrollTopRef: { current: number };
  onSelect: (item: TimelineItem) => void;
  onClose: () => void;
};

type TimelineItemRowProps = {
  item: TimelineItem;
  onSelect: (item: TimelineItem) => void;
};

function TimelineItemRowImpl({ item, onSelect }: TimelineItemRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      style={{
        display: "block",
        width: "100%",
        padding: "10px",
        marginBottom: "6px",
        border: "1px solid #e2e8f0",
        borderRadius: "4px",
        backgroundColor: "white",
        color: "#1e293b",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ display: "block", fontWeight: 600 }}>
        {item.title}
      </span>
      {item.fullName && (
        <span style={{ display: "block", marginTop: "2px", color: "#7b8490", fontSize: "12px", lineHeight: 1.35 }}>
          {item.fullName}
        </span>
      )}
      <span style={{ display: "block", marginTop: "3px", color: "#64748b", fontSize: "12px" }}>
        {getYearLabel(dateToNumber(item.startDate))}
        {item.endDate
          ? ` - ${getYearLabel(dateToNumber(item.endDate))}`
          : ""}
      </span>
    </button>
  );
}

export const TimelineItemRow = memo(TimelineItemRowImpl);

export default function TimelineItemList({
  items,
  scrollTopRef,
  onSelect,
  onClose,
}: TimelineItemListProps) {
  const [sortMode, setSortMode] = useState<SortMode>("start");

  const orderedItems = useMemo(
    () => [...items].sort((first, second) => compareItems(first, second, sortMode)),
    [items, sortMode]
  );

  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      ref={(element) => {
        if (element && element.scrollTop !== scrollTopRef.current) {
          element.scrollTop = scrollTopRef.current;
        }
      }}
      onScroll={(event) => {
        scrollTopRef.current = event.currentTarget.scrollTop;
      }}
      className="timeline-floating-panel timeline-list-panel timeline-item-list"
      style={{
        position: "absolute",
        top: "20px",
        right: "260px",
        zIndex: 30,
        width: "280px",
        maxHeight: "calc(100vh - 40px)",
        overflowY: "auto",
        padding: "14px",
        boxSizing: "border-box",
        backgroundColor: "rgba(248,250,252,0.97)",
        border: "1px solid rgba(203,213,225,0.9)",
        borderRadius: "6px",
        boxShadow: "0 12px 28px rgba(15,23,42,0.24)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <strong style={{ color: "#1e293b" }}>Timeline items</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close item list"
          style={{
            border: "none",
            background: "transparent",
            color: "#64748b",
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          x
        </button>
      </div>

      <label style={{ display: "block", marginBottom: "10px", color: "#334155", fontSize: "12px" }}>
        Sort by
        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as SortMode)}
          style={{ display: "block", width: "100%", marginTop: "4px", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white" }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>


      {orderedItems.length === 0 ? (
        <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
          No timeline items yet.
        </p>
      ) : (
        orderedItems.map((item) => (
          <TimelineItemRow key={item.id} item={item} onSelect={onSelect} />
        ))
      )}
    </div>
  );
}
