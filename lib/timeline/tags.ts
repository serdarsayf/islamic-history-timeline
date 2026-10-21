import type { TimelineItem, TimelineTag } from "./types";

export const defaultTags: TimelineTag[] = [];

export function createTimelineTag(
  tags: TimelineTag[],
  nameValue: string,
  color: string
) {
  const name = nameValue.trim();
  if (!name || tags.some((tag) => tag.name === name)) return null;
  return { name, color } satisfies TimelineTag;
}

type TagNode = {
  tag: TimelineTag;
  children: TagNode[];
};

function normalizeTagTree(tags: TimelineTag[]) {
  const nodes = tags.map((tag) => ({ tag, children: [] as TagNode[] }));
  const nodesByName = new Map(nodes.map((node) => [node.tag.name, node]));
  const roots: TagNode[] = [];

  nodes.forEach((node) => {
    const parent = node.tag.parentName
      ? nodesByName.get(node.tag.parentName)
      : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  return roots;
}

function flattenTagTree(nodes: TagNode[]): TimelineTag[] {
  return nodes.flatMap((node) => [
    node.tag,
    ...flattenTagTree(node.children),
  ]);
}

function findTagNode(
  nodes: TagNode[],
  name: string,
  siblings: TagNode[] = nodes
): { node: TagNode; siblings: TagNode[]; index: number } | null {
  for (let index = 0; index < siblings.length; index += 1) {
    const node = siblings[index];
    if (node.tag.name === name) return { node, siblings, index };
    const childMatch = findTagNode(nodes, name, node.children);
    if (childMatch) return childMatch;
  }
  return null;
}

export function normalizeTimelineTags(value: unknown): TimelineTag[] {
  if (!Array.isArray(value)) return [];

  const seenNames = new Set<string>();
  const tags = value.flatMap((candidate): TimelineTag[] => {
    if (
      !candidate ||
      typeof candidate.name !== "string" ||
      !candidate.name.trim() ||
      typeof candidate.color !== "string" ||
      seenNames.has(candidate.name)
    ) {
      return [];
    }

    seenNames.add(candidate.name);
    return [{
      name: candidate.name,
      color: candidate.color,
      ...(candidate.isMeta === true ? { isMeta: true } : {}),
      ...(candidate.itemPosition === "above" || candidate.itemPosition === "below"
        ? { itemPosition: candidate.itemPosition }
        : {}),
      ...(typeof candidate.itemPositionUpdatedAt === "number" && Number.isFinite(candidate.itemPositionUpdatedAt)
        ? { itemPositionUpdatedAt: candidate.itemPositionUpdatedAt }
        : {}),
      ...(typeof candidate.parentName === "string" && candidate.parentName !== candidate.name
        ? { parentName: candidate.parentName }
        : {}),
    }];
  });
  const names = new Set(tags.map((tag) => tag.name));
  const asRoot = (tag: TimelineTag): TimelineTag => ({
    name: tag.name,
    color: tag.color,
    ...(tag.isMeta ? { isMeta: true } : {}),
    ...(tag.itemPosition ? { itemPosition: tag.itemPosition } : {}),
    ...(tag.itemPositionUpdatedAt === undefined ? {} : { itemPositionUpdatedAt: tag.itemPositionUpdatedAt }),
  });
  const tagsWithValidParents = tags.map((tag) =>
    tag.parentName && names.has(tag.parentName)
      ? tag
      : asRoot(tag)
  );
  const tagsByName = new Map(tagsWithValidParents.map((tag) => [tag.name, tag]));

  const tagsWithoutCycles = tagsWithValidParents.map((tag) => {
    const visited = new Set([tag.name]);
    let parentName = tag.parentName;
    while (parentName) {
      if (visited.has(parentName)) {
        return asRoot(tag);
      }
      visited.add(parentName);
      parentName = tagsByName.get(parentName)?.parentName;
    }
    return tag;
  });

  return flattenTagTree(normalizeTagTree(tagsWithoutCycles));
}

export function getTagDepth(tags: TimelineTag[], tagName: string) {
  const tagsByName = new Map(tags.map((tag) => [tag.name, tag]));
  const visited = new Set<string>();
  let depth = 0;
  let parentName = tagsByName.get(tagName)?.parentName;

  while (parentName && !visited.has(parentName)) {
    visited.add(parentName);
    depth += 1;
    parentName = tagsByName.get(parentName)?.parentName;
  }

  return depth;
}

export function isMetaTag(tags: TimelineTag[], tagName: string) {
  return tags.some((tag) => tag.name === tagName && tag.isMeta === true);
}

export function getTagItemPosition(tags: TimelineTag[], tagNames: string[]) {
  const itemTags = new Set(tagNames);
  let latestTag: TimelineTag | undefined;

  tags.forEach((tag) => {
    if (
      !itemTags.has(tag.name) ||
      (tag.itemPosition !== "above" && tag.itemPosition !== "below")
    ) {
      return;
    }

    if (
      !latestTag ||
      (tag.itemPositionUpdatedAt ?? 0) >=
        (latestTag.itemPositionUpdatedAt ?? 0)
    ) {
      latestTag = tag;
    }
  });

  return latestTag?.itemPosition ?? null;
}

export function setTimelineTagItemPosition(
  tags: TimelineTag[],
  tagName: string,
  itemPosition: TimelineTag["itemPosition"],
  updatedAt: number
) {
  return tags.map((tag) =>
    tag.name === tagName
      ? { ...tag, itemPosition, itemPositionUpdatedAt: itemPosition ? updatedAt : undefined }
      : tag
  );
}

export function getTagBranchNames(tags: TimelineTag[], tagName: string) {
  const tagsByName = new Map(tags.map((tag) => [tag.name, tag]));

  return tags
    .filter((tag) => {
      if (tag.name === tagName) return true;
      const visited = new Set<string>();
      let parentName = tag.parentName;
      while (parentName && !visited.has(parentName)) {
        if (parentName === tagName) return true;
        visited.add(parentName);
        parentName = tagsByName.get(parentName)?.parentName;
      }
      return false;
    })
    .map((tag) => tag.name);
}

export function moveTimelineTag(
  tags: TimelineTag[],
  tagName: string,
  direction: -1 | 1
) {
  const roots = normalizeTagTree(normalizeTimelineTags(tags));
  const match = findTagNode(roots, tagName);
  if (!match) return tags;

  const targetIndex = match.index + direction;
  if (targetIndex < 0 || targetIndex >= match.siblings.length) return tags;

  [match.siblings[match.index], match.siblings[targetIndex]] = [
    match.siblings[targetIndex],
    match.siblings[match.index],
  ];
  return flattenTagTree(roots);
}

export function nestTimelineTag(tags: TimelineTag[], tagName: string) {
  const roots = normalizeTagTree(normalizeTimelineTags(tags));
  const match = findTagNode(roots, tagName);
  if (!match || match.index === 0) return tags;

  const parent = match.siblings[match.index - 1];
  match.siblings.splice(match.index, 1);
  match.node.tag = { ...match.node.tag, parentName: parent.tag.name };
  parent.children.push(match.node);
  return flattenTagTree(roots);
}

export function unnestTimelineTag(tags: TimelineTag[], tagName: string) {
  const roots = normalizeTagTree(normalizeTimelineTags(tags));
  const match = findTagNode(roots, tagName);
  const parentName = match?.node.tag.parentName;
  if (!match || !parentName) return tags;

  const parentMatch = findTagNode(roots, parentName);
  if (!parentMatch) return tags;

  match.siblings.splice(match.index, 1);
  match.node.tag = parentMatch.node.tag.parentName
    ? { ...match.node.tag, parentName: parentMatch.node.tag.parentName }
    : { name: match.node.tag.name, color: match.node.tag.color };
  parentMatch.siblings.splice(parentMatch.index + 1, 0, match.node);
  return flattenTagTree(roots);
}

export function setTimelineTagParent(
  tags: TimelineTag[],
  tagName: string,
  parentName: string | null
) {
  const normalizedTags = normalizeTimelineTags(tags);
  if (parentName && getTagBranchNames(normalizedTags, tagName).includes(parentName)) {
    return tags;
  }

  const roots = normalizeTagTree(normalizedTags);
  const match = findTagNode(roots, tagName);
  const parentMatch = parentName ? findTagNode(roots, parentName) : null;
  if (!match || (parentName && !parentMatch)) return tags;
  if (match.node.tag.parentName === parentName) return tags;

  match.siblings.splice(match.index, 1);
  match.node.tag = parentName
    ? { ...match.node.tag, parentName }
    : { name: match.node.tag.name, color: match.node.tag.color };

  if (parentMatch) parentMatch.node.children.push(match.node);
  else roots.push(match.node);

  return flattenTagTree(roots);
}

export function deleteTimelineTag(tags: TimelineTag[], tagName: string) {
  const roots = normalizeTagTree(normalizeTimelineTags(tags));
  const match = findTagNode(roots, tagName);
  if (!match) return tags;

  const parentName = match.node.tag.parentName;
  const promotedChildren = match.node.children.map((child) => {
    child.tag = parentName
      ? { ...child.tag, parentName }
      : { name: child.tag.name, color: child.tag.color };
    return child;
  });
  match.siblings.splice(match.index, 1, ...promotedChildren);
  return flattenTagTree(roots);
}

function normalizeTagName(tagName: string) {
  return tagName.trim().toLocaleLowerCase();
}

export function getUsedTags(items: TimelineItem[], tags: TimelineTag[]) {
  const usedNames = new Set(items.flatMap((item) => item.tags ?? []));
  return tags.filter((tag) => usedNames.has(tag.name));
}

export function filterItemsByTags(
  items: TimelineItem[],
  activeTagNames: string[],
  tags: TimelineTag[] = []
) {
  if (activeTagNames.length === 0) return items;
  const activeTags = new Set(
    activeTagNames.flatMap((name) =>
      getTagBranchNames(tags, name).map(normalizeTagName)
    )
  );

  return items.filter((item) =>
    (item.tags ?? []).some((tag) =>
      activeTags.has(normalizeTagName(tag))
    )
  );
}
