"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import {
  HistoricalDate,
  dateToNumber,
  getHijriYear,
  getMonthDayLabel,
  getYearLabel,
  PIXELS_PER_YEAR,
} from "../lib/timeline";
import type {
  CalendarMode,
  ItemFormState,
  TimelineItem,
  TimelineTag,
} from "../lib/timeline/types";
import { initialItemFormState } from "../lib/timeline/types";
import {
  getItemDistance,
  getLineageClearanceRows,
  getItemRows,
  getItemRowsAroundLineage,
  optimizeLineageRows,
  getItemY,
  getLabelInterval,
  getMinorTickInterval,
  haveSameItemLayout,
  isItemInRenderRange,
} from "../lib/timeline/geometry";
import TimelineControls from "./TimelineControls";
import TimelineItemVisual from "./TimelineItemVisual";
import { useTimelineTags } from "./useTimelineTags";
import { useEscapeLayer } from "./useEscapeLayer";
import {
  createTimelineTag,
  deleteTimelineTag,
  filterItemsByTags,
  getTagItemPosition,
  isMetaTag,
  moveTimelineTag,
  setTimelineTagParent,
  setTimelineTagItemPosition,
} from "../lib/timeline/tags";
import {
  addTimelineItem,
  deleteTimelineItem,
  duplicateTimelineItem,
  removeTagFromTimelineItems,
  renameTagOnTimelineItems,
  updateTimelineItem,
} from "../lib/timeline/itemActions";
import {
  getDescendantIds,
  getLineageIds,
  getLineageLinks,
  getStudentLineageIds,
} from "../lib/timeline/lineage";
import { getLineageBounds, getLineageRoutes } from "../lib/timeline/lineageRoutes";
import { onPersistError } from "../lib/timeline/storage";
import { useTimelineItems } from "./useTimelineItems";
import { useLayoutStableItems } from "./useLayoutStableItems";
import PointerOverlay from "./PointerOverlay";
import { pointerStore } from "./pointerStore";
import { applyLiveTransforms, setAxisElement, setTicksElement, setWorldElement } from "./liveView";
import { buildItemDataWithTagPosition, itemToFormState } from "../lib/timeline/itemForm";
import type { AddItemFormHandle } from "./AddItemForm";
import {
  downloadTimelineCategory,
  downloadTimelineCsv,
  importTimelineCategory,
  importTimelineCsv,
  mergeTimelineCategoryItems,
} from "../lib/timeline/dataExchange";

const AddItemForm = dynamic(() => import("./AddItemForm"), {
  ssr: false,
  loading: () => null,
});
const TimelineItemList = dynamic(() => import("./TimelineItemList"), {
  ssr: false,
  loading: () => null,
});
const TagFilterPanel = dynamic(() => import("./TagFilterPanel"), {
  ssr: false,
  loading: () => null,
});

// ─────────────────────────────────────
// TIMELINE COMPONENT
// ─────────────────────────────────────

function useRafThrottle(callback: (clientX: number, clientY: number) => void) {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number | null>(null);
  const latestCoordinatesRef = useRef<{ clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    latestCoordinatesRef.current = null;
  }, []);

  const schedule = useCallback((clientX: number, clientY: number) => {
    latestCoordinatesRef.current = { clientX, clientY };
    if (frameRef.current !== null) return;

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const coordinates = latestCoordinatesRef.current;
      latestCoordinatesRef.current = null;
      if (coordinates) callbackRef.current(coordinates.clientX, coordinates.clientY);
    });
  }, []);

  useEffect(() => cancel, [cancel]);

  return { schedule, cancel };
}

let cachedItemRowItems: TimelineItem[] | null = null;
let cachedItemRowPixelsPerYear: number | null = null;
let cachedOriginalItemRows: Map<number, number> | null = null;

function getOriginalItemRows(
  items: TimelineItem[],
  pixelsPerYear: number
) {
  if (
    cachedOriginalItemRows &&
    cachedItemRowPixelsPerYear === pixelsPerYear &&
    cachedItemRowItems &&
    haveSameItemLayout(cachedItemRowItems, items, false)
  ) {
    return cachedOriginalItemRows;
  }

  cachedItemRowPixelsPerYear = pixelsPerYear;
  cachedItemRowItems = items;
  cachedOriginalItemRows = getItemRows(items, pixelsPerYear);
  return cachedOriginalItemRows;
}

let cachedTeacherOptions: {
  editingItemId: number | null;
  inputs: { id: number; title: string; teacherIds?: number[] }[];
  options: { id: number; title: string }[];
} | null = null;

function getTeacherOptions(items: TimelineItem[], editingItemId: number | null) {
  const cached = cachedTeacherOptions;
  if (
    cached &&
    cached.editingItemId === editingItemId &&
    cached.inputs.length === items.length &&
    cached.inputs.every((input, index) => {
      const item = items[index];
      return input.id === item.id &&
        input.title === item.title &&
        input.teacherIds === item.teacherIds;
    })
  ) {
    return cached.options;
  }

  const descendantIds = editingItemId === null
    ? new Set<number>()
    : getDescendantIds(items, editingItemId);

  const options = items
    .filter((item) => item.id !== editingItemId && !descendantIds.has(item.id))
    .map(({ id, title }) => ({ id, title }))
    .sort((first, second) => first.title.localeCompare(second.title));
  cachedTeacherOptions = {
    editingItemId,
    inputs: items.map(({ id, title, teacherIds }) => ({ id, title, teacherIds })),
    options,
  };
  return options;
}

// Pixels of items and ticks rendered beyond the viewport; a drag commits to state after half of it.
const PAN_PADDING_PX = 400;

function getAxisLayout(viewportHeight: number, verticalOffset: number) {
  const axisY = viewportHeight / 2 + verticalOffset;
  const needsPinning = axisY < 0 || axisY + 34 > viewportHeight;
  const pinnedToTop = needsPinning && axisY < 0;
  const rendered = needsPinning
    ? pinnedToTop
      ? 8
      : Math.max(8, viewportHeight - 40)
    : axisY;
  return { axisY, needsPinning, pinnedToTop, rendered };
}

export default function Timeline() {
  // ─────────────────────────────────────
  // TIMELINE DATA
  // ─────────────────────────────────────

  const [items, setItems] =
    useTimelineItems();

  const [tags, setTags] =
    useTimelineTags();

  // ─────────────────────────────────────
  // VIEW STATE
  //
  // viewPosition is a continuous internal
  // historical coordinate.
  //
  // It allows the timeline to move smoothly
  // across BC → CE.
  // ─────────────────────────────────────

  const [viewPosition, setViewPosition] =
    useState(
      dateToNumber({
        year: 800,
        era: "CE",
      })
    );

  const [zoom, setZoom] = useState(1);

  const [pixelsPerYear, setPixelsPerYear] =
    useState(PIXELS_PER_YEAR);

  const [calendarMode, setCalendarMode] =
    useState<CalendarMode>("gregorian");

  const [verticalOffset, setVerticalOffset] =
    useState(0);

  // ─────────────────────────────────────
  // SELECTED ITEM
  // ─────────────────────────────────────

  const [selectedItemId, setSelectedItemId] =
    useState<number | null>(null);

  const [showMetaTags, setShowMetaTags] =
    useState(false);

  const [highlightedItemId, setHighlightedItemId] =
    useState<number | null>(null);

  const [lineageItemId, setLineageItemId] =
    useState<number | null>(null);

  const [hoveredLineageItemId, setHoveredLineageItemId] =
    useState<number | null>(null);

  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    const syncShift = (event: KeyboardEvent) => setShiftHeld(event.shiftKey);
    const releaseShift = () => setShiftHeld(false);

    window.addEventListener("keydown", syncShift);
    window.addEventListener("keyup", syncShift);
    window.addEventListener("blur", releaseShift);
    return () => {
      window.removeEventListener("keydown", syncShift);
      window.removeEventListener("keyup", syncShift);
      window.removeEventListener("blur", releaseShift);
    };
  }, []);

  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  // ─────────────────────────────────────
  // DRAG STATE
  // ─────────────────────────────────────

  const [isDragging, setIsDragging] =
    useState(false);

  const dragStartX = useRef(0);

  const dragStartY = useRef(0);

  const dragStartPosition = useRef(
    dateToNumber({
      year: 800,
      era: "CE",
    })
  );

  const dragStartVerticalOffset =
    useRef(0);

  // Determines whether the current
  // pointer interaction became a drag.
  const hasDragged = useRef(false);

  // ─────────────────────────────────────
  // FORM STATE
  // ─────────────────────────────────────

  const [showAddForm, setShowAddForm] =
    useState(false);

  const [editMode, setEditMode] =
    useState(false);

  const [editingItemId, setEditingItemId] =
    useState<number | null>(null);

  // Tracks whether the current edit was opened from the item list,
  // so the form can offer a way back to it.
  const [editingFromList, setEditingFromList] =
    useState(false);

  const [showItemList, setShowItemList] =
    useState(false);

  const itemListScrollTop = useRef(0);

  const [showTagPanel, setShowTagPanel] =
    useState(false);

  const [activeTagNames, setActiveTagNames] =
    useState<string[]>([]);

  // Initial values for the open form; AddItemForm owns the draft after mount.
  const [formSeed, setFormSeed] = useState<ItemFormState>(initialItemFormState);
  const formHandleRef = useRef<AddItemFormHandle>(null);

  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => onPersistError(setDataError), []);

  const clearDataError = useCallback(() => setDataError(null), []);

  const closeDetails = useCallback(() => {
    setSelectedItemId(null);
    setShowMetaTags(false);
  }, []);

  const closeItemEditor = useCallback(() => {
    setShowAddForm(false);
    setEditingItemId(null);
    setEditingFromList(false);
  }, []);

  useEscapeLayer(selectedItemId !== null, closeDetails);
  useEscapeLayer(showMetaTags, () => setShowMetaTags(false));
  useEscapeLayer(showAddForm, closeItemEditor);
  useEscapeLayer(showItemList, () => setShowItemList(false));
  useEscapeLayer(showTagPanel, () => setShowTagPanel(false));
  useEscapeLayer(lineageItemId !== null, () => setLineageItemId(null));

  const detailRef = useRef<HTMLDivElement>(null);
  const [detailHeight, setDetailHeight] = useState(320);
  const { schedule: scheduleDetailHeight } = useRafThrottle((height) => {
    setDetailHeight(height);
  });

  useEffect(() => {
    const element = detailRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => scheduleDetailHeight(element.offsetHeight, 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedItemId, scheduleDetailHeight]);

  // ─────────────────────────────────────
  // SCREEN DIMENSIONS
  // ─────────────────────────────────────

  const [viewportSize, setViewportSize] =
    useState({
      width: 1200,
      height: 800,
    });
  const { schedule: scheduleViewportSize } = useRafThrottle((width, height) => {
    setViewportSize({ width, height });
  });

  useEffect(() => {
    function updateViewportSize() {
      scheduleViewportSize(window.innerWidth, window.innerHeight);
    }

    updateViewportSize();
    window.addEventListener(
      "resize",
      updateViewportSize
    );

    return () => {
      window.removeEventListener(
        "resize",
        updateViewportSize
      );
    };
  }, [scheduleViewportSize]);

  const viewportWidth =
    viewportSize.width;

  const viewportHeight =
    viewportSize.height;

  // ─────────────────────────────────────
  // TIMELINE AXIS POSITION
  // ─────────────────────────────────────

  const {
    axisY,
    needsPinning: axisNeedsPinning,
    pinnedToTop: axisPinnedToTop,
    rendered: renderedAxisY,
  } = getAxisLayout(viewportHeight, verticalOffset);

  const pointerYearBannerTop =
    axisPinnedToTop ? 56 : 12;

  // Live view state: during a drag these run ahead of viewPosition/verticalOffset and are applied to the DOM directly.
  const livePositionRef = useRef(viewPosition);
  const liveOffsetRef = useRef(verticalOffset);
  const isDraggingRef = useRef(false);
  const layoutRef = useRef({
    pixelsPerYear,
    zoom,
    viewportHeight,
    viewPosition,
    renderedAxisY,
    axisNeedsPinning,
    axisPinnedToTop,
  });

  const applyLiveView = useCallback(() => {
    const layout = layoutRef.current;
    const position = livePositionRef.current;
    const live = getAxisLayout(layout.viewportHeight, liveOffsetRef.current);
    const worldX = -position * layout.pixelsPerYear * layout.zoom;
    const axisShift = live.rendered - layout.renderedAxisY;

    applyLiveTransforms(worldX, live.axisY, axisShift);
    pointerStore.set({ position });
  }, []);

  const commitLiveView = useCallback(() => {
    setViewPosition(livePositionRef.current);
    setVerticalOffset(liveOffsetRef.current);
  }, []);

  // Commits when the live view leaves the padded render window or the axis changes pinning.
  const commitLiveViewIfNeeded = useCallback(() => {
    const layout = layoutRef.current;
    const live = getAxisLayout(layout.viewportHeight, liveOffsetRef.current);
    const panned = Math.abs(livePositionRef.current - layout.viewPosition) *
      layout.pixelsPerYear * layout.zoom;
    if (
      panned > PAN_PADDING_PX / 2 ||
      live.needsPinning !== layout.axisNeedsPinning ||
      live.pinnedToTop !== layout.axisPinnedToTop
    ) {
      commitLiveView();
    }
  }, [commitLiveView]);

  // Sets both the live refs and committed state, for actions that read or replace the view.
  const setView = useCallback((position: number, offset: number) => {
    livePositionRef.current = position;
    liveOffsetRef.current = offset;
    setViewPosition(position);
    setVerticalOffset(offset);
  }, []);

  useLayoutEffect(() => {
    layoutRef.current = {
      pixelsPerYear,
      zoom,
      viewportHeight,
      viewPosition,
      renderedAxisY,
      axisNeedsPinning,
      axisPinnedToTop,
    };
    if (!isDraggingRef.current) {
      livePositionRef.current = viewPosition;
      liveOffsetRef.current = verticalOffset;
    }
    applyLiveView();
  });

  // ─────────────────────────────────────
  // HISTORICAL DATE → SCREEN POSITION
  // ─────────────────────────────────────

  const getRelativePosition = useCallback((date: HistoricalDate) => {
    const historicalPosition =
      dateToNumber(date);

    return (
      (historicalPosition - viewPosition) *
      pixelsPerYear *
      zoom
    );
  }, [viewPosition, pixelsPerYear, zoom]);

  // Independent of viewPosition, verticalOffset and viewport size, so panning leaves item props unchanged.
  const getWorldPosition = useCallback(
    (date: HistoricalDate) => dateToNumber(date) * pixelsPerYear * zoom,
    [pixelsPerYear, zoom]
  );

  function renderYearLabel(year: number) {
    const [yearNumber, era] =
      getYearLabel(year).split(" ");

    return (
      <>
        {yearNumber}
        <sup
          style={{
            fontSize:
              "0.55em",
            verticalAlign:
              "super",
            marginLeft:
              "2px",
          }}
        >
          {era}
        </sup>
      </>
    );
  }

  function renderDateLabel(date: HistoricalDate) {
    const monthDayLabel = getMonthDayLabel(date);

    return (
      <>
        {monthDayLabel && `${monthDayLabel} `}
        {renderYearLabel(dateToNumber(date))}
        {date.approximate && (
          <sup style={{ marginLeft: "3px", fontSize: "0.6em", letterSpacing: "0.04em" }}>
            APRX
          </sup>
        )}
      </>
    );
  }

  function renderHijriYearLabel(
    gregorianYear: number
  ) {
    return (
      <>
        {getHijriYear(gregorianYear)}
        <sup
          style={{
            fontSize: "0.55em",
            verticalAlign: "super",
            marginLeft: "2px",
          }}
        >
          AH
        </sup>
      </>
    );
  }

  function renderTimelineYearLabel(
    year: number
  ) {
    return calendarMode === "hijri"
      ? renderHijriYearLabel(year)
      : renderYearLabel(year);
  }

  // ─────────────────────────────────────
  // ITEM CLICK
  //
  // This is deliberately handled directly
  // by the item rather than relying on the
  // canvas click handler.
  // ─────────────────────────────────────

  function handleItemClick(
    event: React.MouseEvent,
    itemId: number
  ) {
    event.stopPropagation();

    // A click should always open the item,
    // provided the pointer did not actually
    // move as a drag.
    const wasDragged = hasDragged.current;
    hasDragged.current = false;
    if (wasDragged) {
      return;
    }

    setShowMetaTags(false);

    const item = items.find(
      (currentItem) =>
        currentItem.id === itemId
    );

    if (editMode && item) {
      startEditingItem(item);
      setSelectedItemId(null);
      return;
    }

    setSelectedItemId(itemId);
  }

  const startEditingItem = useCallback((item: TimelineItem, fromList = false) => {
    setEditingItemId(item.id);
    setEditingFromList(fromList);
    setFormSeed(itemToFormState(item));
    setShowAddForm(true);
    setShowItemList(false);
    setSelectedItemId(null);
    setShowMetaTags(false);
  }, []);

  const handleTimelineListSelect = useCallback(
    (item: TimelineItem) => startEditingItem(item, true),
    [startEditingItem]
  );
  const handleTimelineListClose = useCallback(
    () => setShowItemList(false),
    []
  );

  // ─────────────────────────────────────
  // ITEM POINTER DOWN
  //
  // Starts the same canvas drag as clicking
  // the background, so panning still works
  // while pressing on an item.
  // ─────────────────────────────────────

  function beginDrag(event: React.PointerEvent) {
    setIsDragging(true);
    isDraggingRef.current = true;

    hasDragged.current = false;

    dragStartX.current =
      event.clientX;

    dragStartY.current =
      event.clientY;

    dragStartPosition.current =
      livePositionRef.current;

    dragStartVerticalOffset.current =
      liveOffsetRef.current;

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  }

  function handleItemPointerDown(
    event: React.PointerEvent
  ) {
    event.stopPropagation();
    beginDrag(event);
  }

  // Items are memoized, so they get constant callbacks that forward to the latest handlers.
  const itemHandlers = useRef({
    pointerDown: handleItemPointerDown,
    click: handleItemClick,
    enter: (itemId: number) => {
      if (lineageItemId !== null) setHoveredLineageItemId(itemId);
    },
  });

  useEffect(() => {
    itemHandlers.current = {
      pointerDown: handleItemPointerDown,
      click: handleItemClick,
      enter: (itemId: number) => {
        if (lineageItemId !== null) setHoveredLineageItemId(itemId);
      },
    };
  });

  const onItemPointerDown = useCallback(
    (event: React.PointerEvent) => itemHandlers.current.pointerDown(event),
    []
  );
  const onItemClick = useCallback(
    (event: React.MouseEvent, itemId: number) => itemHandlers.current.click(event, itemId),
    []
  );
  const onItemPointerEnter = useCallback(
    (itemId: number) => itemHandlers.current.enter(itemId),
    []
  );
  const onItemPointerLeave = useCallback(() => setHoveredLineageItemId(null), []);

  // ─────────────────────────────────────
  // CLOSE DETAIL WINDOW
  // ─────────────────────────────────────

  const backToItemList = useCallback(() => {
    closeItemEditor();
    setShowItemList(true);
  }, [closeItemEditor]);

  const startAddingItem = useCallback(() => {
    if (showAddForm) {
      closeItemEditor();
      return;
    }

    setFormSeed(initialItemFormState);
    setEditingItemId(null);
    setShowAddForm(true);
  }, [showAddForm, closeItemEditor]);

  const handleCreateTag = useCallback((nameValue: string, color: string) => {
    const tag = createTimelineTag(tags, nameValue, color);
    if (!tag) return null;

    setTags((currentTags) => [
      ...currentTags,
      tag,
    ]);
    return tag.name;
  }, [tags, setTags]);

  const handleCreateTagFromMenu = useCallback((nameValue: string, color: string) => {
    const tag = createTimelineTag(tags, nameValue, color);
    if (!tag) return false;

    setTags((currentTags) => [
      ...currentTags,
      tag,
    ]);
    return true;
  }, [tags, setTags]);

  const handleRenameTag = useCallback((oldName: string, requestedName: string) => {
    const newName = requestedName.trim();
    if (!newName || tags.some((tag) => tag.name === newName && tag.name !== oldName)) {
      return false;
    }
    if (newName === oldName) return true;

    setTags((currentTags) => currentTags.map((tag) => ({
      ...tag,
      name: tag.name === oldName ? newName : tag.name,
      ...(tag.parentName === oldName ? { parentName: newName } : {}),
    })));
    setItems((currentItems) =>
      renameTagOnTimelineItems(currentItems, oldName, newName)
    );
    formHandleRef.current?.update((currentForm) => ({
      tags: currentForm.tags.map((name) => name === oldName ? newName : name),
    }));
    setActiveTagNames((currentNames) =>
      currentNames.map((name) => name === oldName ? newName : name)
    );
    return true;
  }, [tags, setItems, setTags]);

  const handleChangeTagColor = useCallback((tagName: string, color: string) => {
    setTags((currentTags) => currentTags.map((tag) =>
      tag.name === tagName ? { ...tag, color } : tag
    ));
  }, [setTags]);

  const handleChangeTagItemPosition = useCallback((
    tagName: string,
    position: "above" | "below" | null
  ) => {
    const updatedAt = Math.max(
      Date.now(),
      ...tags.map((tag) => (tag.itemPositionUpdatedAt ?? 0) + 1)
    );
    const updatedTags = setTimelineTagItemPosition(
      tags,
      tagName,
      position ?? undefined,
      updatedAt
    );
    setTags(updatedTags);
    setItems((currentItems) => currentItems.map((item) => {
      if (!item.tags.includes(tagName)) return item;
      const itemPosition = getTagItemPosition(updatedTags, item.tags);
      return itemPosition ? { ...item, position: itemPosition } : item;
    }));
  }, [tags, setItems, setTags]);

  const handleDeleteTag = useCallback((tagName: string) => {
    setTags((currentTags) => deleteTimelineTag(currentTags, tagName));
    setItems((currentItems) => removeTagFromTimelineItems(currentItems, tagName));
    formHandleRef.current?.update((currentForm) => ({
      tags: currentForm.tags.filter((name) => name !== tagName),
    }));
    setActiveTagNames((currentNames) =>
      currentNames.filter((name) => name !== tagName)
    );
  }, [setItems, setTags]);

  const duplicateEditingItem = useCallback(() => {
    if (editingItemId === null) return;

    // Save pending edits first so the copy includes them.
    formHandleRef.current?.flush();
    setItems((currentItems) =>
      duplicateTimelineItem(currentItems, editingItemId)
    );
    closeItemEditor();
  }, [editingItemId, closeItemEditor, setItems]);

  const deleteEditingItem = useCallback(() => {
    if (editingItemId === null) return;

    formHandleRef.current?.discard();
    setItems((currentItems) => deleteTimelineItem(currentItems, editingItemId));
    if (lineageItemId === editingItemId) setLineageItemId(null);
    closeItemEditor();
  }, [editingItemId, lineageItemId, closeItemEditor, setItems]);

  // ─────────────────────────────────────
  // ZOOM
  // ─────────────────────────────────────

  function handleWheel(
    event: React.WheelEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    if (event.buttons & 2) {
      const spacingChange =
        event.deltaY < 0
          ? 0.1
          : -0.1;

      setPixelsPerYear((currentSpacing) =>
        Math.min(
          Math.max(
            currentSpacing + spacingChange,
            0.1
          ),
          10
        )
      );

      return;
    }

    const zoomFactor =
      event.deltaY < 0
        ? 1.15
        : 0.87;

    const newZoom = Math.min(
      Math.max(
        zoom * zoomFactor,
        0.25
      ),
      5
    );

    const mouseOffsetFromCenter =
      event.clientX - viewportWidth / 2;

    const livePosition = livePositionRef.current;
    const liveOffset = liveOffsetRef.current;

    const historicalPositionUnderMouse =
      livePosition +
      mouseOffsetFromCenter /
        (pixelsPerYear * zoom);

    const newViewPosition =
      historicalPositionUnderMouse -
      mouseOffsetFromCenter /
        (pixelsPerYear * newZoom);

    const mouseOffsetFromAxis =
      event.clientY - (viewportHeight / 2 + liveOffset);

    const newVerticalOffset =
      liveOffset +
      mouseOffsetFromAxis *
        (1 - newZoom / zoom);

    setView(newViewPosition, newVerticalOffset);
    setZoom(newZoom);
  }

  const zoomBy = useCallback((factor: number) => {
    setZoom((currentZoom) =>
      Math.min(Math.max(currentZoom * factor, 0.25), 5)
    );
  }, []);

  const resetView = useCallback(() => {
    setView(dateToNumber({ year: 800, era: "CE" }), 0);
    setZoom(1);
  }, [setView]);

  const handleSearchSelect = useCallback((item: TimelineItem) => {
    const searchLineageIds = lineageItemId === null
      ? null
      : getLineageIds(items, lineageItemId);
    const row = getItemRows(items, pixelsPerYear, searchLineageIds ?? undefined).get(item.id) ?? 0;
    const itemDistance = getItemDistance(row, zoom);
    setActiveTagNames([]);
    setView(
      dateToNumber(item.startDate),
      item.position === "above" ? itemDistance : -itemDistance
    );
    setHighlightedItemId(item.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightedItemId(null);
      highlightTimer.current = null;
    }, 2400);
  }, [lineageItemId, items, pixelsPerYear, zoom, setView]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleZoomIn = useCallback(() => zoomBy(1.25), [zoomBy]);
  const handleZoomOut = useCallback(() => zoomBy(0.8), [zoomBy]);

  // ─────────────────────────────────────
  // START DRAGGING
  // ─────────────────────────────────────

  function handlePointerDown(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    beginDrag(event);
  }

  // ─────────────────────────────────────
  // MOVE TIMELINE CANVAS
  // ─────────────────────────────────────

  function applyPointerMove(clientX: number, clientY: number) {
    pointerStore.set({ x: clientX });
    if (!isDraggingRef.current) {
      return;
    }

    const deltaX =
      clientX -
      dragStartX.current;

    const deltaY =
      clientY -
      dragStartY.current;

    // Once the pointer moves more than a
    // few pixels, this is definitely a drag.

    if (
      Math.abs(deltaX) > 4 ||
      Math.abs(deltaY) > 4
    ) {
      hasDragged.current = true;
    }

    // ───────────────────────────────────
    // HORIZONTAL MOVEMENT
    // ───────────────────────────────────

    const positionMoved =
      deltaX /
      (pixelsPerYear * zoom);

    livePositionRef.current =
      dragStartPosition.current -
        positionMoved;

    // ───────────────────────────────────
    // VERTICAL MOVEMENT
    // ───────────────────────────────────

    liveOffsetRef.current =
      dragStartVerticalOffset.current +
        deltaY;

    applyLiveView();
    commitLiveViewIfNeeded();
  }

  const { schedule: schedulePointerMove, cancel: cancelScheduledPointerMove } =
    useRafThrottle(applyPointerMove);

  useEffect(() => {
    const stopDraggingOnBlur = () => {
      cancelScheduledPointerMove();
      isDraggingRef.current = false;
      commitLiveView();
      setIsDragging(false);
    };

    window.addEventListener("blur", stopDraggingOnBlur);
    return () => window.removeEventListener("blur", stopDraggingOnBlur);
  }, [cancelScheduledPointerMove, commitLiveView]);

  function handlePointerMove(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    const { clientX, clientY } = event;
    schedulePointerMove(clientX, clientY);
  }

  function handlePointerLeave() {
    cancelScheduledPointerMove();
    pointerStore.set({ x: null });
  }

  // ─────────────────────────────────────
  // STOP DRAGGING
  // ─────────────────────────────────────

  function handlePointerUp(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    const { clientX, clientY } = event;
    cancelScheduledPointerMove();
    applyPointerMove(clientX, clientY);
    isDraggingRef.current = false;
    commitLiveView();
    setIsDragging(false);

    try {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // Pointer capture may already have
      // been released.
    }
  }

  const handleCommitEditedItem = useCallback((itemData: Omit<TimelineItem, "id">) => {
    if (editingItemId === null) return;
    setItems((currentItems) =>
      updateTimelineItem(currentItems, editingItemId, itemData)
    );
  }, [editingItemId, setItems]);

  // ─────────────────────────────────────
  // ADD TIMELINE ITEM
  // ─────────────────────────────────────

  const handleAddItem = useCallback((form: ItemFormState) => {
    const itemDataWithTagPosition = buildItemDataWithTagPosition(form, tags);
    if (!itemDataWithTagPosition) {
      setDataError("Enter a name and valid whole-number dates. A period must end on or after its start date.");
      return;
    }

    if (editingItemId !== null) {
      // Edits are saved as the form changes; just close the form.
      closeItemEditor();
      return;
    }

    setItems((currentItems) => addTimelineItem(currentItems, itemDataWithTagPosition));

    setShowAddForm(false);
  }, [tags, editingItemId, closeItemEditor, setItems]);


  const handleImport = useCallback((file: File) => {
    file.text()
      .then((csv) => {
        const imported = importTimelineCsv(csv);
        setItems(imported.items);
        setTags(imported.tags);
        setLineageItemId(null);
        setDataError(null);
      })
      .catch((error: unknown) => {
        setDataError(
          error instanceof Error
            ? error.message
            : "Could not import this CSV."
        );
      });
  }, [setItems, setTags]);

  const handleCategoryImport = useCallback((file: File) => {
    file.text()
      .then((json) => {
        const imported = importTimelineCategory(json);
        setTags((currentTags) => {
          const tagsByName = new Map(
            currentTags.map((tag) => [tag.name, tag])
          );
          imported.tags.forEach((tag) => {
            if (!tagsByName.has(tag.name)) {
              tagsByName.set(tag.name, tag);
            }
          });
          tagsByName.set(imported.category.name, imported.category);
          return Array.from(tagsByName.values());
        });
        setItems((currentItems) =>
          mergeTimelineCategoryItems(currentItems, imported.items, imported.teacherReferences)
        );
        setDataError(null);
      })
      .catch((error: unknown) => {
        setDataError(
          error instanceof Error
            ? error.message
            : "Could not import this category."
        );
      });
  }, [setItems, setTags]);

  const handleExportTimeline = useCallback(
    () => downloadTimelineCsv(items, tags),
    [items, tags]
  );
  const handleExportCategory = useCallback(
    (category: TimelineTag) => downloadTimelineCategory(category, items, tags),
    [items, tags]
  );
  const handleChangeTagMeta = useCallback((tagName: string, isMeta: boolean) => {
    setTags((currentTags) => currentTags.map((tag) =>
      tag.name === tagName ? { ...tag, isMeta } : tag
    ));
  }, [setTags]);
  const handleMoveTag = useCallback((tagName: string, direction: -1 | 1) => {
    setTags((currentTags) => moveTimelineTag(currentTags, tagName, direction));
  }, [setTags]);
  const handleSetTagParent = useCallback((tagName: string, parentName: string | null) => {
    setTags((currentTags) => setTimelineTagParent(currentTags, tagName, parentName));
  }, [setTags]);
  const handleToggleTag = useCallback((tagName: string) => {
    setActiveTagNames((currentTags) =>
      currentTags.includes(tagName)
        ? currentTags.filter((name) => name !== tagName)
        : [...currentTags, tagName]
    );
  }, []);
  const handleCloseTagPanel = useCallback(() => setShowTagPanel(false), []);

  // ─────────────────────────────────────
  // VISIBLE HISTORICAL RANGE
  // ─────────────────────────────────────

  const yearsVisible =
    viewportWidth /
    (pixelsPerYear * zoom);

  // At least PAN_PADDING_PX on each side, so a drag can run ahead of state before a commit is needed.
  const panPaddingYears =
    Math.max(100, PAN_PADDING_PX / (pixelsPerYear * zoom));

  const startVisibleYear =
    viewPosition -
    yearsVisible / 2 -
    panPaddingYears;

  const endVisibleYear =
    viewPosition +
    yearsVisible / 2 +
    panPaddingYears;

  // ─────────────────────────────────────
  // TICK GENERATION
  // ─────────────────────────────────────

  const minorInterval = useMemo(
    () => getMinorTickInterval(pixelsPerYear, zoom),
    [pixelsPerYear, zoom]
  );

  const labelInterval = useMemo(
    () => getLabelInterval(pixelsPerYear, zoom),
    [pixelsPerYear, zoom]
  );

  const itemLabelFontSize =
    20 * zoom;

  const visibleItems = useMemo(
    () => filterItemsByTags(items, activeTagNames, tags),
    [items, activeTagNames, tags]
  );
  const renderItems = useMemo(
    () => visibleItems.filter((item) =>
      isItemInRenderRange(
        startVisibleYear,
        endVisibleYear,
        pixelsPerYear,
        zoom,
        item
      )
    ),
    [visibleItems, startVisibleYear, endVisibleYear, pixelsPerYear, zoom]
  );

  const originalItemRows = getOriginalItemRows(
    visibleItems,
    pixelsPerYear
  );
  // Lineage layout ignores colour, description and text colour, so those edits keep this array.
  const lineageLayoutItems = useLayoutStableItems(visibleItems);
  const lineageZoom = useDeferredValue(zoom);
  const lineageIds = useMemo(
    () => lineageItemId === null
      ? null
      : getStudentLineageIds(lineageLayoutItems, lineageItemId),
    [lineageLayoutItems, lineageItemId]
  );
  const lineageLinks = useMemo(
    () => lineageIds ? getLineageLinks(lineageLayoutItems, lineageIds) : [],
    [lineageLayoutItems, lineageIds]
  );
  const lineageTeacherIds = useMemo(
    () => new Set(lineageLinks.map(({ teacherId }) => teacherId)),
    [lineageLinks]
  );
  const lineageItemRows = useMemo(() => {
    if (!lineageIds || lineageItemId === null) return originalItemRows;

    const pinnedLineageItem = {
      id: lineageItemId,
      row: originalItemRows.get(lineageItemId) ?? 0,
    };
    const packedRows = getItemRows(lineageLayoutItems, pixelsPerYear, lineageIds, pinnedLineageItem, lineageTeacherIds);
    return optimizeLineageRows(
      lineageLayoutItems,
      pixelsPerYear,
      packedRows,
      lineageIds,
      lineageLinks,
      lineageItemId,
      lineageTeacherIds
    );
  }, [lineageLayoutItems, pixelsPerYear, lineageIds, lineageItemId, originalItemRows, lineageLinks, lineageTeacherIds]);
  const normalizedLineageNodes = useMemo(
    () => lineageIds
      ? lineageLayoutItems
          .filter((item) => lineageIds.has(item.id))
          .map((item) => {
            const row = lineageItemRows.get(item.id) ?? 0;
            const start = dateToNumber(item.startDate);
            const x = start * pixelsPerYear * lineageZoom;

            return {
              item,
              row,
              x,
              endX: item.endDate
                ? dateToNumber(item.endDate) * pixelsPerYear * lineageZoom
                : x,
              y: getItemY(item, row, 0, lineageZoom),
            };
          })
      : [],
    [lineageLayoutItems, lineageIds, lineageItemRows, pixelsPerYear, lineageZoom]
  );
  const normalizedLineageRoutes = useMemo(
    () => lineageIds
      ? getLineageRoutes(normalizedLineageNodes, lineageLinks, 0, lineageZoom)
      : [],
    [lineageIds, normalizedLineageNodes, lineageLinks, lineageZoom]
  );
  // Route coordinates are in deferred-zoom pixels; the group is scaled by zoom / lineageZoom while it catches up.
  const routeCullStartYear = Math.floor(startVisibleYear / 500) * 500;
  const routeCullEndYear = Math.ceil(endVisibleYear / 500) * 500;
  const routeVisibleLeft = routeCullStartYear * pixelsPerYear * lineageZoom;
  const routeVisibleRight = routeCullEndYear * pixelsPerYear * lineageZoom;
  const renderLineageRoutes = useMemo(
    () => normalizedLineageRoutes.filter((route) => {
      let left = Infinity;
      let right = -Infinity;
      route.points.forEach((point) => {
        left = Math.min(left, point.x);
        right = Math.max(right, point.x);
      });
      return right >= routeVisibleLeft && left <= routeVisibleRight;
    }),
    [normalizedLineageRoutes, routeVisibleLeft, routeVisibleRight]
  );
  // Holding Shift flips the hover from the box's students to its teachers.
  const hoveredLinkedIds = useMemo(
    () => new Set(normalizedLineageRoutes.flatMap((route) => {
      if (route.teacherId === hoveredLineageItemId && !shiftHeld) return [route.studentId];
      if (route.studentId === hoveredLineageItemId && shiftHeld) return [route.teacherId];
      return [];
    })),
    [normalizedLineageRoutes, hoveredLineageItemId, shiftHeld]
  );
  const normalizedLineageBounds = useMemo(
    () => lineageIds
      ? getLineageBounds(
          normalizedLineageNodes,
          normalizedLineageRoutes,
          16 * lineageZoom,
          lineageZoom,
          normalizedLineageNodes.find((node) => node.item.id === lineageItemId)?.y
        )
      : null,
    [lineageIds, normalizedLineageNodes, normalizedLineageRoutes, lineageZoom, lineageItemId]
  );
  const routeRange = useMemo(
    () => normalizedLineageBounds
      ? {
          start: normalizedLineageBounds.left / (pixelsPerYear * lineageZoom),
          end: normalizedLineageBounds.right / (pixelsPerYear * lineageZoom),
        }
      : null,
    [normalizedLineageBounds, pixelsPerYear, lineageZoom]
  );
  const clearanceRows = useMemo(
    () => normalizedLineageBounds
      ? getLineageClearanceRows(normalizedLineageBounds, 0, lineageZoom)
      : { above: null, below: null },
    [normalizedLineageBounds, lineageZoom]
  );
  const lineageRouteElements = useMemo(
    () => {
      const pathGroups = new Map<string, {
        commands: string[];
        color: string;
        opacity: number;
        lineWidth: number;
        dashed: boolean;
        highlighted: boolean;
      }>();
      const arrowPathGroups = new Map<string, {
        commands: string[];
        color: string;
        opacity: number;
        highlighted: boolean;
      }>();
      renderLineageRoutes.forEach(({ teacherId, studentId, dashed, segments, arrow }) => {
        const highlighted = hoveredLineageItemId === (shiftHeld ? studentId : teacherId);
        const lineWidth = highlighted ? Math.max(2.5, 3 * lineageZoom) : Math.max(1.5, 2 * lineageZoom);
        segments.forEach(({ start, end, opacity }) => {
          const strokeOpacity = highlighted && opacity > 0.5 ? Math.max(opacity, 0.8) : opacity;
          const groupKey = `${highlighted}:${dashed}:${strokeOpacity}:${lineWidth}`;
          const group = pathGroups.get(groupKey);
          const command = `M${start.x} ${start.y}L${end.x} ${end.y}`;
          if (group) group.commands.push(command);
          else pathGroups.set(groupKey, {
            commands: [command],
            color: highlighted ? "#ffd166" : "#ddd",
            opacity: strokeOpacity,
            lineWidth,
            dashed,
            highlighted,
          });
        });

        const color = highlighted ? "#ffd166" : "#ddd";
        const arrowKey = `${highlighted}:${arrow.opacity}`;
        const angle = (arrow.angle * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rotatedPoint = (x: number, y: number) => ({
          x: arrow.tip.x + x * cos - y * sin,
          y: arrow.tip.y + x * sin + y * cos,
        });
        const first = rotatedPoint(-arrow.size * 2, -arrow.size * 0.8);
        const second = rotatedPoint(-arrow.size * 2, arrow.size * 0.8);
        const command = `M${arrow.tip.x} ${arrow.tip.y}L${first.x} ${first.y}L${second.x} ${second.y}Z`;
        const arrowGroup = arrowPathGroups.get(arrowKey);
        if (arrowGroup) arrowGroup.commands.push(command);
        else arrowPathGroups.set(arrowKey, {
          commands: [command],
          color,
          opacity: arrow.opacity,
          highlighted,
        });
      });

      return (
        <>
          {Array.from(pathGroups, ([key, group]) => (
            <path
              key={key}
              d={group.commands.join("")}
              fill="none"
              stroke={group.color}
              strokeOpacity={group.opacity}
              strokeWidth={group.lineWidth}
              strokeLinecap={group.dashed ? "butt" : "round"}
              strokeDasharray={group.dashed ? `${group.lineWidth * 2} ${group.lineWidth * 2}` : undefined}
              style={group.highlighted ? { filter: "drop-shadow(0 0 4px rgba(255,209,102,0.95))" } : undefined}
            />
          ))}
          {Array.from(arrowPathGroups, ([key, group]) => (
            <path
              key={`arrow-${key}`}
              d={group.commands.join("")}
              fill={group.color}
              fillOpacity={group.opacity}
              stroke="none"
              style={group.highlighted ? { filter: "drop-shadow(0 0 4px rgba(255,209,102,0.95))" } : undefined}
            />
          ))}
        </>
      );
    },
    [renderLineageRoutes, hoveredLineageItemId, shiftHeld, lineageZoom]
  );
  const clearThroughRows = useMemo(() => {
    const rows = { above: clearanceRows.above, below: clearanceRows.below };
    if (!lineageIds) return rows;

    lineageLayoutItems.forEach((item) => {
      if (!lineageIds.has(item.id)) return;
      const row = lineageItemRows.get(item.id) ?? 0;
      const band = rows[item.position];
      rows[item.position] = band
        ? { min: Math.min(band.min, row), max: Math.max(band.max, row) }
        : { min: row, max: row };
    });
    return rows;
  }, [clearanceRows, lineageLayoutItems, lineageIds, lineageItemRows]);
  const itemRows = useMemo(
    () => lineageIds
      ? getItemRowsAroundLineage(
          visibleItems,
          pixelsPerYear,
          originalItemRows,
          lineageItemRows,
          lineageIds,
          routeRange,
          clearThroughRows,
          lineageTeacherIds
        )
      : originalItemRows,
    [visibleItems, pixelsPerYear, originalItemRows, lineageItemRows, lineageIds, routeRange, clearThroughRows, lineageTeacherIds]
  );

  const teacherOptions = useMemo(
    () => getTeacherOptions(items, editingItemId),
    [items, editingItemId]
  );

  const ticks = useMemo(() => {
    const result: number[] = [];
    const firstTick = Math.floor(startVisibleYear / minorInterval) * minorInterval;

    for (let year = firstTick; year <= endVisibleYear; year += minorInterval) {
      result.push(year);
    }

    return result;
  }, [startVisibleYear, minorInterval, endVisibleYear]);

  // ─────────────────────────────────────
  // SELECTED ITEM
  // ─────────────────────────────────────

  const selectedItem = useMemo(
    () => selectedItemId === null
      ? undefined
      : visibleItems.find((item) => item.id === selectedItemId),
    [visibleItems, selectedItemId]
  );

  const tagByName = useMemo(
    () => new Map(tags.map((tag) => [tag.name, tag])),
    [tags]
  );
  const selectedNormalTagNames = useMemo(
    () => (selectedItem?.tags ?? []).filter((tagName) => !isMetaTag(tags, tagName)),
    [selectedItem, tags]
  );
  const selectedMetaTagNames = useMemo(
    () => (selectedItem?.tags ?? []).filter((tagName) => isMetaTag(tags, tagName)),
    [selectedItem, tags]
  );

  const selectedRow = selectedItem
    ? itemRows.get(selectedItem.id) ?? 0
    : 0;
  const selectedItemY = useMemo(
    () => selectedItem
      ? getItemY(selectedItem, selectedRow, axisY, zoom)
      : 0,
    [selectedItem, selectedRow, axisY, zoom]
  );

  let detailWindowPosition:
    | {
        x: number;
        top: number;
        height: number;
        itemX: number;
        itemEdgeY: number;
        boxEdgeY: number;
        showConnector: boolean;
      }
    | null = null;

  if (selectedItem) {
    let selectedItemX =
      viewportWidth / 2 +
      getRelativePosition(
        selectedItem.startDate
      );

    if (
      selectedItem.type === "period" &&
      selectedItem.endDate
    ) {
      selectedItemX =
        viewportWidth / 2 +
        (getRelativePosition(
          selectedItem.startDate
        ) +
          getRelativePosition(
            selectedItem.endDate
          )) /
          2;
    }

    const itemEdgeOffset =
      selectedItem.type === "event"
        ? 18 * zoom
        : 10 * zoom;
    const connectorLength = 35;
    const edgeMargin = 20;
    const gap = connectorLength + itemEdgeOffset;
    const height = Math.min(
      detailHeight,
      viewportHeight - edgeMargin * 2
    );
    const spaceAbove = selectedItemY - gap - edgeMargin;
    const spaceBelow = viewportHeight - edgeMargin - (selectedItemY + gap);
    const fitsAbove = spaceAbove >= height;
    const fitsBelow = spaceBelow >= height;
    const placeAbove =
      fitsAbove && fitsBelow
        ? selectedItemY > 340
        : fitsAbove
          ? true
          : fitsBelow
            ? false
            : spaceAbove > spaceBelow;
    const top = Math.min(
      Math.max(
        placeAbove ? selectedItemY - gap - height : selectedItemY + gap,
        edgeMargin
      ),
      Math.max(edgeMargin, viewportHeight - edgeMargin - height)
    );

    const controlsLeft =
      viewportWidth - 20 - 310;
    const detailHalfWidth = 180;
    const detailWouldOverlapControls =
      top < 360 &&
      selectedItemX + detailHalfWidth > controlsLeft;
    const rightLimit =
      detailWouldOverlapControls
        ? controlsLeft - 16 - detailHalfWidth
        : viewportWidth - detailHalfWidth - 20;
    const itemEdgeY =
      selectedItemY +
      (placeAbove ? -itemEdgeOffset : itemEdgeOffset);
    const boxEdgeY = placeAbove ? top + height : top;

    detailWindowPosition = {
      x: Math.min(
        Math.max(selectedItemX, detailHalfWidth + 20),
        Math.max(detailHalfWidth + 20, rightLimit)
      ),
      top,
      height,
      itemX: selectedItemX,
      itemEdgeY,
      boxEdgeY,
      showConnector: placeAbove
        ? boxEdgeY <= itemEdgeY
        : boxEdgeY >= itemEdgeY,
    };
  }

  // ─────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#29384b",
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      {/* ─────────────────────────────── */}
      {/* TIMELINE CANVAS */}
      {/* ─────────────────────────────── */}

      <div
        onWheel={handleWheel}
        onPointerDown={
          handlePointerDown
        }
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerUp={
          handlePointerUp
        }
        onPointerCancel={
          handlePointerUp
        }
        onContextMenu={(event) =>
          event.preventDefault()
        }
        onClick={() => {
          if (
            showAddForm &&
            !hasDragged.current
          ) {
            closeItemEditor();
          }

          if (!hasDragged.current) {
            closeDetails();
            closeItemEditor();
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          cursor: isDragging
            ? "grabbing"
            : "default",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <PointerOverlay
          viewportWidth={viewportWidth}
          pixelsPerYear={pixelsPerYear}
          zoom={zoom}
          bannerTop={pointerYearBannerTop}
          renderHijriYear={renderHijriYearLabel}
          renderTimelineYear={renderTimelineYearLabel}
        />

        {/* ───────────────────────────── */}
        {/* MOVING TIMELINE CANVAS */}
        {/* ───────────────────────────── */}

        <div
          style={{
            position:
              "absolute",
            left: "50%",
            top: 0,
            width: 0,
            height: "100%",
          }}
        >
          {axisNeedsPinning && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-50vw",
                top: `${Math.max(0, renderedAxisY - 8)}px`,
                width: "100vw",
                height: "48px",
                backgroundColor: "rgba(20, 31, 44, 0.82)",
                borderTop: "1px solid rgba(255,255,255,0.14)",
                borderBottom: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(5px)",
                pointerEvents: "none",
                zIndex: 6,
              }}
            />
          )}

          {/* ─────────────────────────── */}
          {/* HORIZONTAL AXIS */}
          {/* ─────────────────────────── */}

          <div
            ref={setAxisElement}
            style={{
              position:
                "absolute",
              left:
                "-50000px",
              top:
                `${renderedAxisY - 4}px`,
              width:
                "100000px",
              height:
                "8px",
              backgroundColor:
                "#ddd",
              pointerEvents:
                "none",
              zIndex: axisNeedsPinning ? 7 : 2,
            }}
          />

          {/* ─────────────────────────── */}
          {/* YEAR TICKS */}
          {/* ─────────────────────────── */}

          {/* Ticks live in world x and are panned by transform; the layer is shifted vertically only while the axis is pinned or moving. */}
          <div
            ref={setTicksElement}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              transform: `translate3d(${-viewPosition * pixelsPerYear * zoom}px, 0px, 0)`,
              pointerEvents: "none",
              zIndex: axisNeedsPinning ? 7 : 2,
            }}
          >
          {ticks.map(
            (year) => {
              const date:
                HistoricalDate =
                year <= 0
                  ? {
                      year:
                        Math.abs(
                          year
                        ) + 1,
                      era: "BC",
                    }
                  : {
                      year,
                      era: "CE",
                    };

              const x =
                getWorldPosition(
                  date
                );

              const isMajor =
                Math.abs(
                  year % labelInterval
                ) < 0.0001;

              const isFiveHundredYear =
                Math.abs(
                  year % 500
                ) < 0.0001;

              return (
                <div
                  key={year}
                  style={{
                    position:
                      "absolute",
                    left:
                      `${x}px`,
                    top:
                      `${renderedAxisY}px`,
                    transform:
                      "translateX(-50%)",
                    pointerEvents:
                      "none",
                    zIndex: 0,
                  }}
                >
                  {isMajor && (
                    <div
                      style={{
                        position:
                          "absolute",
                        left: "50%",
                        top:
                          `${-renderedAxisY}px`,
                        width: "1px",
                        height:
                          `${viewportHeight}px`,
                        transform:
                          "translateX(-50%)",
                        backgroundColor:
                          "rgba(255,255,255,0.09)",
                        pointerEvents:
                          "none",
                        zIndex: 0,
                      }}
                    />
                  )}

                  {/* Tick */}

                  <div
                    style={{
                      width:
                        isMajor
                          ? "8px"
                          : "5px",
                      height:
                        isMajor
                          ? "8px"
                          : "5px",
                      borderRadius:
                        "50%",
                      backgroundColor:
                        "#ddd",
                      transform:
                        "translateY(-50%)",
                    }}
                  />

                  {/* Major label */}

                  {isMajor && (
                    <div
                      style={{
                        position:
                          "absolute",
                        top:
                          "14px",
                        left:
                          "50%",
                        transform:
                          "translateX(-50%)",
                        whiteSpace:
                          "nowrap",
                        fontSize:
                          isFiveHundredYear
                            ? "16px"
                            : "13px",
                        fontWeight:
                          isFiveHundredYear
                            ? 700
                            : 400,
                        color:
                          "white",
                      }}
                    >
                      {renderTimelineYearLabel(year)}
                    </div>
                  )}
                </div>
              );
            }
          )}
          </div>

          {/* ─────────────────────────── */}
          {/* TIMELINE ITEMS */}
          {/* ─────────────────────────── */}

          {/* World layer: z-index 5 keeps it above unpinned ticks (2) and below the pinned axis band (6, 7). */}
          <div
            ref={setWorldElement}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              transform: `translate3d(${-viewPosition * pixelsPerYear * zoom}px, ${axisY}px, 0)`,
              zIndex: 5,
            }}
          >
          {normalizedLineageRoutes.length > 0 && (
            <svg
              aria-hidden="true"
              width="1"
              height="1"
              style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 4 }}
            >
              <g transform={`scale(${zoom / lineageZoom})`}>
                {normalizedLineageBounds && (
                  <rect
                    x={normalizedLineageBounds.left}
                    y={normalizedLineageBounds.top}
                    width={normalizedLineageBounds.right - normalizedLineageBounds.left}
                    height={normalizedLineageBounds.bottom - normalizedLineageBounds.top}
                    rx={6 * lineageZoom}
                    fill="rgba(245,166,35,0.06)"
                    stroke="#f5a623"
                    strokeWidth={Math.max(2, 2 * lineageZoom)}
                  />
                )}
                {lineageRouteElements}
              </g>
            </svg>
          )}

          {renderItems.map(
            (item) => {
              const x =
                getWorldPosition(
                  item.startDate
                );

              const row =
                itemRows.get(item.id) ??
                0;

              const y =
                getItemY(
                  item,
                  row,
                  0,
                  zoom
                );

              // Calculate period width.

              let periodWidth =
                0;

              if (
                item.type ===
                  "period" &&
                item.endDate
              ) {
                const startX =
                  getWorldPosition(
                    item.startDate
                  );

                const endX =
                  getWorldPosition(
                    item.endDate
                  );

                periodWidth =
                  Math.abs(
                    endX -
                      startX
                  );
              }

              return (
                <TimelineItemVisual
                  key={item.id}
                  item={item}
                  row={row}
                  zoom={zoom}
                  x={x}
                  y={y}
                  periodWidth={periodWidth}
                  labelFontSize={itemLabelFontSize}
                  highlighted={highlightedItemId === item.id}
                  glow={hoveredLinkedIds.has(item.id)}
                  onItemPointerDown={onItemPointerDown}
                  onItemPointerEnter={onItemPointerEnter}
                  onItemPointerLeave={onItemPointerLeave}
                  onItemClick={onItemClick}
                />
              );
            }
          )}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────── */}
      {/* DETAIL WINDOW */}
      {/* ─────────────────────────────── */}

      {selectedItem && detailWindowPosition && (
        <>
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 49,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {detailWindowPosition.showConnector && !isDragging && (
          <path
            d={`M ${detailWindowPosition.x} ${detailWindowPosition.boxEdgeY} L ${detailWindowPosition.x} ${(detailWindowPosition.boxEdgeY + detailWindowPosition.itemEdgeY) / 2} L ${detailWindowPosition.itemX} ${(detailWindowPosition.boxEdgeY + detailWindowPosition.itemEdgeY) / 2} L ${detailWindowPosition.itemX} ${detailWindowPosition.itemEdgeY}`}
            fill="none"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          )}
        </svg>
        <div
          ref={detailRef}
          onPointerDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) =>
            event.stopPropagation()
          }
          style={{
            position:
              "absolute",
            left:
              `${detailWindowPosition.x}px`,
            top:
              `${detailWindowPosition.top}px`,
            transform:
              "translateX(-50%)",
            zIndex: 50,
            width:
              "360px",
            maxWidth:
              "calc(100vw - 40px)",
            maxHeight:
              "calc(100vh - 40px)",
            overflowY:
              "auto",
            backgroundColor:
              "white",
            border:
              "1px solid #ccc",
            borderRadius:
              "8px",
            boxShadow:
              "0 8px 30px rgba(0,0,0,0.18)",
          }}
        >
          {/* ─────────────────────────── */}
          {/* WINDOW HEADER */}
          {/* ─────────────────────────── */}

          <div
            style={{
              padding:
                "15px 18px",
              borderBottom:
                "1px solid #eee",
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize:
                    "11px",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.08em",
                  color:
                    "#888",
                  marginBottom:
                    "4px",
                }}
              >
                {
                  selectedItem.type
                }
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize:
                    "20px",
                }}
              >
                {
                  selectedItem.title
                }
              </h2>
                {selectedItem.fullName && (
                  <p style={{ margin: "4px 0 0", color: "#7b8490", fontSize: "13px", lineHeight: 1.4 }}>
                    {selectedItem.fullName}
                  </p>
                )}
            </div>

            {/* Edit + close buttons */}

            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {getStudentLineageIds(visibleItems, selectedItem.id) && (
                <button
                  onClick={() => setLineageItemId((current) => current === selectedItem.id ? null : selectedItem.id)}
                  aria-pressed={lineageItemId === selectedItem.id}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    background: lineageItemId === selectedItem.id ? "#dbeafe" : "white",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    color: "#334155",
                    padding: "5px 10px",
                  }}
                >
                  Lineage
                </button>
              )}
              <button
                onClick={() => startEditingItem(selectedItem)}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  background: "white",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#334155",
                  padding: "5px 10px",
                }}
              >
                Edit
              </button>

              <button
                onClick={
                  closeDetails
                }
                style={{
                  border:
                    "none",
                  background:
                    "none",
                  fontSize:
                    "22px",
                  cursor:
                    "pointer",
                  color:
                    "#777",
                  padding:
                    "4px",
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* ─────────────────────────── */}
          {/* WINDOW CONTENT */}
          {/* ─────────────────────────── */}

          <div
            style={{
              padding:
                "18px",
            }}
          >
            {/* Date */}

            <div
              style={{
                marginBottom:
                  "15px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#666" }}>
                {renderDateLabel(selectedItem.startDate)}
                {selectedItem.endDate && (
                  <>
                    {" – "}
                    {renderDateLabel(selectedItem.endDate)}
                  </>
                )}
              </div>
              <div style={{ marginTop: "3px", fontSize: "11px", color: "#9299a1" }}>
                {renderHijriYearLabel(dateToNumber(selectedItem.startDate))}
                {selectedItem.endDate && (
                  <>
                    {" – "}
                    {renderHijriYearLabel(dateToNumber(selectedItem.endDate))}
                  </>
                )}
              </div>
            </div>

            {/* Description */}

            <p
              style={{
                margin: 0,
                fontSize:
                  "14px",
                lineHeight:
                  "1.6",
                color:
                  "#333",
              }}
            >
              {
                selectedItem.description
              }
            </p>

            {selectedItem.works && (
              <section style={{ marginTop: "16px" }}>
                <h3 style={{ margin: "0 0 5px", color: "#66717d", fontSize: "12px", fontWeight: 700 }}>
                  Works
                </h3>
                <p style={{ margin: 0, color: "#555f69", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {selectedItem.works}
                </p>
              </section>
            )}

            {(selectedNormalTagNames.length > 0 || selectedMetaTagNames.length > 0) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "16px",
                }}
              >
                {selectedNormalTagNames.map((tagName) => {
                  const tag = tagByName.get(tagName);
                  return (
                    <span
                      key={tagName}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "12px",
                        backgroundColor: tag?.color ?? "#94a3b8",
                        color: "white",
                        fontSize: "12px",
                      }}
                    >
                      {tagName}
                    </span>
                  );
                })}
                {selectedMetaTagNames.length > 0 && (
                  <>
                    <button
                      type="button"
                      aria-label={showMetaTags ? "Hide meta-tags" : "Show meta-tags"}
                      aria-expanded={showMetaTags}
                      title={showMetaTags ? "Hide meta-tags" : "Show meta-tags"}
                      onClick={() => setShowMetaTags((current) => !current)}
                      style={{ width: "24px", height: "24px", padding: 0, border: "1px solid #d1d5db", borderRadius: "4px", backgroundColor: "#f1f2f4", color: "#555", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}
                    >
                      {showMetaTags ? "−" : "+"}
                    </button>
                    {showMetaTags && (
                      <div style={{ display: "flex", flex: "1 0 100%", flexWrap: "wrap", gap: "6px" }}>
                        {selectedMetaTagNames.map((tagName) => (
                          <span
                            key={tagName}
                            style={{ padding: "4px 8px", border: "1px solid #e1e3e6", borderRadius: "4px", backgroundColor: "#f1f2f4", color: "#555", fontSize: "12px" }}
                          >
                            {tagName}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        </>
      )}

      {/* ─────────────────────────────── */}
      {/* ADD BUTTON */}
      {/* ─────────────────────────────── */}

      <TimelineControls
        pixelsPerYear={pixelsPerYear}
        calendarMode={calendarMode}
        editMode={editMode}
        showAddForm={showAddForm}
        onToggleAddForm={startAddingItem}
        setPixelsPerYear={setPixelsPerYear}
        setCalendarMode={setCalendarMode}
        setEditMode={setEditMode}
        onExport={handleExportTimeline}
        onImport={handleImport}
        showItemList={showItemList}
        setShowItemList={setShowItemList}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={resetView}
        onToggleFullscreen={toggleFullscreen}
        items={items}
        onSearchSelect={handleSearchSelect}
      />

      <div
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={() => setShowTagPanel((current) => !current)}
          style={{
            padding: "8px 14px",
            backgroundColor: showTagPanel ? "#dbeafe" : "white",
            border: "1px solid #cbd5e1",
            borderRadius: "5px",
            color: "#334155",
            cursor: "pointer",
            boxShadow: "0 2px 5px rgba(0,0,0,0.12)",
          }}
        >
          Tags
        </button>
      </div>

      {showTagPanel && (
        <TagFilterPanel
          tags={tags}
          activeTagNames={activeTagNames}
          onExportCategory={handleExportCategory}
          onImportCategory={handleCategoryImport}
          onCreateTag={handleCreateTagFromMenu}
          onRenameTag={handleRenameTag}
          onChangeTagColor={handleChangeTagColor}
          onChangeTagMeta={handleChangeTagMeta}
          onChangeTagItemPosition={handleChangeTagItemPosition}
          onMoveTag={handleMoveTag}
          onSetTagParent={handleSetTagParent}
          onDeleteTag={handleDeleteTag}
          onToggle={handleToggleTag}
          onClose={handleCloseTagPanel}
        />
      )}

      {editMode && showItemList && (
        <TimelineItemList
          items={items}
          scrollTopRef={itemListScrollTop}
          onSelect={handleTimelineListSelect}
          onClose={handleTimelineListClose}
        />
      )}

      {dataError && (
        <div
          role="alert"
          className="timeline-data-alert"
          style={{
            position: "absolute",
            top: "20px",
            right: "260px",
            zIndex: 30,
            maxWidth: "280px",
            padding: "10px 12px",
            borderRadius: "5px",
            backgroundColor: "#fee2e2",
            color: "#991b1b",
            fontSize: "12px",
          }}
        >
          {dataError}
        </div>
      )}

      {/* ─────────────────────────────── */}
      {/* ADD ITEM PANEL */}
      {/* ─────────────────────────────── */}

      {showAddForm && (
        <AddItemForm
          key={editingItemId ?? "new"}
          initialForm={formSeed}
          handleRef={formHandleRef}
          teacherOptions={teacherOptions}
          isEditing={editingItemId !== null}
          availableTags={tags}
          onCommit={handleCommitEditedItem}
          onDirty={clearDataError}
          onSubmit={handleAddItem}
          onCreateTag={handleCreateTag}
          onDuplicate={duplicateEditingItem}
          onDelete={deleteEditingItem}
          onClose={closeItemEditor}
          onBack={editingFromList ? backToItemList : undefined}
        />
      )}


    </div>
  );
}