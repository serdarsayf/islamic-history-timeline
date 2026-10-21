// ─────────────────────────────────────
// HISTORICAL DATE
// Represents a date using the BC/CE
// calendar system.
// ─────────────────────────────────────

export type HistoricalDate = {
  year: number;
  era: "BC" | "CE";
  month?: number;
  day?: number;
  approximate?: boolean;
};

// ─────────────────────────────────────
// DATE → NUMBER
// Converts a historical date into an
// internal numerical coordinate.
//
// There is no historical year 0.
// 1 BC = 0
// 2 BC = -1
// 1 CE  = 1
// 2 CE  = 2
// ─────────────────────────────────────

export function dateToNumber(
  date: HistoricalDate
) {
  if (date.era === "BC") {
    return -(date.year - 1);
  }

  return date.year;
}

export function getYearLabel(year: number) {
  if (year <= 0) {
    return `${Math.abs(year) + 1} BC`;
  }

  return `${year} CE`;
}

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─────────────────────────────────────
// MONTH/DAY LABEL
// Formats the optional month/day portion
// of a date. This is display-only info and
// never affects the item's timeline position.
// ─────────────────────────────────────

export function getMonthDayLabel(
  date: HistoricalDate
) {
  if (!date.month) {
    return null;
  }

  const monthName = monthNames[date.month - 1];

  return date.day
    ? `${date.day} ${monthName}`
    : monthName;
}


export function getHijriYear(
  gregorianYear: number
) {
  return Math.max(
    1,
    Math.floor(
      ((gregorianYear - 622) * 33) /
        32
    ) + 1
  );
}

export const PIXELS_PER_YEAR = 4;

// Parses an optional integer within [min, max], returning undefined
// for blank or out-of-range input instead of throwing.
export function parseOptionalInRange(
  value: string,
  min: number,
  max: number
) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : undefined;
}

