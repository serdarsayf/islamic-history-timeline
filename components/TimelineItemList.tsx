import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dateToNumber, getYearLabel } from "../lib/timeline";
import type { TimelineItem } from "../lib/timeline/types";

type SortMode = "start" | "end" | "name";

const sortOptions: { value: SortMode; label: string }[] = [
  { value: "start", label: "Birth year" },
  { value: "end", label: "Death year" },
  { value: "name", label: "Name (A-Z)" },
];

const estimatedRowHeight = 76;
const rowOverscan = 640;

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

type VirtualRowProps = {
  item: TimelineItem;
  top: number;
  onSelect: (item: TimelineItem) => void;
  onMeasure: (itemId: number, top: number, height: number) => void;
};

const VirtualTimelineItemRow = memo(function VirtualTimelineItemRow({
  item,
  top,
  onSelect,
  onMeasure,
}: VirtualRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const reportHeight = () => onMeasure(item.id, top, row.getBoundingClientRect().height);
    const observer = new ResizeObserver(reportHeight);
    observer.observe(row);
    reportHeight();
    return () => observer.disconnect();
  }, [item.id, onMeasure, top]);

  return (
    <div
      ref={rowRef}
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        display: "flow-root",
      }}
    >
      <TimelineItemRow item={item} onSelect={onSelect} />
    </div>
  );
});

function findFirstRowEndingAfter(
  rows: { top: number; height: number }[],
  offset: number
) {
  let low = 0;
  let high = rows.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].top + rows[middle].height <= offset) low = middle + 1;
    else high = middle;
  }

  return low;
}

function getRowLayouts(
  items: TimelineItem[],
  rowHeights: Record<number, number>
) {
  let totalHeight = 0;
  const rows = items.map((item) => {
    const height = rowHeights[item.id] ?? estimatedRowHeight;
    const layout = { item, top: totalHeight, height };
    totalHeight += height;
    return layout;
  });
  return { rows, totalHeight };
}

function useRafThrottle<Args extends unknown[]>(callback: (...args: Args) => void) {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number | null>(null);
  const latestArgsRef = useRef<Args | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const schedule = useCallback((...args: Args) => {
    latestArgsRef.current = args;
    if (frameRef.current !== null) return;

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const latestArgs = latestArgsRef.current;
      latestArgsRef.current = null;
      if (latestArgs) callbackRef.current(...latestArgs);
    });
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  return schedule;
}

function countWrappedLines(
  text: string,
  style: CSSStyleDeclaration,
  width: number,
  context: CanvasRenderingContext2D
) {
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  let line = words[0];
  let lineCount = 1;
  words.slice(1).forEach((word) => {
    const nextLine = `${line} ${word}`;
    if (context.measureText(nextLine).width <= width) {
      line = nextLine;
    } else {
      line = word;
      lineCount += 1;
    }
  });
  return lineCount;
}

function measureItemRowHeights(button: HTMLButtonElement, items: TimelineItem[]) {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;

  const buttonStyle = getComputedStyle(button);
  const spans = button.querySelectorAll("span");
  const titleStyle = getComputedStyle(spans[0]);
  const dateStyle = getComputedStyle(spans[spans.length - 1]);
  const contentWidth = button.clientWidth -
    parseFloat(buttonStyle.paddingLeft) -
    parseFloat(buttonStyle.paddingRight);
  const verticalSpace =
    parseFloat(buttonStyle.paddingTop) +
    parseFloat(buttonStyle.paddingBottom) +
    parseFloat(buttonStyle.borderTopWidth) +
    parseFloat(buttonStyle.borderBottomWidth) +
    parseFloat(buttonStyle.marginBottom);
  const rowHeights: Record<number, number> = {};

  items.forEach((item) => {
    const titleLines = countWrappedLines(item.title, titleStyle, contentWidth, context);
    const fullNameLines = item.fullName
      ? countWrappedLines(item.fullName, {
          fontStyle: "normal",
          fontWeight: "400",
          fontSize: "12px",
          fontFamily: "Arial, sans-serif",
        } as CSSStyleDeclaration, contentWidth, context)
      : 0;
    const dateText = `${getYearLabel(dateToNumber(item.startDate))}${item.endDate
      ? ` - ${getYearLabel(dateToNumber(item.endDate))}`
      : ""}`;
    const dateLines = countWrappedLines(dateText, dateStyle, contentWidth, context);

    rowHeights[item.id] = verticalSpace +
      titleLines * parseFloat(titleStyle.lineHeight) +
      (fullNameLines ? 2 + fullNameLines * 16.2 : 0) +
      3 + dateLines * parseFloat(dateStyle.lineHeight);
  });

  return rowHeights;
}

function TimelineItemListImpl({
  items,
  scrollTopRef,
  onSelect,
  onClose,
}: TimelineItemListProps) {
  const [sortMode, setSortMode] = useState<SortMode>("start");
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const rowHeightsRef = useRef<Record<number, number>>({});
  const [listMetrics, setListMetrics] = useState({
    scrollTop: 0,
    viewportHeight: 0,
    rowsOffset: 0,
    width: 0,
  });
  const listRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const listWidthRef = useRef<number | null>(null);

  const orderedItems = useMemo(
    () => [...items].sort((first, second) => compareItems(first, second, sortMode)),
    [items, sortMode]
  );
  const rowLayouts = useMemo(
    () => getRowLayouts(orderedItems, rowHeights),
    [orderedItems, rowHeights]
  );
  const firstRow = findFirstRowEndingAfter(
    rowLayouts.rows,
    Math.max(0, listMetrics.scrollTop - listMetrics.rowsOffset - rowOverscan)
  );
  const lastRow = findFirstRowEndingAfter(
    rowLayouts.rows,
    Math.max(0, listMetrics.scrollTop - listMetrics.rowsOffset + listMetrics.viewportHeight + rowOverscan)
  );
  const renderedRows = rowLayouts.rows.slice(firstRow, Math.max(firstRow + 1, lastRow));

  const getRowsOffset = useCallback(() => {
    const list = listRef.current;
    const spacer = spacerRef.current;
    if (!list || !spacer) return 0;
    return spacer.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  }, []);

  const applyListMetrics = useCallback((
    scrollTop: number,
    viewportHeight: number,
    rowsOffset: number,
    width: number
  ) => {
    setListMetrics((current) => {
      if (
        current.scrollTop === scrollTop &&
        current.viewportHeight === viewportHeight &&
        current.rowsOffset === rowsOffset &&
        current.width === width
      ) return current;
      return { scrollTop, viewportHeight, rowsOffset, width };
    });
  }, []);
  const scheduleListMetrics = useRafThrottle(applyListMetrics);

  const setListElement = useCallback((element: HTMLDivElement | null) => {
    listRef.current = element;
    if (element && element.scrollTop !== scrollTopRef.current) {
      element.scrollTop = scrollTopRef.current;
    }
  }, [scrollTopRef]);

  const updateListMetrics = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    const width = list.clientWidth;
    if (listWidthRef.current !== null && listWidthRef.current !== width) {
      rowHeightsRef.current = {};
      setRowHeights({});
    }
    listWidthRef.current = width;
    const rowsOffset = getRowsOffset();
    scheduleListMetrics(list.scrollTop, list.clientHeight, rowsOffset, width);
  }, [getRowsOffset, scheduleListMetrics]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    updateListMetrics();
    const observer = new ResizeObserver(updateListMetrics);
    observer.observe(list);
    return () => observer.disconnect();
  }, [updateListMetrics]);

  useLayoutEffect(() => {
    const button = spacerRef.current?.querySelector("button");
    if (!button) return;

    const measuredHeights = measureItemRowHeights(button, orderedItems);
    if (!measuredHeights) return;
    rowHeightsRef.current = measuredHeights;
    setRowHeights(measuredHeights);
  }, [orderedItems, listMetrics.width]);

  const handleRowMeasure = useCallback((itemId: number, top: number, height: number) => {
    const currentHeight = rowHeightsRef.current[itemId] ?? estimatedRowHeight;
    if (Math.abs(currentHeight - height) < 1) return;

    const list = listRef.current;
    if (list && top + currentHeight <= list.scrollTop - getRowsOffset()) {
      list.scrollTop += height - currentHeight;
      scrollTopRef.current = list.scrollTop;
      scheduleListMetrics(list.scrollTop, list.clientHeight, getRowsOffset(), list.clientWidth);
    }

    rowHeightsRef.current = { ...rowHeightsRef.current, [itemId]: height };
    setRowHeights(rowHeightsRef.current);
  }, [getRowsOffset, scheduleListMetrics, scrollTopRef]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    scrollTopRef.current = list.scrollTop;
    scheduleListMetrics(list.scrollTop, list.clientHeight, getRowsOffset(), list.clientWidth);
  }, [getRowsOffset, scheduleListMetrics, scrollTopRef]);

  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      ref={setListElement}
      onScroll={handleScroll}
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
        <div
          ref={spacerRef}
          style={{ position: "relative", height: rowLayouts.totalHeight }}
        >
          {renderedRows.map(({ item, top }) => (
            <VirtualTimelineItemRow
              key={item.id}
              item={item}
              top={top}
              onSelect={onSelect}
              onMeasure={handleRowMeasure}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(TimelineItemListImpl);
