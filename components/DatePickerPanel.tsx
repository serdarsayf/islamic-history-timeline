import { memo } from "react";

const monthAbbreviations = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

type DatePickerPanelProps = {
  title: string;
  era: "BC" | "CE";
  year: string;
  month: string;
  day: string;
  onChangeEra: (era: "BC" | "CE") => void;
  onChangeYear: (year: string) => void;
  onChangeMonth: (month: string) => void;
  onChangeDay: (day: string) => void;
  onClose: () => void;
};

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "8px 10px",
  border: "1px solid #d6dbe1",
  borderRadius: "4px",
  backgroundColor: "white",
  color: "#1f2933",
  fontSize: "14px",
};

function DatePickerPanelImpl({
  title,
  era,
  year,
  month,
  day,
  onChangeEra,
  onChangeYear,
  onChangeMonth,
  onChangeDay,
  onClose,
}: DatePickerPanelProps) {
  return (
    <div
      className="ui-panel timeline-floating-panel timeline-date-panel"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        top: "20px",
        right: "610px",
        zIndex: 25,
        width: "220px",
        boxSizing: "border-box",
        padding: "16px",
        backgroundColor: "rgba(248,250,252,0.98)",
        border: "1px solid rgba(203,213,225,0.9)",
        borderRadius: "6px",
        boxShadow: "0 12px 28px rgba(15,23,42,0.24)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}>{title}</span>
        <button type="button" onClick={onClose} aria-label="Close date picker" style={{ border: "none", background: "transparent", color: "#64748b", fontSize: "18px", cursor: "pointer" }}>x</button>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", cursor: "pointer", color: "#334155", fontSize: "13px" }}>
        <input
          type="checkbox"
          checked={era === "BC"}
          onChange={(event) => onChangeEra(event.target.checked ? "BC" : "CE")}
          style={{ width: "36px", height: "20px", accentColor: "#2563eb", cursor: "pointer" }}
        />
        BC
      </label>

      <label style={{ display: "block", marginBottom: "10px", color: "#334155", fontSize: "13px" }}>
        Year
        <input className="ui-field" type="number" value={year} onChange={(event) => onChangeYear(event.target.value)} style={{ ...fieldStyle, marginTop: "5px" }} />
      </label>

      <label style={{ display: "block", marginBottom: "10px", color: "#334155", fontSize: "13px" }}>
        Month
        <select className="ui-field" value={month} onChange={(event) => onChangeMonth(event.target.value)} style={{ ...fieldStyle, marginTop: "5px" }}>
          <option value="">—</option>
          {monthAbbreviations.map((name, index) => (
            <option key={name} value={String(index + 1)}>{name}</option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", color: "#334155", fontSize: "13px" }}>
        Day
        <input className="ui-field" type="number" min="1" max="31" value={day} onChange={(event) => onChangeDay(event.target.value)} style={{ ...fieldStyle, marginTop: "5px" }} />
      </label>
    </div>
  );
}

export default memo(DatePickerPanelImpl);
