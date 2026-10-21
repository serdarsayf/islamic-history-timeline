import { getNextItemId } from "./types";
import { pruneTeacherIds } from "./lineage";
import { getTagBranchNames, normalizeTimelineTags } from "./tags";
import { exportTimelineCsv, importTimelineCsv } from "./timelineCsv";
import type { TimelineItem, TimelineTag } from "./types";

type ExternalTeacherReference = { id: number; identity: string };

function teacherIdentity(item: TimelineItem) {
  return JSON.stringify({
    type: item.type,
    title: item.title,
    fullName: item.fullName ?? null,
    startDate: item.startDate,
    endDate: item.endDate ?? null,
  });
}

function isExternalTeacherReference(value: unknown): value is ExternalTeacherReference {
  return typeof value === "object" && value !== null &&
    Number.isSafeInteger((value as ExternalTeacherReference).id) &&
    typeof (value as ExternalTeacherReference).identity === "string";
}

export function exportTimelineCategory(
  category: TimelineTag,
  items: TimelineItem[],
  tags: TimelineTag[]
) {
  const categoryNames = new Set([
    ...getTagBranchNames(tags, category.name),
    category.name,
  ]);
  const categoryItems = items.filter((item) =>
    item.tags.some((name) => categoryNames.has(name))
  );
  const includedItemIds = new Set(categoryItems.map((item) => item.id));
  const externalTeacherIds = new Set(categoryItems.flatMap((item) => item.teacherIds ?? [])
    .filter((teacherId) => !includedItemIds.has(teacherId)));
  const teacherReferences = items
    .filter((item) => externalTeacherIds.has(item.id))
    .map((item) => ({ id: item.id, identity: teacherIdentity(item) }));
  const includedNames = new Set([
    ...categoryNames,
    ...categoryItems.flatMap((item) => item.tags),
  ]);
  const categoryTags = normalizeTimelineTags([
    ...tags
      .filter((tag) => includedNames.has(tag.name))
      .map((tag) => {
        if (tag.name === category.name) {
          return { ...tag, parentName: undefined };
        }
        if (tag.parentName && !includedNames.has(tag.parentName)) {
          return { name: tag.name, color: tag.color };
        }
        return tag;
      }),
    ...(!includedNames.has(category.name) ? [category] : []),
  ]);
  const exportedCategory =
    categoryTags.find((tag) => tag.name === category.name) ?? category;

  return JSON.stringify({
    format: "timeline-category",
    version: 1,
    category: exportedCategory,
    tags: categoryTags,
    itemsCsv: exportTimelineCsv(categoryItems, categoryTags),
    ...(teacherReferences.length ? { teacherReferences } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function importTimelineCategory(json: string) {
  let packageData: unknown;
  try {
    packageData = JSON.parse(json);
  } catch {
    throw new Error("Category file must contain valid JSON.");
  }

  if (
    !isRecord(packageData) ||
    packageData.format !== "timeline-category" ||
    packageData.version !== 1 ||
    !isRecord(packageData.category) ||
    typeof packageData.category.name !== "string" ||
    !packageData.category.name.trim() ||
    typeof packageData.category.color !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(packageData.category.color) ||
    typeof packageData.itemsCsv !== "string" ||
    (packageData.tags !== undefined && !Array.isArray(packageData.tags)) ||
    (packageData.teacherReferences !== undefined &&
      (!Array.isArray(packageData.teacherReferences) ||
        !packageData.teacherReferences.every(isExternalTeacherReference)))
  ) {
    throw new Error("File is not a supported timeline category.");
  }

  const category = {
    name: packageData.category.name.trim(),
    color: packageData.category.color,
  };
  const imported = importTimelineCsv(packageData.itemsCsv, { allowExternalTeacherIds: true });
  const packageTags = normalizeTimelineTags(packageData.tags ?? []);
  const tagsByName = new Map(packageTags.map((tag) => [tag.name, tag]));
  imported.tags.forEach((tag) => {
    if (!tagsByName.has(tag.name)) tagsByName.set(tag.name, tag);
  });
  if (!tagsByName.has(category.name)) tagsByName.set(category.name, category);
  const tags = normalizeTimelineTags(Array.from(tagsByName.values()));
  const categoryBranchNames = new Set(
    getTagBranchNames(tags, category.name)
  );

  if (imported.items.some((item) =>
    !item.tags.some((name) => categoryBranchNames.has(name))
  )) {
    throw new Error("Category file contains an item outside its category.");
  }

  return {
    category: tags.find((tag) => tag.name === category.name) ?? category,
    items: imported.items,
    tags,
    ...(Array.isArray(packageData.teacherReferences) && packageData.teacherReferences.length
      ? { teacherReferences: packageData.teacherReferences as ExternalTeacherReference[] }
      : {}),
  };
}

export function mergeTimelineCategoryItems(
  existingItems: TimelineItem[],
  importedItems: TimelineItem[],
  teacherReferences: ExternalTeacherReference[] = []
) {
  const mergedItems = [...existingItems];
  const existingIds = new Set(existingItems.map((item) => item.id));
  const usedIds = new Set(existingIds);
  const mergedIndexesById = new Map(existingItems.map((item, index) => [item.id, index]));
  const fingerprintOf = (item: TimelineItem) =>
    JSON.stringify({ ...item, id: 0, teacherIds: undefined, grandTeacherIds: undefined });
  const idsByFingerprint = new Map(
    existingItems.map((item) => [fingerprintOf(item), item.id])
  );
  const importedIdMap = new Map<number, number>();
  const externalTeacherById = new Map(teacherReferences.map((reference) => [reference.id, reference]));
  let nextId = getNextItemId(existingItems);

  importedItems.forEach((item) => {
    const fingerprint = fingerprintOf(item);
    const existingId = idsByFingerprint.get(fingerprint);
    if (existingId !== undefined) {
      importedIdMap.set(item.id, existingId);
      return;
    }

    let id = item.id;
    if (usedIds.has(id)) {
      while (usedIds.has(nextId)) nextId += 1;
      id = nextId;
      nextId += 1;
    }

    usedIds.add(id);
    idsByFingerprint.set(fingerprint, id);
    importedIdMap.set(item.id, id);
    mergedIndexesById.set(id, mergedItems.length);
    mergedItems.push({ ...item, id, teacherIds: [], grandTeacherIds: [] });
  });

  importedItems.forEach((item) => {
    if (!item.teacherIds?.length) return;
    const studentId = importedIdMap.get(item.id)!;
    const studentIndex = mergedIndexesById.get(studentId)!;
    const mappedByOriginal = new Map(item.teacherIds.map((teacherId) => {
      let mappedId = importedIdMap.get(teacherId);
      if (mappedId === undefined) {
        const externalTeacher = externalTeacherById.get(teacherId);
        if (externalTeacher) {
          const matches = existingItems.filter((existingItem) =>
            teacherIdentity(existingItem) === externalTeacher.identity
          );
          if (matches.length === 1) mappedId = matches[0].id;
        } else if (existingIds.has(teacherId)) {
          mappedId = teacherId;
        }
      }
      if (mappedId === undefined) {
        throw new Error(`Cannot import teacher relationship: teacher item ${teacherId} is not present.`);
      }
      return [teacherId, mappedId] as const;
    }));
    const mappedTeacherIds = [...mappedByOriginal.values()];
    const mappedGrandTeacherIds = (item.grandTeacherIds ?? []).flatMap(
      (teacherId) => mappedByOriginal.get(teacherId) ?? []
    );
    const existingTeacherIds = mergedItems[studentIndex].teacherIds ?? [];
    const existingGrandTeacherIds = mergedItems[studentIndex].grandTeacherIds ?? [];
    mergedItems[studentIndex] = {
      ...mergedItems[studentIndex],
      teacherIds: [...new Set([...existingTeacherIds, ...mappedTeacherIds])],
      grandTeacherIds: [...new Set([...existingGrandTeacherIds, ...mappedGrandTeacherIds])],
    };
  });

  return pruneTeacherIds(mergedItems);
}
