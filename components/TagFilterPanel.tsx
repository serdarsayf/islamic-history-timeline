import { useRef } from "react";
import { useState } from "react";
import type { ChangeEvent } from "react";
import type { TimelineTag } from "../lib/timeline/types";
import { getTagBranchNames, getTagDepth } from "../lib/timeline/tags";
import { useEscapeLayer } from "./useEscapeLayer";

type TagFilterPanelProps = {
  tags: TimelineTag[];
  activeTagNames: string[];
  onExportCategory: (category: TimelineTag) => void;
  onImportCategory: (file: File) => void;
  onCreateTag: (name: string, color: string) => boolean;
  onRenameTag: (oldName: string, newName: string) => boolean;
  onChangeTagColor: (tagName: string, color: string) => void;
  onChangeTagMeta: (tagName: string, isMeta: boolean) => void;
  onChangeTagItemPosition: (tagName: string, position: "above" | "below" | null) => void;
  onMoveTag: (tagName: string, direction: -1 | 1) => void;
  onSetTagParent: (tagName: string, parentName: string | null) => void;
  onDeleteTag: (tagName: string) => void;
  onToggle: (tagName: string) => void;
  onClose: () => void;
};

export default function TagFilterPanel({
  tags,
  activeTagNames,
  onExportCategory,
  onImportCategory,
  onCreateTag,
  onRenameTag,
  onChangeTagColor,
  onChangeTagMeta,
  onChangeTagItemPosition,
  onMoveTag,
  onSetTagParent,
  onDeleteTag,
  onToggle,
  onClose,
}: TagFilterPanelProps) {
  const categoryFileInput = useRef<HTMLInputElement>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#94a3b8");
  const [settingsTagName, setSettingsTagName] = useState<string | null>(null);
  useEscapeLayer(settingsTagName !== null, () => setSettingsTagName(null));
  const settingsTag = tags.find((tag) => tag.name === settingsTagName);
  const settingsSiblings = settingsTag
    ? tags.filter((tag) => tag.parentName === settingsTag.parentName)
    : [];
  const settingsSiblingIndex = settingsSiblings.findIndex(
    (tag) => tag.name === settingsTag?.name
  );
  const showSettings = settingsTag !== undefined;

  function handleCategoryFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onImportCategory(file);
    event.target.value = "";
  }

  function handleCreateTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onCreateTag(newTagName, newTagColor)) return;
    setNewTagName("");
  }

  return (
    <aside className={`ui-panel timeline-floating-panel timeline-tag-panel${showSettings ? " timeline-tag-panel--settings" : ""}`} onPointerDown={(event) => event.stopPropagation()} style={{ position: "absolute", top: "16px", left: "16px", zIndex: 20, width: showSettings ? "min(500px, calc(100vw - 32px))" : "min(360px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", padding: "16px", boxSizing: "border-box", backgroundColor: "rgba(248,250,252,0.97)", border: "1px solid rgba(203,213,225,0.9)", borderRadius: "6px", boxShadow: "0 12px 28px rgba(15,23,42,0.24)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <strong style={{ color: "#1e293b" }}>{settingsTag ? `${settingsTag.name} tag settings` : "Tags"}</strong>
        {showSettings && <button type="button" onClick={() => setSettingsTagName(null)} aria-label="Back to tags" title="Back to tags" style={{ padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: "pointer", fontSize: "12px" }}>Back</button>}
        <button type="button" onClick={onClose} aria-label="Close tags" style={{ border: "none", background: "transparent", color: "#64748b", fontSize: "18px", cursor: "pointer" }}>x</button>
      </div>
      {settingsTag ? (
        <div style={{ display: "grid", gap: "12px" }}>
          <label style={{ display: "grid", gap: "5px", color: "#334155", fontSize: "12px" }}>
            Name
            <input
              key={settingsTag.name}
              aria-label="Tag name"
              defaultValue={settingsTag.name}
              onBlur={(event) => {
                const nextName = event.currentTarget.value.trim();
                if (!nextName || !onRenameTag(settingsTag.name, nextName)) {
                  event.currentTarget.value = settingsTag.name;
                } else {
                  setSettingsTagName(nextName);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              style={{ width: "100%", boxSizing: "border-box", padding: "7px", border: "1px solid #cbd5e1", borderRadius: "4px", color: "#1e293b" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#334155", fontSize: "12px" }}>
            Color
            <input type="color" value={settingsTag.color} aria-label="Tag color" onChange={(event) => onChangeTagColor(settingsTag.name, event.target.value)} style={{ width: "40px", height: "32px", padding: "2px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", cursor: "pointer" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#334155", fontSize: "12px" }}>
            <input type="checkbox" checked={settingsTag.isMeta === true} onChange={(event) => onChangeTagMeta(settingsTag.name, event.target.checked)} />
            Meta-tag
          </label>
          <label style={{ display: "grid", gap: "5px", color: "#334155", fontSize: "12px" }}>
            Position of tagged items
            <select
              value={settingsTag.itemPosition ?? ""}
              onChange={(event) => onChangeTagItemPosition(
                settingsTag.name,
                event.target.value === "above" || event.target.value === "below"
                  ? event.target.value
                  : null
              )}
              style={{ width: "100%", padding: "7px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#1e293b" }}
            >
              <option value="">Use item positions</option>
              <option value="above">Above the timeline</option>
              <option value="below">Below the timeline</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "5px", color: "#334155", fontSize: "12px" }}>
            Place this tag under
            <select
              value={settingsTag.parentName ?? ""}
              onChange={(event) => onSetTagParent(settingsTag.name, event.target.value || null)}
              style={{ width: "100%", padding: "7px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#1e293b" }}
            >
              <option value="">None</option>
              {tags.filter((tag) =>
                tag.name !== settingsTag.name &&
                !getTagBranchNames(tags, settingsTag.name).includes(tag.name)
              ).map((tag) => <option key={tag.name} value={tag.name}>{tag.name}</option>)}
            </select>
          </label>
          <fieldset style={{ display: "grid", gap: "6px", margin: 0, padding: "8px", border: "1px solid #dbe2e8", borderRadius: "4px" }}>
            <legend style={{ padding: "0 4px", color: "#334155", fontSize: "12px" }}>Subtags</legend>
            {tags.filter((tag) => tag.name !== settingsTag.name).map((tag) => {
              const wouldCreateCycle = getTagBranchNames(tags, tag.name).includes(settingsTag.name);
              return <label key={tag.name} style={{ display: "flex", alignItems: "center", gap: "7px", paddingLeft: `${getTagDepth(tags, tag.name) * 12}px`, color: wouldCreateCycle ? "#94a3b8" : "#334155", fontSize: "12px" }}>
                <input
                  type="checkbox"
                  checked={tag.parentName === settingsTag.name}
                  disabled={wouldCreateCycle}
                  onChange={(event) => onSetTagParent(tag.name, event.target.checked ? settingsTag.name : null)}
                />
                {tag.name}
              </label>;
            })}
            {tags.length <= 1 && <span style={{ color: "#64748b", fontSize: "12px" }}>No other tags.</span>}
          </fieldset>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button type="button" title="Move tag up" aria-label="Move tag up" disabled={settingsSiblingIndex <= 0} onClick={() => onMoveTag(settingsTag.name, -1)} style={{ width: "34px", height: "32px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: settingsSiblingIndex <= 0 ? "default" : "pointer", opacity: settingsSiblingIndex <= 0 ? 0.4 : 1 }}>↑</button>
            <button type="button" title="Move tag down" aria-label="Move tag down" disabled={settingsSiblingIndex === settingsSiblings.length - 1} onClick={() => onMoveTag(settingsTag.name, 1)} style={{ width: "34px", height: "32px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: settingsSiblingIndex === settingsSiblings.length - 1 ? "default" : "pointer", opacity: settingsSiblingIndex === settingsSiblings.length - 1 ? 0.4 : 1 }}>↓</button>
            <button type="button" onClick={() => {
              onDeleteTag(settingsTag.name);
              setSettingsTagName(null);
            }} style={{ marginLeft: "auto", padding: "7px 10px", border: "1px solid #fecaca", borderRadius: "4px", backgroundColor: "white", color: "#b91c1c", cursor: "pointer", fontSize: "12px" }}>Delete tag</button>
          </div>
        </div>
      ) : (
        <>
          {tags.length === 0 ? <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>No tags yet.</p> : tags.map((tag) => {
            const active = activeTagNames.includes(tag.name);
            const rowIndent = Math.min(getTagDepth(tags, tag.name) * 12, 48);
            return <div key={tag.name} style={{ display: "flex", gap: "5px", marginBottom: "5px", marginLeft: `${rowIndent}px` }}>
              <button className="ui-chip" type="button" onClick={() => onToggle(tag.name)} style={{ display: "flex", alignItems: "flex-start", gap: "8px", flex: 1, minWidth: 0, padding: "8px", border: `1px solid ${tag.color}`, borderRadius: "4px", backgroundColor: active ? tag.color : "white", color: active ? "white" : "#334155", cursor: "pointer", textAlign: "left" }}><span style={{ width: "10px", height: "10px", flex: "0 0 auto", marginTop: "3px", borderRadius: "50%", backgroundColor: active ? "white" : tag.color }} /><span style={{ minWidth: 0, lineHeight: 1.35, overflowWrap: "anywhere" }}>{tag.name}</span></button>
              <button type="button" title={`Export ${tag.name} tag`} aria-label={`Export ${tag.name} tag`} onClick={() => onExportCategory(tag)} style={{ width: "34px", height: "34px", flex: "0 0 auto", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: "pointer", fontSize: "18px" }}>⇩</button>
              <button type="button" title={`Settings for ${tag.name}`} aria-label={`Settings for ${tag.name}`} onClick={() => setSettingsTagName(tag.name)} style={{ width: "34px", height: "34px", flex: "0 0 auto", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: "pointer", fontSize: "17px" }}>⚙</button>
            </div>;
          })}
          <form onSubmit={handleCreateTag} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px" }}>
            <input
              aria-label="New tag name"
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              placeholder="New tag name"
              style={{ flex: 1, minWidth: 0, padding: "8px", border: "1px solid #cbd5e1", borderRadius: "4px", color: "#1e293b" }}
            />
            <input type="color" aria-label="New tag color" value={newTagColor} onChange={(event) => setNewTagColor(event.target.value)} style={{ width: "36px", height: "34px", padding: "2px", border: "1px solid #cbd5e1", borderRadius: "4px", cursor: "pointer" }} />
            <button type="submit" disabled={!newTagName.trim()} style={{ padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: newTagName.trim() ? "pointer" : "default", opacity: newTagName.trim() ? 1 : 0.5 }}>Add tag</button>
          </form>
          <div style={{ display: "flex", gap: "5px", marginTop: "8px" }}>
            <button type="button" onClick={() => categoryFileInput.current?.click()} style={{ flex: 1, padding: "8px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "white", color: "#334155", cursor: "pointer", fontSize: "12px" }}>Import tag set</button>
          </div>
        </>
      )}
      <input ref={categoryFileInput} type="file" accept=".json,application/json" onChange={handleCategoryFileChange} style={{ display: "none" }} />
    </aside>
  );
}
