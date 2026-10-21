import { memo } from "react";
import type { TimelineItem } from "../lib/timeline/types";
import { getItemDistance } from "../lib/timeline/geometry";

type TimelineItemVisualProps = {
  item: TimelineItem;
  row: number;
  zoom: number;
  x: number;
  y: number;
  periodWidth: number;
  labelFontSize: number;
  highlighted: boolean;
  glow?: boolean;
  onItemPointerDown: (event: React.PointerEvent) => void;
  onItemPointerEnter: (itemId: number) => void;
  onItemPointerLeave: () => void;
  onItemClick: (event: React.MouseEvent, itemId: number) => void;
};

function TimelineItemVisual({
  item,
  row,
  zoom,
  x,
  y,
  periodWidth,
  labelFontSize,
  highlighted,
  glow = false,
  onItemPointerDown,
  onItemPointerEnter,
  onItemPointerLeave,
  onItemClick,
}: TimelineItemVisualProps) {
  const itemDistance = getItemDistance(row, zoom);
  // Half the timeline axis thickness, so connectors stop at its border.
  const axisHalfThickness = 4;
  const connectorLength = Math.max(
    itemDistance - axisHalfThickness,
    0
  );
  const titleWidth = item.title.length * labelFontSize * 0.55;
  const eventLabelWidth = titleWidth + 22 * zoom;
  const eventLabelHeight = labelFontSize * 1.1 + 10 * zoom;
  const periodTitleTop = item.position === "above" ? -38 * zoom : 25 * zoom;
  const periodTitleHeight = labelFontSize * 1.2;
  const periodOutlineTop = Math.min(-10 * zoom, periodTitleTop);
  const periodOutlineBottom = Math.max(10 * zoom, periodTitleTop + periodTitleHeight);
  const periodOutlineWidth = Math.max(
    periodWidth + 2 * zoom,
    10 * zoom + titleWidth
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${item.title}, ${item.type}, ${item.startDate.year} ${item.startDate.era}${item.endDate ? ` to ${item.endDate.year} ${item.endDate.era}` : ""}`}
      onPointerDown={onItemPointerDown}
      onPointerEnter={() => onItemPointerEnter(item.id)}
      onPointerLeave={onItemPointerLeave}
      onClick={(event) => onItemClick(event, item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      className="timeline-object"
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        transform:
          item.type === "event"
            ? "translateX(-50%)"
            : undefined,
        cursor: "pointer",
        zIndex: 5,
      }}
    >
      {item.type === "event" && (
        <>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top:
                item.position === "above"
                  ? "0"
                  : `${-connectorLength}px`,
              width: "1px",
              height: `${connectorLength}px`,
              backgroundColor: "#888",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              transform: "translate(-50%, -50%)",
              padding: `${4 * zoom}px ${10 * zoom}px`,
              border: `${zoom}px solid rgba(255,255,255,0.35)`,
              borderRadius: `${4 * zoom}px`,
              backgroundColor: item.color,
              color: item.textColor,
              fontSize: labelFontSize,
              fontWeight: 600,
              lineHeight: "1.1",
              whiteSpace: "nowrap",
              pointerEvents: "auto",
            }}
          >
            {item.title}
          </div>
        </>
      )}

      {item.type === "period" && item.endDate && (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: `${-10 * zoom}px`,
              width: `${periodWidth}px`,
              height: `${20 * zoom}px`,
              backgroundColor: item.color,
              border: `${zoom}px solid #999`,
              borderRadius: `${4 * zoom}px`,
              pointerEvents: "auto",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${10 * zoom}px`,
              top: `${periodTitleTop}px`,
              whiteSpace: "nowrap",
              fontSize: labelFontSize,
              fontWeight: 600,
              color: item.textColor,
              pointerEvents: "auto",
            }}
          >
            {item.title}
          </div>
        </>
      )}

      {(highlighted || glow) && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: item.type === "event" ? "50%" : 0,
            top: item.type === "event" ? `${-eventLabelHeight / 2}px` : `${periodOutlineTop}px`,
            width: item.type === "event" ? `${eventLabelWidth}px` : `${periodOutlineWidth}px`,
            height: item.type === "event" ? `${eventLabelHeight}px` : `${periodOutlineBottom - periodOutlineTop}px`,
            transform: item.type === "event" ? "translateX(-50%)" : undefined,
            border: glow ? "1px solid #ffd166" : "3px solid #f5a623",
            borderRadius: `${5 * zoom}px`,
            boxShadow: glow ? "0 0 3px rgba(255,209,102,0.9)" : "0 0 14px rgba(245,166,35,0.85)",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      )}
    </div>
  );
}

export default memo(TimelineItemVisual);
