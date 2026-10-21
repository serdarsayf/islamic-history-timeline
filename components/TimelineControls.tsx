import { memo, useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { dateToNumber, getYearLabel } from "../lib/timeline";
import type { CalendarMode } from "../lib/timeline/types";
import type { TimelineItem } from "../lib/timeline/types";
import { useEscapeLayer } from "./useEscapeLayer";

type TimelineControlsProps = {
  pixelsPerYear: number;
  calendarMode: CalendarMode;
  editMode: boolean;
  showAddForm: boolean;
  onToggleAddForm: () => void;
  setPixelsPerYear: Dispatch<SetStateAction<number>>;
  setCalendarMode: Dispatch<SetStateAction<CalendarMode>>;
  setEditMode: Dispatch<SetStateAction<boolean>>;
  onExport: () => void;
  onImport: (file: File) => void;
  showItemList: boolean;
  setShowItemList: Dispatch<SetStateAction<boolean>>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleFullscreen: () => void;
  items: TimelineItem[];
  onSearchSelect: (item: TimelineItem) => void;
};

const buttonStyle = {
  minHeight: "36px",
  padding: "7px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "4px",
  backgroundColor: "white",
  color: "#1e293b",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 600,
};

function TimelineControlsImpl({
  pixelsPerYear,
  calendarMode,
  editMode,
  showAddForm,
  onToggleAddForm,
  setPixelsPerYear,
  setCalendarMode,
  setEditMode,
  onExport,
  onImport,
  showItemList,
  setShowItemList,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleFullscreen,
  items,
  onSearchSelect,
}: TimelineControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEscapeLayer(editMode, () => {
    setEditMode(false);
    setShowItemList(false);
  });
  useEscapeLayer(searchOpen, () => {
    setSearchOpen(false);
    setSearchQuery("");
  });

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key !== "f" && key !== "e") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      event.preventDefault();
      if (key === "e") {
        if (editMode) setShowItemList(false);
        setEditMode(!editMode);
        return;
      }

      setSearchOpen(true);
      searchInputRef.current?.focus();
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [editMode, setEditMode, setShowItemList]);

  const matchingItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return [];

    return items.filter((item) =>
      `${item.title} ${item.fullName ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    ).slice(0, 8);
  }, [items, searchQuery]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onImport(file);
    event.target.value = "";
  }

  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      className="ui-panel timeline-controls-panel"
      style={{
        position: "absolute",
        top: "20px",
        right: "20px",
        zIndex: 10,
        width: "min(310px, calc(100vw - 40px))",
        maxHeight: "calc(100vh - 40px)",
        overflowY: "auto",
        padding: "14px",
        boxSizing: "border-box",
        backgroundColor: "rgba(248,250,252,0.96)",
        border: "1px solid rgba(203,213,225,0.9)",
        borderRadius: "6px",
        boxShadow: "0 8px 22px rgba(15,23,42,0.22)",
      }}
    >
      <div>
        <span className="control-heading">Items</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
        <button className="ui-button" type="button" onClick={() => setEditMode((current) => { if (current) setShowItemList(false); return !current; })} style={{ ...buttonStyle, backgroundColor: editMode ? "#dbeafe" : "white" }}>
          {editMode ? "Editing" : "Edit"}
        </button>
        <button className="ui-button" type="button" onClick={onToggleAddForm} style={buttonStyle}>
          {showAddForm ? "Close" : "Add Item"}
        </button>
        {editMode && (
          <button className="ui-button" type="button" onClick={() => setShowItemList((current) => !current)} style={{ ...buttonStyle, backgroundColor: showItemList ? "#dbeafe" : "white", gridColumn: "1 / -1", justifySelf: "center", width: "50%" }}>
            Items
          </button>
        )}
        </div>
        <div style={{ position: "relative", marginTop: "7px" }}>
          <button
            className="ui-button"
            type="button"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((current) => !current);
              setSearchQuery("");
            }}
            style={{ ...buttonStyle, width: "100%" }}
          >
            {searchOpen ? "Close search" : "Search items"}
          </button>
          {searchOpen && (
            <div style={{ marginTop: "6px" }}>
              <input
                ref={searchInputRef}
                autoFocus
                type="search"
                aria-label="Search timeline items"
                placeholder="Search names..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 9px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#1e293b", fontSize: "13px" }}
              />
              {searchQuery.trim() && (
                <div role="listbox" aria-label="Matching timeline items" style={{ maxHeight: "220px", overflowY: "auto", marginTop: "4px", border: "1px solid #dbe2e8", borderRadius: "4px", backgroundColor: "white", boxShadow: "0 6px 14px rgba(15,23,42,0.14)" }}>
                  {matchingItems.length > 0 ? matchingItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => {
                        onSearchSelect(item);
                        setSearchQuery("");
                        setSearchOpen(false);
                      }}
                      style={{ display: "block", width: "100%", padding: "8px 9px", border: "none", borderBottom: "1px solid #edf0f2", backgroundColor: "white", color: "#1e293b", textAlign: "left", cursor: "pointer" }}
                    >
                      <span style={{ display: "block", fontSize: "13px", fontWeight: 600 }}>{item.title}</span>
                      {item.fullName && <span style={{ display: "block", marginTop: "1px", color: "#7b8490", fontSize: "11px" }}>{item.fullName}</span>}
                      <span style={{ display: "block", marginTop: "2px", color: "#64748b", fontSize: "11px" }}>{getYearLabel(dateToNumber(item.startDate))}</span>
                    </button>
                  )) : (
                    <div style={{ padding: "9px", color: "#64748b", fontSize: "12px" }}>No matching items.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="control-section">
        <span className="control-heading">View</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px" }}>
        <button className="ui-button" type="button" title="Zoom in" onClick={onZoomIn} style={buttonStyle}>+</button>
        <button className="ui-button" type="button" title="Zoom out" onClick={onZoomOut} style={buttonStyle}>-</button>
        <button className="ui-button" type="button" title="Reset view" onClick={onResetView} style={buttonStyle}>Fit</button>
        <button className="ui-button" type="button" title="Toggle fullscreen" onClick={onToggleFullscreen} style={buttonStyle}>Full</button>
        </div>
      </div>

      <label className="control-section" style={{ display: "block", color: "#334155", fontSize: "12px" }}>
        <span className="control-heading">Year spacing</span>
        <input type="range" min="0.1" max="10" step="0.1" value={pixelsPerYear} onChange={(event) => setPixelsPerYear(Number(event.target.value))} style={{ display: "block", width: "100%", marginTop: "6px" }} />
      </label>

      <label className="control-section" style={{ display: "block", color: "#334155", fontSize: "12px" }}>
        <span className="control-heading">Date Type</span>
        <select value={calendarMode} onChange={(event) => setCalendarMode(event.target.value as CalendarMode)} style={{ display: "block", width: "100%", marginTop: "6px", padding: "7px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white" }}>
          <option value="gregorian">Gregorian</option>
          <option value="hijri">Hijri</option>
        </select>
      </label>

      {editMode && (
        <div className="control-section" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
          <span className="control-heading" style={{ gridColumn: "1 / -1" }}>Data</span>
          <button className="ui-button" type="button" onClick={onExport} style={buttonStyle}>Export CSV</button>
          <button className="ui-button" type="button" onClick={() => fileInputRef.current?.click()} style={buttonStyle}>Import CSV</button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} style={{ display: "none" }} />
        </div>
      )}
    </div>
  );
}

export default memo(TimelineControlsImpl);
