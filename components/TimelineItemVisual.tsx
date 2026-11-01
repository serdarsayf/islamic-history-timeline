import { memo } from "react";
import type { TimelineItem } from "../lib/timeline/types";
import { getItemDistance } from "../lib/timeline/geometry";

// Every size scales with --tz (the live zoom, set on the world layer), so zooming never re-renders items.
const z = (value: number) => `calc(var(--tz) * ${value}px)`;

type TimelineItemVisualProps = {
  item: TimelineItem;
  row: number;
  // Position and period width in pixels at zoom 1.
  x: number;
  y: number;
  periodWidth: number;
  highlighted: boolean;
  glow?: boolean;
  onItemPointerDown: (event: React.PointerEvent) => void;
  onItemPointerEnter: (itemId: number) => void;
  onItemPointerLeave: () => void;
  onItemClick: (event: React.MouseEvent, itemId: number) => void;
};

function TimelineItemVisualImpl({
  item,
  row,
  x,
  y,
  periodWidth,
  highlighted,
  glow = false,
  onItemPointerDown,
  onItemPointerEnter,
  onItemPointerLeave,
  onItemClick,
}: TimelineItemVisualProps) {
  // Half the timeline axis thickness, so connectors stop at its border.
  const axisHalfThickness = 4;
  const connectorLength = `(var(--tz) * ${getItemDistance(row, 1)}px - ${axisHalfThickness}px)`;
  const labelFontSize = 20;
  const titleWidth = item.title.length * labelFontSize * 0.55;
  const eventLabelWidth = titleWidth + 22;
  const eventLabelHeight = labelFontSize * 1.1 + 10;
  const periodTitleTop = item.position === "above" ? -38 : 25;
  const periodTitleHeight = labelFontSize * 1.2;
  const periodOutlineTop = Math.min(-10, periodTitleTop);
  const periodOutlineBottom = Math.max(10, periodTitleTop + periodTitleHeight);
  const periodOutlineWidth = Math.max(periodWidth + 2, 10 + titleWidth);

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
        left: z(x),
        top: z(y),
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
                  : `calc(${connectorLength} * -1)`,
              width: "1px",
              height: `calc${connectorLength}`,
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
              padding: `${z(4)} ${z(10)}`,
              border: `${z(1)} solid rgba(255,255,255,0.35)`,
              borderRadius: z(4),
              backgroundColor: item.color,
              color: item.textColor,
              fontSize: z(labelFontSize),
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
              top: z(-10),
              width: z(periodWidth),
              height: z(20),
              backgroundColor: item.color,
              border: `${z(1)} solid #999`,
              borderRadius: z(4),
              pointerEvents: "auto",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: z(10),
              top: z(periodTitleTop),
              whiteSpace: "nowrap",
              fontSize: z(labelFontSize),
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
            top: item.type === "event" ? z(-eventLabelHeight / 2) : z(periodOutlineTop),
            width: item.type === "event" ? z(eventLabelWidth) : z(periodOutlineWidth),
            height: item.type === "event" ? z(eventLabelHeight) : z(periodOutlineBottom - periodOutlineTop),
            transform: item.type === "event" ? "translateX(-50%)" : undefined,
            border: glow ? "1px solid #ffd166" : "3px solid #f5a623",
            borderRadius: z(5),
            boxShadow: glow ? "0 0 3px rgba(255,209,102,0.9)" : "0 0 14px rgba(245,166,35,0.85)",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      )}
    </div>
  );
}

export default memo(TimelineItemVisualImpl);
