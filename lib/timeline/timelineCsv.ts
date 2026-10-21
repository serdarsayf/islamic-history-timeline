import { parseOptionalInRange } from "../timeline";
import { isCalendarEra, isChronologicalRange, isPositiveWholeYear } from "./validation";
import { normalizeTimelineTags } from "./tags";
import { pruneTeacherIds } from "./lineage";
import type { TimelineItem, TimelineTag } from "./types";

export const timelineCsvHeaders = [
  "id",
  "type",
  "name",
  "description",
  "boxColor",
  "textColor",
  "tags",
  "startYear",
  "startEra",
  "startMonth",
  "startDay",
  "endYear",
  "endEra",
  "endMonth",
  "endDay",
  "textPosition",
  "tagHierarchy",
  "fullName",
  "works",
  "recordType",
  "startApproximate",
  "endApproximate",
  "teacherIds",
  "grandTeacherIds",
] as const;

const teacherTimelineCsvHeaders = timelineCsvHeaders.slice(0, -1);
const approximateTimelineCsvHeaders = timelineCsvHeaders.slice(0, -2);
const recordTypeTimelineCsvHeaders = timelineCsvHeaders.slice(0, -4);
const worksTimelineCsvHeaders = timelineCsvHeaders.slice(0, -5);
const fullNameTimelineCsvHeaders = timelineCsvHeaders.slice(0, -6);
const hierarchyOnlyTimelineCsvHeaders = timelineCsvHeaders.slice(0, -7);
const legacyTimelineCsvHeaders = timelineCsvHeaders.slice(0, -8);

function parseTagEntry(entry: string): TimelineTag | null {
  const separatorIndex = entry.lastIndexOf(":");
  if (separatorIndex === -1) return null;

  const name = entry.slice(0, separatorIndex).trim();
  const color = entry.slice(separatorIndex + 1).trim();
  if (!name) return null;

  return { name, color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#94a3b8" };
}

function escapeCsvValue(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

export function exportTimelineCsv(
  items: TimelineItem[],
  tags: TimelineTag[]
) {
  const knownTagNames = new Set(tags.map((tag) => tag.name));
  const tagCatalog = normalizeTimelineTags([
    ...tags,
    ...Array.from(new Set(items.flatMap((item) => item.tags)))
      .filter((name) => !knownTagNames.has(name))
      .map((name) => ({ name, color: "#94a3b8" })),
  ]);
  const tagCatalogRow = Array<string | number>(timelineCsvHeaders.length).fill("");
  tagCatalogRow[timelineCsvHeaders.indexOf("tagHierarchy")] = JSON.stringify(tagCatalog);
  tagCatalogRow[timelineCsvHeaders.indexOf("recordType")] = "tagCatalog";

  return [
    timelineCsvHeaders,
    tagCatalogRow,
    ...items.map((item) => [
      item.id,
      item.type,
      item.title,
      item.description,
      item.color,
      item.textColor,
      JSON.stringify(item.tags),
      item.startDate.year,
      item.startDate.era,
      item.startDate.month ?? "",
      item.startDate.day ?? "",
      item.endDate?.year ?? "",
      item.endDate?.era ?? "",
      item.endDate?.month ?? "",
      item.endDate?.day ?? "",
      item.position,
      "",
      item.fullName ?? "",
      item.works ?? "",
      "item",
      item.startDate.approximate ? "true" : "",
      item.endDate?.approximate ? "true" : "",
      item.teacherIds?.length ? JSON.stringify(item.teacherIds) : "",
      item.grandTeacherIds?.length ? JSON.stringify(item.grandTeacherIds) : "",
    ]),
  ]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parsePositiveYear(value: string, field: string) {
  const year = Number(value);
  if (!isPositiveWholeYear(year)) {
    throw new Error(`${field} must be a positive whole year.`);
  }
  return year;
}

function parseEra(value: string, field: string) {
  if (!isCalendarEra(value)) {
    throw new Error(`${field} must be BC or CE.`);
  }
  return value;
}

function parseOptionalMonth(value: string, field: string) {
  const month = parseOptionalInRange(value, 1, 12);
  if (value && month === undefined) {
    throw new Error(`${field} must be between 1 and 12.`);
  }
  return month;
}

function parseOptionalDay(value: string, field: string) {
  const day = parseOptionalInRange(value, 1, 31);
  if (value && day === undefined) {
    throw new Error(`${field} must be between 1 and 31.`);
  }
  return day;
}

export function importTimelineCsv(
  csv: string,
  options: { allowExternalTeacherIds?: boolean } = {}
) {
  const rows = parseCsvRows(csv);
  const headers = rows.shift();

  const hasGrandTeachers =
    headers?.join(",") === timelineCsvHeaders.join(",");
  const hasTeachers =
    hasGrandTeachers || headers?.join(",") === teacherTimelineCsvHeaders.join(",");
  const hasApproximate =
    hasTeachers || headers?.join(",") === approximateTimelineCsvHeaders.join(",");
  const hasRecordType =
    hasApproximate || headers?.join(",") === recordTypeTimelineCsvHeaders.join(",");
  const hasWorks =
    hasRecordType || headers?.join(",") === worksTimelineCsvHeaders.join(",");
  const hasFullName =
    hasWorks ||
    headers?.join(",") === fullNameTimelineCsvHeaders.join(",");
  const hasTagHierarchy =
    hasFullName ||
    headers?.join(",") === hierarchyOnlyTimelineCsvHeaders.join(",");
  const hasLegacyHeaders =
    headers?.join(",") === legacyTimelineCsvHeaders.join(",");

  if (!headers || (!hasTagHierarchy && !hasLegacyHeaders)) {
    throw new Error(`Expected columns: ${timelineCsvHeaders.join(", ")}.`);
  }

  const tagsByName = new Map<string, TimelineTag>();
  const tagHierarchyRows: TimelineTag[][] = [];
  const seenIds = new Set<number>();
  const itemRows: { cells: string[]; rowNumber: number }[] = [];
  const expectedColumnCount = hasGrandTeachers
    ? timelineCsvHeaders.length
    : hasTeachers
    ? teacherTimelineCsvHeaders.length
    : hasApproximate
      ? approximateTimelineCsvHeaders.length
      : hasRecordType
      ? recordTypeTimelineCsvHeaders.length
      : hasWorks
      ? worksTimelineCsvHeaders.length
      : hasFullName
        ? fullNameTimelineCsvHeaders.length
        : hasTagHierarchy
          ? hierarchyOnlyTimelineCsvHeaders.length
          : legacyTimelineCsvHeaders.length;

  rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== expectedColumnCount) {
      throw new Error(`Row ${rowNumber}: expected ${expectedColumnCount} columns.`);
    }

    if (hasRecordType) {
      const recordType = cells[timelineCsvHeaders.indexOf("recordType")];
      if (recordType === "tagCatalog") {
        if (tagHierarchyRows.length > 0) {
          throw new Error(`Row ${rowNumber}: duplicate tag catalog record.`);
        }
        try {
          const parsedHierarchy: unknown = JSON.parse(
            cells[timelineCsvHeaders.indexOf("tagHierarchy")]
          );
          if (!Array.isArray(parsedHierarchy)) throw new Error();
          tagHierarchyRows.push(normalizeTimelineTags(parsedHierarchy));
        } catch {
          throw new Error(`Row ${rowNumber}: tagHierarchy must contain a valid tag list.`);
        }
        return;
      }
      if (recordType !== "item") {
        throw new Error(`Row ${rowNumber}: recordType must be item or tagCatalog.`);
      }
    } else if (
      hasTagHierarchy &&
      !cells[0].trim() &&
      !cells[1].trim() &&
      cells[timelineCsvHeaders.indexOf("tagHierarchy")]
    ) {
      try {
        const parsedHierarchy: unknown = JSON.parse(
          cells[timelineCsvHeaders.indexOf("tagHierarchy")]
        );
        if (!Array.isArray(parsedHierarchy)) throw new Error();
        tagHierarchyRows.push(normalizeTimelineTags(parsedHierarchy));
      } catch {
        throw new Error(`Row ${rowNumber}: tagHierarchy must contain a valid tag list.`);
      }
      return;
    }

    itemRows.push({ cells, rowNumber });
  });

  if (hasRecordType && tagHierarchyRows.length !== 1) {
    throw new Error("CSV must contain exactly one tag catalog record.");
  }

  const parsedItems = itemRows.map(({ cells, rowNumber }) => {
    const [id, type, title, description, color, textColor, itemTags, startYear, startEra, startMonth, startDay, endYear, endEra, endMonth, endDay, position, serializedTagHierarchy, fullName, works, , startApproximate, endApproximate, serializedTeacherIds, serializedGrandTeacherIds] = cells;

    if (
      !hasRecordType &&
      hasTagHierarchy &&
      serializedTagHierarchy &&
      tagHierarchyRows.length === 0
    ) {
      try {
        const parsedHierarchy: unknown = JSON.parse(serializedTagHierarchy);
        if (!Array.isArray(parsedHierarchy)) throw new Error();
        tagHierarchyRows.push(normalizeTimelineTags(parsedHierarchy));
      } catch {
        throw new Error(`Row ${rowNumber}: tagHierarchy must contain a valid tag list.`);
      }
    }

    const parsedId = Number(id);

    if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
      throw new Error(`Row ${rowNumber}: id must be a positive whole number.`);
    }
    if (seenIds.has(parsedId)) {
      throw new Error(`Row ${rowNumber}: id ${parsedId} is duplicated.`);
    }
    seenIds.add(parsedId);
    if (!title?.trim()) throw new Error(`Row ${rowNumber}: name is required.`);
    if (type !== "event" && type !== "period") throw new Error(`Row ${rowNumber}: type must be event or period.`);
    if (position !== "above" && position !== "below") throw new Error(`Row ${rowNumber}: textPosition must be above or below.`);

    let itemTagNames: string[];
    if (hasRecordType) {
      try {
        const parsedTags: unknown = JSON.parse(itemTags || "[]");
        if (
          !Array.isArray(parsedTags) ||
          parsedTags.some((tag) => typeof tag !== "string" || !tag.trim())
        ) {
          throw new Error();
        }
        itemTagNames = parsedTags;
      } catch {
        throw new Error(`Row ${rowNumber}: tags must contain a valid tag-name list.`);
      }
      itemTagNames.forEach((name) => {
        if (!tagsByName.has(name)) {
          tagsByName.set(name, { name, color: "#94a3b8" });
        }
      });
    } else {
      itemTagNames = (itemTags ? itemTags.split("|") : [])
        .map(parseTagEntry)
        .filter((tag): tag is TimelineTag => tag !== null)
        .map((tag) => {
          if (!tagsByName.has(tag.name)) tagsByName.set(tag.name, tag);
          return tag.name;
        });
    }

    const startYearValue = parsePositiveYear(startYear, `Row ${rowNumber} startYear`);
    let teacherIds: number[] = [];
    if (serializedTeacherIds) {
      try {
        const parsedTeacherIds: unknown = JSON.parse(serializedTeacherIds);
        if (
          !Array.isArray(parsedTeacherIds) ||
          parsedTeacherIds.some((teacherId) => !Number.isSafeInteger(teacherId) || teacherId <= 0)
        ) {
          throw new Error();
        }
        teacherIds = parsedTeacherIds;
      } catch {
        throw new Error(`Row ${rowNumber}: teacherIds must contain a list of item ids.`);
      }
    }
    let grandTeacherIds: number[] = [];
    if (serializedGrandTeacherIds) {
      try {
        const parsedGrandTeacherIds: unknown = JSON.parse(serializedGrandTeacherIds);
        if (
          !Array.isArray(parsedGrandTeacherIds) ||
          parsedGrandTeacherIds.some((teacherId) => !teacherIds.includes(teacherId))
        ) {
          throw new Error();
        }
        grandTeacherIds = parsedGrandTeacherIds;
      } catch {
        throw new Error(`Row ${rowNumber}: grandTeacherIds must list ids that are also in teacherIds.`);
      }
    }
    const startEraValue = parseEra(startEra, `Row ${rowNumber} startEra`);
    const endYearValue = type === "period"
      ? parsePositiveYear(endYear, `Row ${rowNumber} endYear`)
      : undefined;
    const endEraValue = type === "period"
      ? parseEra(endEra, `Row ${rowNumber} endEra`)
      : undefined;
    if (endYearValue && endEraValue && !isChronologicalRange(startYearValue, startEraValue, endYearValue, endEraValue)) {
      throw new Error(`Row ${rowNumber}: end date must not come before the start date.`);
    }
    const startMonthValue = parseOptionalMonth(startMonth, `Row ${rowNumber} startMonth`);
    const startDayValue = parseOptionalDay(startDay, `Row ${rowNumber} startDay`);
    const endMonthValue = type === "period"
      ? parseOptionalMonth(endMonth, `Row ${rowNumber} endMonth`)
      : undefined;
    const endDayValue = type === "period"
      ? parseOptionalDay(endDay, `Row ${rowNumber} endDay`)
      : undefined;

    return {
      id: parsedId,
      type,
      title: title.trim(),
      ...(fullName?.trim() ? { fullName: fullName.trim() } : {}),
      description: description ?? "",
      ...(works?.trim() ? { works: works.trim() } : {}),
      color: color || "#ddd",
      textColor: textColor || "#ffffff",
      tags: itemTagNames,
      ...(teacherIds.length > 0 ? { teacherIds } : {}),
      ...(grandTeacherIds.length > 0 ? { grandTeacherIds } : {}),
      startDate: {
        year: startYearValue,
        era: startEraValue,
        ...(startMonthValue === undefined ? {} : { month: startMonthValue }),
        ...(startDayValue === undefined ? {} : { day: startDayValue }),
        ...(startApproximate === "true" ? { approximate: true } : {}),
      },
      ...(type === "period"
        ? { endDate: {
            year: endYearValue!,
            era: endEraValue!,
            ...(endMonthValue === undefined ? {} : { month: endMonthValue }),
            ...(endDayValue === undefined ? {} : { day: endDayValue }),
            ...(endApproximate === "true" ? { approximate: true } : {}),
          } }
        : {}),
      position,
    } satisfies TimelineItem;
  });

  if (!options.allowExternalTeacherIds) {
    for (const item of parsedItems) {
      const missingTeacherId = item.teacherIds?.find((teacherId) => !seenIds.has(teacherId));
      if (missingTeacherId !== undefined) {
        throw new Error(`Item ${item.id}: teacher id ${missingTeacherId} is not present in this CSV.`);
      }
    }
  }

  const items = options.allowExternalTeacherIds
    ? parsedItems
    : pruneTeacherIds(parsedItems);

  const tagHierarchy = tagHierarchyRows[0] ?? [];
  const hierarchyNames = new Set(tagHierarchy.map((tag) => tag.name));
  const importedTags = normalizeTimelineTags([
    ...tagHierarchy,
    ...Array.from(tagsByName.values()).filter((tag) => !hierarchyNames.has(tag.name)),
  ]);

  return { items, tags: importedTags };
}
