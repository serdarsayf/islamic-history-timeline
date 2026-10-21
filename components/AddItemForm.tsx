import dynamic from "next/dynamic";
import { memo, useCallback, useMemo, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { ItemFormState, TimelineTag } from "../lib/timeline/types";
import { getTagDepth } from "../lib/timeline/tags";
import { useEscapeLayer } from "./useEscapeLayer";

const DatePickerPanel = dynamic(() => import("./DatePickerPanel"), {
  ssr: false,
  loading: () => null,
});

const monthAbbreviations = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function formatDateText(year: string, month: string, day: string) {
  const parts: string[] = [];
  if (day) parts.push(day);
  if (month) {
    const monthName = monthAbbreviations[Number(month) - 1];
    if (monthName) parts.push(monthName);
  }
  if (year) parts.push(year);
  return parts.join(" ");
}

function parseDateText(text: string) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { year: "", month: "", day: "" };
  }

  const yearToken = tokens[tokens.length - 1];
  if (!/^\d+$/.test(yearToken)) return null;

  let month = "";
  let day = "";

  for (const token of tokens.slice(0, -1)) {
    if (/^\d+$/.test(token)) {
      day = token;
      continue;
    }

    const monthIndex = monthAbbreviations.findIndex(
      (name) => name === token.toLowerCase()
    );
    if (monthIndex !== -1) month = String(monthIndex + 1);
  }

  return { year: yearToken, month, day };
}

type AddItemFormProps = {
  form: ItemFormState;
  tagPositionPreference: "above" | "below" | null;
  teacherOptions: { id: number; title: string }[];
  onChange: (patch: Partial<ItemFormState>) => void;
  isEditing: boolean;
  availableTags: TimelineTag[];
  newTagName: string;
  newTagColor: string;
  setNewTagName: Dispatch<SetStateAction<string>>;
  setNewTagColor: Dispatch<SetStateAction<string>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCreateTag: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
  onBack?: () => void;
};

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "9px 10px",
  border: "1px solid #d6dbe1",
  borderRadius: "4px",
  backgroundColor: "rgba(255,255,255,0.85)",
  color: "#1f2933",
  fontSize: "14px",
};

const labelStyle = {
  display: "block",
  marginBottom: "12px",
  color: "#334155",
  fontSize: "13px",
};

function AddItemFormImpl({
  form,
  tagPositionPreference,
  teacherOptions,
  onChange,
  isEditing,
  availableTags,
  newTagName,
  newTagColor,
  setNewTagName,
  setNewTagColor,
  onSubmit,
  onCreateTag,
  onDuplicate,
  onDelete,
  onClose,
  onBack,
}: AddItemFormProps) {
  const [showTagCreator, setShowTagCreator] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [openDateField, setOpenDateField] = useState<"start" | "end" | null>(null);
  const [teacherQuery, setTeacherQuery] = useState("");
  const [startDateText, setStartDateText] = useState(() => formatDateText(form.startYear, form.startMonth, form.startDay));
  const [endDateText, setEndDateText] = useState(() => formatDateText(form.endYear, form.endMonth, form.endDay));

  useEscapeLayer(showTagCreator, () => setShowTagCreator(false));
  useEscapeLayer(showTagPicker, () => setShowTagPicker(false));
  useEscapeLayer(openDateField !== null, () => setOpenDateField(null));

  const normalizedTeacherQuery = teacherQuery.trim().toLocaleLowerCase();
  const visibleTeacherOptions = useMemo(
    () => normalizedTeacherQuery
      ? teacherOptions.filter((option) =>
          option.title.toLocaleLowerCase().includes(normalizedTeacherQuery)
        )
      : teacherOptions,
    [teacherOptions, normalizedTeacherQuery]
  );
  const availableTagByName = useMemo(
    () => new Map(availableTags.map((tag) => [tag.name, tag])),
    [availableTags]
  );
  const availableTagRows = useMemo(
    () => availableTags.map((tag) => ({
      tag,
      depth: getTagDepth(availableTags, tag.name),
    })),
    [availableTags]
  );
  const closeDatePicker = useCallback(() => setOpenDateField(null), []);
  const handleStartEraChange = useCallback(
    (era: "BC" | "CE") => onChange({ startEra: era }),
    [onChange]
  );
  const handleStartYearChange = useCallback((value: string) => {
    onChange({ startYear: value });
    setStartDateText(formatDateText(value, form.startMonth, form.startDay));
  }, [onChange, form.startMonth, form.startDay]);
  const handleStartMonthChange = useCallback((value: string) => {
    onChange({ startMonth: value });
    setStartDateText(formatDateText(form.startYear, value, form.startDay));
  }, [onChange, form.startYear, form.startDay]);
  const handleStartDayChange = useCallback((value: string) => {
    onChange({ startDay: value });
    setStartDateText(formatDateText(form.startYear, form.startMonth, value));
  }, [onChange, form.startYear, form.startMonth]);
  const handleEndEraChange = useCallback(
    (era: "BC" | "CE") => onChange({ endEra: era }),
    [onChange]
  );
  const handleEndYearChange = useCallback((value: string) => {
    onChange({ endYear: value });
    setEndDateText(formatDateText(value, form.endMonth, form.endDay));
  }, [onChange, form.endMonth, form.endDay]);
  const handleEndMonthChange = useCallback((value: string) => {
    onChange({ endMonth: value });
    setEndDateText(formatDateText(form.endYear, value, form.endDay));
  }, [onChange, form.endYear, form.endDay]);
  const handleEndDayChange = useCallback((value: string) => {
    onChange({ endDay: value });
    setEndDateText(formatDateText(form.endYear, form.endMonth, value));
  }, [onChange, form.endYear, form.endMonth]);

  return (
    <>
    <div
      onPointerDown={(event) => event.stopPropagation()}
      className="ui-panel timeline-floating-panel timeline-form-panel"
      style={{
        position: "absolute",
        top: "20px",
        right: "260px",
        zIndex: 20,
        width: "340px",
        maxHeight: "calc(100vh - 112px)",
        overflowY: "auto",
        padding: "20px",
        boxSizing: "border-box",
        backgroundColor: "rgba(248,250,252,0.96)",
        border: "1px solid rgba(203,213,225,0.9)",
        borderRadius: "6px",
        boxShadow: "0 12px 28px rgba(15,23,42,0.24)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
        <div>
          {onBack && (
            <button type="button" onClick={onBack} style={{ display: "block", marginBottom: "6px", padding: 0, border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
              ← Back to list
            </button>
          )}
          <div style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}>{isEditing ? "Edit item" : "New item"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ padding: "5px 8px", borderRadius: "12px", backgroundColor: "#e2e8f0", color: "#475569", fontSize: "11px" }}>{form.itemType}</span>
          <button type="button" onClick={onClose} aria-label="Close item form" style={{ width: "28px", height: "28px", border: "1px solid #cbd5e1", borderRadius: "4px", background: "white", color: "#475569", cursor: "pointer" }}>×</button>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <label style={labelStyle}>
          Type
          <select className="ui-field" value={form.itemType} onChange={(event) => onChange({ itemType: event.target.value as ItemFormState["itemType"] })} style={{ ...fieldStyle, marginTop: "5px" }}>
            <option value="event">Event</option>
            <option value="period">Period</option>
          </select>
        </label>

        <label style={labelStyle}>
          Display name
          <input className="ui-field" type="text" placeholder="Display name" value={form.title} onChange={(event) => onChange({ title: event.target.value })} style={{ ...fieldStyle, marginTop: "5px" }} />
        </label>

        <label style={labelStyle}>
          Full name
          <input className="ui-field" type="text" placeholder="Optional full name" value={form.fullName} onChange={(event) => onChange({ fullName: event.target.value })} style={{ ...fieldStyle, marginTop: "5px" }} />
        </label>

        <label style={labelStyle}>
          Description
          <textarea className="ui-field" placeholder="Description..." value={form.description} onChange={(event) => onChange({ description: event.target.value })} style={{ ...fieldStyle, minHeight: "84px", resize: "vertical", marginTop: "5px" }} />
        </label>

        <label style={labelStyle}>
          Works
          <textarea className="ui-field" placeholder="Optional works..." value={form.works} onChange={(event) => onChange({ works: event.target.value })} style={{ ...fieldStyle, minHeight: "64px", resize: "vertical", marginTop: "5px" }} />
        </label>

        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <label style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>
            Box color
            <span style={{ position: "relative", display: "block", width: "40px", height: "40px", marginTop: "5px", border: "1px solid #d6dbe1", borderRadius: "50%", backgroundColor: form.color, overflow: "hidden" }}>
              <input type="color" value={form.color} onChange={(event) => onChange({ color: event.target.value })} aria-label="Box color" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
            </span>
          </label>
          <label style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>
            Text color
            <span style={{ position: "relative", display: "block", width: "40px", height: "40px", marginTop: "5px", border: "1px solid #d6dbe1", borderRadius: "50%", backgroundColor: form.textColor, overflow: "hidden" }}>
              <input type="color" value={form.textColor} onChange={(event) => onChange({ textColor: event.target.value })} aria-label="Text color" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
            </span>
          </label>
        </div>

        <div style={{ ...labelStyle, marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Tags</span>
            <button type="button" onClick={() => setShowTagCreator((current) => !current)} style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: "pointer", fontSize: "12px" }}>
              Add tag
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "6px" }}>
            {form.tags.map((tagName) => {
              const tag = availableTagByName.get(tagName);
              return (
                <span
                  key={tagName}
                  className="item-tag-chip"
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", border: `1px solid ${tag?.color ?? "#94a3b8"}`, borderRadius: "12px", backgroundColor: tag?.color ?? "#94a3b8", color: "white", fontSize: "12px" }}
                >
                  {tagName}
                  <button
                    type="button"
                    onClick={() => onChange({ tags: form.tags.filter((name) => name !== tagName) })}
                    aria-label={`Remove ${tagName} tag`}
                    className="item-tag-chip-remove"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", border: "none", borderRadius: "50%", background: "rgba(255,255,255,0.35)", color: "white", fontSize: "10px", lineHeight: 1, cursor: "pointer", padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <button type="button" onClick={() => setShowTagPicker((current) => !current)} style={{ width: "100%", marginTop: "8px", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: "pointer", fontSize: "12px" }}>
            Add tags to item
          </button>
          {showTagCreator && <div style={{ display: "flex", gap: "5px", marginTop: "7px" }}>
            <input className="ui-field" value={newTagName} onChange={(event) => setNewTagName(event.target.value)} placeholder="Tag name" style={{ ...fieldStyle, flex: 1 }} />
            <input type="color" value={newTagColor} onChange={(event) => setNewTagColor(event.target.value)} aria-label="New tag color" style={{ width: "38px", padding: 0, border: "none", background: "transparent", cursor: "pointer" }} />
            <button type="button" onClick={onCreateTag} style={{ padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", cursor: "pointer" }}>Add</button>
          </div>}
          {showTagPicker && <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "7px", padding: "8px", border: "1px solid #e2e8f0", borderRadius: "4px", backgroundColor: "white" }}>
            {availableTags.length === 0 ? <span style={{ color: "#64748b", fontSize: "12px" }}>No tags created yet.</span> : availableTagRows.map(({ tag, depth }) => {
              const isSelected = form.tags.includes(tag.name);
              return (
                <button
                  className="ui-chip"
                  key={tag.name}
                  type="button"
                  onClick={() => onChange({
                    tags: isSelected ? form.tags.filter((name) => name !== tag.name) : [...form.tags, tag.name],
                    // Adopt the first tag's color as the item's box and text color.
                    ...(!isSelected && form.tags.length === 0 ? { color: tag.color, textColor: tag.color } : {}),
                  })}
                  style={{ padding: `6px 8px 6px ${6 + depth}px`, border: `1px solid ${tag.color}`, borderRadius: "4px", backgroundColor: isSelected ? tag.color : "white", color: isSelected ? "white" : "#334155", cursor: "pointer", textAlign: "left" }}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>}
        </div>

        <fieldset style={{ margin: "0 0 14px", padding: "8px 10px", border: "1px solid #d6dbe1", borderRadius: "4px", color: "#334155", fontSize: "13px" }}>
          <legend style={{ padding: "0 4px" }}>Teachers</legend>
          {teacherOptions.length === 0 ? (
            <span style={{ color: "#64748b", fontSize: "12px" }}>No other items yet.</span>
          ) : (
            <>
            <input
              type="search"
              aria-label="Search teachers"
              placeholder="Search teachers..."
              value={teacherQuery}
              onChange={(event) => setTeacherQuery(event.target.value)}
              style={{ width: "100%", boxSizing: "border-box", margin: "0 0 6px", padding: "4px 7px", border: "1px solid #d6dbe1", borderRadius: "4px", backgroundColor: "rgba(255,255,255,0.85)", color: "#1f2933", fontSize: "12px" }}
            />
            <div style={{ display: "grid", gap: "4px", maxHeight: "120px", overflowY: "auto" }}>
              {visibleTeacherOptions.length === 0 && (
                <span style={{ color: "#64748b", fontSize: "12px" }}>No matching items.</span>
              )}
              {visibleTeacherOptions.map((option) => {
                const isTeacher = form.teacherIds.includes(option.id);
                const isGrandTeacher = form.grandTeacherIds.includes(option.id);

                return (
                <div key={option.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={isTeacher}
                      onChange={(event) => onChange({
                        teacherIds: event.target.checked
                          ? [...form.teacherIds, option.id]
                          : form.teacherIds.filter((id) => id !== option.id),
                        grandTeacherIds: event.target.checked
                          ? form.grandTeacherIds
                          : form.grandTeacherIds.filter((id) => id !== option.id),
                      })}
                    />
                    {option.title}
                  </label>
                  <button
                    type="button"
                    aria-pressed={isGrandTeacher}
                    title="Grand-teacher: draw this teacher's line dotted"
                    onClick={() => onChange(isGrandTeacher
                      ? { grandTeacherIds: form.grandTeacherIds.filter((id) => id !== option.id) }
                      : {
                          teacherIds: isTeacher ? form.teacherIds : [...form.teacherIds, option.id],
                          grandTeacherIds: [...form.grandTeacherIds, option.id],
                        })}
                    style={{ flex: "none", padding: "1px 6px", border: "1px solid #cbd5e1", borderRadius: "10px", backgroundColor: isGrandTeacher ? "#dbeafe" : "white", color: isGrandTeacher ? "#1e40af" : "#64748b", cursor: "pointer", fontSize: "10px" }}
                  >
                    grand
                  </button>
                </div>
                );
              })}
            </div>
            </>
          )}
        </fieldset>

        <div style={labelStyle}>
        <label style={{ display: "block" }}>
            {form.itemType === "period" ? "Start date" : "Date"}
          <input
            className="ui-field"
            type="text"
            placeholder="day month year"
            value={startDateText}
            onFocus={() => setOpenDateField("start")}
            onChange={(event) => setStartDateText(event.target.value)}
            onBlur={() => {
              const parsed = parseDateText(startDateText);
              if (!parsed) {
                setStartDateText(formatDateText(form.startYear, form.startMonth, form.startDay));
                return;
              }
              onChange({ startYear: parsed.year, startMonth: parsed.month, startDay: parsed.day });
              setStartDateText(formatDateText(parsed.year, parsed.month, parsed.day));
            }}
            style={{ ...fieldStyle, marginTop: "5px" }}
          />
          <span style={{ display: "block", marginTop: "4px", color: "#94a3b8", fontSize: "11px" }}>Month/day are extra info only — the timeline still shows the item by year.</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "12px" }}>
          <input type="checkbox" checked={form.startApproximate} onChange={(event) => onChange({ startApproximate: event.target.checked })} />
          Approximate
        </label>
        </div>

        {form.itemType === "period" && (
          <div style={labelStyle}>
          <label style={{ display: "block" }}>
            End date
            <input
              className="ui-field"
              type="text"
              placeholder="day month year"
              value={endDateText}
              onFocus={() => setOpenDateField("end")}
              onChange={(event) => setEndDateText(event.target.value)}
              onBlur={() => {
                const parsed = parseDateText(endDateText);
                if (!parsed) {
                  setEndDateText(formatDateText(form.endYear, form.endMonth, form.endDay));
                  return;
                }
                onChange({ endYear: parsed.year, endMonth: parsed.month, endDay: parsed.day });
                setEndDateText(formatDateText(parsed.year, parsed.month, parsed.day));
              }}
              style={{ ...fieldStyle, marginTop: "5px" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "12px" }}>
            <input type="checkbox" checked={form.endApproximate} onChange={(event) => onChange({ endApproximate: event.target.checked })} />
            Approximate
          </label>
          </div>
        )}

        <label style={labelStyle}>
          Text position
          {tagPositionPreference ? (
            <div style={{ marginTop: "5px", padding: "9px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "#f8fafc", color: "#475569", fontSize: "13px" }}>
              Following tag setting: {tagPositionPreference}
            </div>
          ) : (
            <div style={{ display: "flex", gap: "6px", marginTop: "5px" }}>
              {(["above", "below"] as const).map((position) => (
                <button className="ui-button" key={position} type="button" onClick={() => onChange({ position })} style={{ flex: 1, padding: "9px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: form.position === position ? "#dbeafe" : "white", color: "#334155", cursor: "pointer", fontSize: "13px" }}>
                  {position === "above" ? "Above item" : "Below item"}
                </button>
              ))}
            </div>
          )}
        </label>

        <button className="ui-button" type="submit" style={{ width: "100%", padding: "11px", border: "none", borderRadius: "4px", backgroundColor: "#2563eb", color: "white", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>
          {isEditing ? "Done" : "Add Item"}
        </button>

        {isEditing && (
          <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
            <button className="ui-button" type="button" onClick={onDuplicate} style={{ ...fieldStyle, flex: 1, cursor: "pointer" }}>Duplicate</button>
            <button className="ui-button" type="button" onClick={onDelete} style={{ ...fieldStyle, flex: 1, cursor: "pointer", color: "#b91c1c" }}>Delete</button>
          </div>
        )}
      </form>
    </div>

    {openDateField === "start" && (
      <DatePickerPanel
        title={form.itemType === "period" ? "Start date" : "Date"}
        era={form.startEra}
        year={form.startYear}
        month={form.startMonth}
        day={form.startDay}
        onChangeEra={handleStartEraChange}
        onChangeYear={handleStartYearChange}
        onChangeMonth={handleStartMonthChange}
        onChangeDay={handleStartDayChange}
        onClose={closeDatePicker}
      />
    )}

    {openDateField === "end" && (
      <DatePickerPanel
        title="End date"
        era={form.endEra}
        year={form.endYear}
        month={form.endMonth}
        day={form.endDay}
        onChangeEra={handleEndEraChange}
        onChangeYear={handleEndYearChange}
        onChangeMonth={handleEndMonthChange}
        onChangeDay={handleEndDayChange}
        onClose={closeDatePicker}
      />
    )}
    </>
  );
}

export default memo(AddItemFormImpl);

