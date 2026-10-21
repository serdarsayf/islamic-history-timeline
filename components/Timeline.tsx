"use client";

import {
  useCallback,
  useEffect,
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
} from "../lib/timeline/geometry";
import AddItemForm from "./AddItemForm";
import TimelineControls from "./TimelineControls";
import TimelineItemVisual from "./TimelineItemVisual";
import TimelineItemList from "./TimelineItemList";
import TagFilterPanel from "./TagFilterPanel";
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
import { useTimelineItems } from "./useTimelineItems";
import { buildTimelineItemData } from "../lib/timeline/validation";
import {
  downloadTimelineCategory,
  downloadTimelineCsv,
  importTimelineCategory,
  importTimelineCsv,
  mergeTimelineCategoryItems,
} from "../lib/timeline/dataExchange";

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

  const [pointerX, setPointerX] =
    useState<number | null>(null);

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

  const [form, setForm] = useState<ItemFormState>(initialItemFormState);

  const updateForm = useCallback((patch: Partial<ItemFormState>) => {
    setDataError(null);
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const [newTagName, setNewTagName] = useState("");

  const [newTagColor, setNewTagColor] = useState("#ef4444");

  const [dataError, setDataError] = useState<string | null>(null);

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

  useEffect(() => {
    const element = detailRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => setDetailHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedItemId]);

  // ─────────────────────────────────────
  // SCREEN DIMENSIONS
  // ─────────────────────────────────────

  const [viewportSize, setViewportSize] =
    useState({
      width: 1200,
      height: 800,
    });

  useEffect(() => {
    function updateViewportSize() {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
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
  }, []);

  const viewportWidth =
    viewportSize.width;

  const viewportHeight =
    viewportSize.height;

  // ─────────────────────────────────────
  // TIMELINE AXIS POSITION
  // ─────────────────────────────────────

  const axisY =
    viewportHeight / 2 +
    verticalOffset;

  const axisNeedsPinning =
    axisY < 0 ||
    axisY + 34 > viewportHeight;

  const axisPinnedToTop =
    axisNeedsPinning && axisY < 0;

  const renderedAxisY =
    axisNeedsPinning
      ? axisPinnedToTop
        ? 8
        : Math.max(8, viewportHeight - 40)
      : axisY;

  const pointerYearBannerTop =
    axisPinnedToTop ? 56 : 12;

  const pointerYear =
    pointerX === null
      ? null
      : viewPosition +
        (pointerX - viewportWidth / 2) /
          (pixelsPerYear * zoom);

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
    setForm({
      itemType: item.type,
      title: item.title,
      fullName: item.fullName ?? "",
      description: item.description,
      works: item.works ?? "",
      color: item.color,
      textColor: item.textColor,
      tags: item.tags,
      teacherIds: item.teacherIds ?? [],
      grandTeacherIds: item.grandTeacherIds ?? [],
      startYear: String(item.startDate.year),
      startEra: item.startDate.era,
      startMonth: item.startDate.month ? String(item.startDate.month) : "",
      startDay: item.startDate.day ? String(item.startDate.day) : "",
      startApproximate: item.startDate.approximate === true,
      endYear: item.endDate ? String(item.endDate.year) : "",
      endEra: item.endDate?.era ?? "CE",
      endMonth: item.endDate?.month ? String(item.endDate.month) : "",
      endDay: item.endDate?.day ? String(item.endDate.day) : "",
      endApproximate: item.endDate?.approximate === true,
      position: item.position,
    });
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

  const resetItemForm = useCallback(() => {
    setForm(initialItemFormState);
  }, []);

  const startAddingItem = useCallback(() => {
    if (showAddForm) {
      closeItemEditor();
      return;
    }

    resetItemForm();
    setEditingItemId(null);
    setShowAddForm(true);
  }, [showAddForm, closeItemEditor, resetItemForm]);

  const handleCreateTag = useCallback(() => {
    const tag = createTimelineTag(tags, newTagName, newTagColor);
    if (!tag) return;

    setTags((currentTags) => [
      ...currentTags,
      tag,
    ]);
    updateForm({
      tags: [...form.tags, tag.name],
      // Adopt the first tag's color as the item's box and text color.
      ...(form.tags.length === 0 ? { color: newTagColor, textColor: newTagColor } : {}),
    });
    setNewTagName("");
  }, [tags, newTagName, newTagColor, form, updateForm, setTags]);

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
    setForm((currentForm) => ({
      ...currentForm,
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
    setForm((currentForm) => ({
      ...currentForm,
      tags: currentForm.tags.filter((name) => name !== tagName),
    }));
    setActiveTagNames((currentNames) =>
      currentNames.filter((name) => name !== tagName)
    );
  }, [setItems, setTags]);

  const duplicateEditingItem = useCallback(() => {
    if (editingItemId === null) return;

    setItems((currentItems) =>
      duplicateTimelineItem(currentItems, editingItemId)
    );
    closeItemEditor();
  }, [editingItemId, closeItemEditor, setItems]);

  const deleteEditingItem = useCallback(() => {
    if (editingItemId === null) return;

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

    const historicalPositionUnderMouse =
      viewPosition +
      mouseOffsetFromCenter /
        (pixelsPerYear * zoom);

    const newViewPosition =
      historicalPositionUnderMouse -
      mouseOffsetFromCenter /
        (pixelsPerYear * newZoom);

    const mouseOffsetFromAxis =
      event.clientY - axisY;

    const newVerticalOffset =
      verticalOffset +
      mouseOffsetFromAxis *
        (1 - newZoom / zoom);

    setViewPosition(newViewPosition);
    setVerticalOffset(newVerticalOffset);
    setZoom(newZoom);
  }

  const zoomBy = useCallback((factor: number) => {
    setZoom((currentZoom) =>
      Math.min(Math.max(currentZoom * factor, 0.25), 5)
    );
  }, []);

  const resetView = useCallback(() => {
    setViewPosition(dateToNumber({ year: 800, era: "CE" }));
    setZoom(1);
    setVerticalOffset(0);
  }, []);

  const handleSearchSelect = useCallback((item: TimelineItem) => {
    const searchLineageIds = lineageItemId === null
      ? null
      : getLineageIds(items, lineageItemId);
    const row = getItemRows(items, pixelsPerYear, searchLineageIds ?? undefined).get(item.id) ?? 0;
    const itemDistance = getItemDistance(row, zoom);
    setActiveTagNames([]);
    setViewPosition(dateToNumber(item.startDate));
    setVerticalOffset(item.position === "above" ? itemDistance : -itemDistance);
    setHighlightedItemId(item.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightedItemId(null);
      highlightTimer.current = null;
    }, 2400);
  }, [lineageItemId, items, pixelsPerYear, zoom]);

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

  function beginDrag(event: React.PointerEvent) {
    setIsDragging(true);

    hasDragged.current = false;

    dragStartX.current =
      event.clientX;

    dragStartY.current =
      event.clientY;

    dragStartPosition.current =
      viewPosition;

    dragStartVerticalOffset.current =
      verticalOffset;

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  }

  function handlePointerDown(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    beginDrag(event);
  }

  // ─────────────────────────────────────
  // MOVE TIMELINE CANVAS
  // ─────────────────────────────────────

  function applyPointerMove(clientX: number, clientY: number) {
    if (!isDragging) {
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

    setViewPosition(
      dragStartPosition.current -
        positionMoved
    );

    // ───────────────────────────────────
    // VERTICAL MOVEMENT
    // ───────────────────────────────────

    setVerticalOffset(
      dragStartVerticalOffset.current +
        deltaY
    );
  }

  const { schedule: schedulePointerMove, cancel: cancelScheduledPointerMove } =
    useRafThrottle(applyPointerMove);

  function handlePointerMove(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    const { clientX, clientY } = event;
    setPointerX(clientX);
    schedulePointerMove(clientX, clientY);
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

  // Edits apply straight to the item as the form changes; no save step needed.
  useEffect(() => {
    if (editingItemId === null) return;

    const itemData = buildTimelineItemData(form);
    if (!itemData) return;

    const itemDataWithTagPosition = {
      ...itemData,
      position: getTagItemPosition(tags, itemData.tags) ?? itemData.position,
    };

    setItems((currentItems) =>
      updateTimelineItem(currentItems, editingItemId, itemDataWithTagPosition)
    );
  }, [form, editingItemId, setItems, tags]);

  // ─────────────────────────────────────
  // ADD TIMELINE ITEM
  // ─────────────────────────────────────

  const handleAddItem = useCallback((event: React.FormEvent) => {
    event.preventDefault();

    const itemData = buildTimelineItemData(form);
    if (!itemData) {
      setDataError("Enter a name and valid whole-number dates. A period must end on or after its start date.");
      return;
    }

    const itemDataWithTagPosition = {
      ...itemData,
      position: getTagItemPosition(tags, itemData.tags) ?? itemData.position,
    };

    if (editingItemId !== null) {
      // Existing items are already kept in sync live; just close the form.
      closeItemEditor();
      return;
    }

    setItems((currentItems) => addTimelineItem(currentItems, itemDataWithTagPosition));

    resetItemForm();
    setShowAddForm(false);
  }, [form, tags, editingItemId, closeItemEditor, setItems, resetItemForm]);


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

  const startVisibleYear =
    viewPosition -
    yearsVisible / 2 -
    100;

  const endVisibleYear =
    viewPosition +
    yearsVisible / 2 +
    100;

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
    () => visibleItems.filter((item) => {
      const itemStart = dateToNumber(item.startDate);
      const itemEnd = item.endDate ? dateToNumber(item.endDate) : itemStart;
      return itemEnd >= startVisibleYear && itemStart <= endVisibleYear;
    }),
    [visibleItems, startVisibleYear, endVisibleYear]
  );

  const originalItemRows = useMemo(
    () => getItemRows(visibleItems, pixelsPerYear),
    [visibleItems, pixelsPerYear]
  );
  const lineageIds = useMemo(
    () => lineageItemId === null
      ? null
      : getStudentLineageIds(visibleItems, lineageItemId),
    [visibleItems, lineageItemId]
  );
  const lineageLinks = useMemo(
    () => lineageIds ? getLineageLinks(visibleItems, lineageIds) : [],
    [visibleItems, lineageIds]
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
    const packedRows = getItemRows(visibleItems, pixelsPerYear, lineageIds, pinnedLineageItem, lineageTeacherIds);
    return optimizeLineageRows(
      visibleItems,
      pixelsPerYear,
      packedRows,
      lineageIds,
      lineageLinks,
      lineageItemId,
      lineageTeacherIds
    );
  }, [visibleItems, pixelsPerYear, lineageIds, lineageItemId, originalItemRows, lineageLinks, lineageTeacherIds]);
  const lineageNodes = useMemo(
    () => lineageIds
      ? visibleItems
          .filter((item) => lineageIds.has(item.id))
          .map((item) => {
            const row = lineageItemRows.get(item.id) ?? 0;
            const x = getRelativePosition(item.startDate);

            return {
              item,
              row,
              x,
              endX: item.endDate
                ? x + Math.abs(getRelativePosition(item.endDate) - x)
                : x,
              y: getItemY(item, row, axisY, zoom),
            };
          })
      : [],
    [visibleItems, lineageIds, lineageItemRows, getRelativePosition, axisY, zoom]
  );
  const lineageRoutes = useMemo(
    () => lineageIds
      ? getLineageRoutes(lineageNodes, lineageLinks, axisY, zoom)
      : [],
    [lineageIds, lineageNodes, lineageLinks, axisY, zoom]
  );
  // Holding Shift flips the hover from the box's students to its teachers.
  const hoveredLinkedIds = useMemo(
    () => new Set(lineageRoutes.flatMap((route) => {
      if (route.teacherId === hoveredLineageItemId && !shiftHeld) return [route.studentId];
      if (route.studentId === hoveredLineageItemId && shiftHeld) return [route.teacherId];
      return [];
    })),
    [lineageRoutes, hoveredLineageItemId, shiftHeld]
  );
  const lineageBounds = useMemo(
    () => lineageIds
      ? getLineageBounds(
          lineageNodes,
          lineageRoutes,
          16 * zoom,
          zoom,
          lineageNodes.find((node) => node.item.id === lineageItemId)?.y
        )
      : null,
    [lineageIds, lineageNodes, lineageRoutes, zoom, lineageItemId]
  );
  const routeRange = useMemo(
    () => lineageBounds
      ? {
          start: viewPosition + lineageBounds.left / (pixelsPerYear * zoom),
          end: viewPosition + lineageBounds.right / (pixelsPerYear * zoom),
        }
      : null,
    [lineageBounds, viewPosition, pixelsPerYear, zoom]
  );
  const clearanceRows = useMemo(
    () => lineageBounds
      ? getLineageClearanceRows(lineageBounds, axisY, zoom)
      : { above: null, below: null },
    [lineageBounds, axisY, zoom]
  );
  const clearThroughRows = useMemo(() => {
    const rows = { above: clearanceRows.above, below: clearanceRows.below };
    visibleItems.forEach((item) => {
      if (!lineageIds?.has(item.id)) return;
      const row = lineageItemRows.get(item.id) ?? 0;
      const band = rows[item.position];
      rows[item.position] = band
        ? { min: Math.min(band.min, row), max: Math.max(band.max, row) }
        : { min: row, max: row };
    });
    return rows;
  }, [clearanceRows, visibleItems, lineageIds, lineageItemRows]);
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

  const teacherOptions = useMemo(() => {
    const descendantIds = editingItemId === null
      ? new Set<number>()
      : getDescendantIds(items, editingItemId);

    return items
      .filter((item) => item.id !== editingItemId && !descendantIds.has(item.id))
      .map(({ id, title }) => ({ id, title }))
      .sort((first, second) => first.title.localeCompare(second.title));
  }, [items, editingItemId]);

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
    () => visibleItems.find(
      (item) =>
        item.id ===
        selectedItemId
    ),
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
        onPointerLeave={() =>
          setPointerX(null)
        }
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
        {pointerX !== null &&
          pointerYear !== null && (
          <>
            <div
              style={{
                position:
                  "absolute",
                left:
                  `${pointerX}px`,
                top: 0,
                width: "1px",
                height: "calc(100% - 40px)",
                marginTop: "40px",
                backgroundColor:
                  "rgba(255,255,255,0.09)",
                pointerEvents:
                  "none",
                zIndex: 8,
              }}
            />

            <div
              style={{
                position:
                  "absolute",
                left:
                  `${pointerX}px`,
                top: `${pointerYearBannerTop}px`,
                transform:
                  "translateX(-50%)",
                padding:
                  "5px 12px",
                width:
                  "220px",
                maxWidth:
                  "calc(100vw - 24px)",
                boxSizing:
                  "border-box",
                textAlign: "center",
                backgroundColor:
                  "rgba(20,31,44,0.96)",
                border:
                  "1px solid rgba(255,255,255,0.24)",
                borderRadius:
                  "4px",
                color: "white",
                fontSize: "14px",
                lineHeight: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "10px",
                whiteSpace: "nowrap",
                pointerEvents:
                  "none",
                zIndex: 9,
              }}
            >
              <span>
                {renderHijriYearLabel(
                  Math.round(pointerYear)
                )}
              </span>
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform:
                    "translate(-50%, -50%)",
                  width: "8px",
                  height: "8px",
                  flex: "0 0 auto",
                  borderRadius: "50%",
                  backgroundColor:
                    "#f5a623",
                }}
              />
              <span>
                {renderTimelineYearLabel(
                  Math.round(pointerYear)
                )}
              </span>
            </div>
          </>
        )}

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
                getRelativePosition(
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
                    zIndex: axisNeedsPinning ? 7 : 2,
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

          {/* ─────────────────────────── */}
          {/* TIMELINE ITEMS */}
          {/* ─────────────────────────── */}

          {lineageRoutes.length > 0 && (
            <svg
              aria-hidden="true"
              width="1"
              height="1"
              style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 4 }}
            >
              {lineageBounds && (
                <rect
                  x={lineageBounds.left}
                  y={lineageBounds.top}
                  width={lineageBounds.right - lineageBounds.left}
                  height={lineageBounds.bottom - lineageBounds.top}
                  rx={6 * zoom}
                  fill="rgba(245,166,35,0.06)"
                  stroke="#f5a623"
                  strokeWidth={Math.max(2, 2 * zoom)}
                />
              )}
              {lineageRoutes.map(({ key, teacherId, studentId, dashed, segments, arrow }) => {
                const isHighlighted = hoveredLineageItemId === (shiftHeld ? studentId : teacherId);
                const lineWidth = isHighlighted ? Math.max(2.5, 3 * zoom) : Math.max(1.5, 2 * zoom);
                return (
                <g
                  key={key}
                  style={isHighlighted ? { filter: "drop-shadow(0 0 4px rgba(255,209,102,0.95))" } : undefined}
                >
                  {segments.map(({ start, end, opacity }, index) => (
                    <line
                      key={`${key}-${index}`}
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke={isHighlighted ? "#ffd166" : "#ddd"}
                      strokeOpacity={isHighlighted && opacity > 0.5 ? Math.max(opacity, 0.8) : opacity}
                      strokeWidth={lineWidth}
                      strokeLinecap={dashed ? "butt" : "round"}
                      strokeDasharray={dashed ? `${lineWidth * 2} ${lineWidth * 2}` : undefined}
                    />
                  ))}
                  <polygon
                    points={`0,0 ${-arrow.size * 2},${-arrow.size * 0.8} ${-arrow.size * 2},${arrow.size * 0.8}`}
                    transform={`translate(${arrow.tip.x} ${arrow.tip.y}) rotate(${arrow.angle})`}
                    fill={isHighlighted ? "#ffd166" : "#ddd"}
                    fillOpacity={arrow.opacity}
                  />
                </g>
                );
              })}
            </svg>
          )}

          {renderItems.map(
            (item) => {
              const x =
                getRelativePosition(
                  item.startDate
                );

              const row =
                itemRows.get(item.id) ??
                0;

              const y =
                getItemY(
                  item,
                  row,
                  axisY,
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
                  getRelativePosition(
                    item.startDate
                  );

                const endX =
                  getRelativePosition(
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
          {detailWindowPosition.showConnector && (
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
          form={form}
          tagPositionPreference={getTagItemPosition(tags, form.tags)}
          teacherOptions={teacherOptions}
          onChange={updateForm}
          isEditing={editingItemId !== null}
          availableTags={tags}
          newTagName={newTagName}
          newTagColor={newTagColor}
          setNewTagName={setNewTagName}
          setNewTagColor={setNewTagColor}
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