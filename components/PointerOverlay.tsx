import { memo, useSyncExternalStore, type ReactNode } from "react";
import { pointerStore } from "./pointerStore";

type PointerOverlayProps = {
  viewportWidth: number;
  pixelsPerYear: number;
  zoom: number;
  bannerTop: number;
  renderHijriYear: (year: number) => ReactNode;
  renderTimelineYear: (year: number) => ReactNode;
};

function PointerOverlayImpl({
  viewportWidth,
  pixelsPerYear,
  zoom,
  bannerTop,
  renderHijriYear,
  renderTimelineYear,
}: PointerOverlayProps) {
  const { x, position } = useSyncExternalStore(
    pointerStore.subscribe,
    pointerStore.getSnapshot,
    pointerStore.getSnapshot
  );

  if (x === null) return null;

  const year = Math.round(
    position + (x - viewportWidth / 2) / (pixelsPerYear * zoom)
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: `${x}px`,
          top: 0,
          width: "1px",
          height: "calc(100% - 40px)",
          marginTop: "40px",
          backgroundColor: "rgba(255,255,255,0.09)",
          pointerEvents: "none",
          zIndex: 8,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: `${x}px`,
          top: `${bannerTop}px`,
          transform: "translateX(-50%)",
          padding: "5px 12px",
          width: "220px",
          maxWidth: "calc(100vw - 24px)",
          boxSizing: "border-box",
          textAlign: "center",
          backgroundColor: "rgba(20,31,44,0.96)",
          border: "1px solid rgba(255,255,255,0.24)",
          borderRadius: "4px",
          color: "white",
          fontSize: "14px",
          lineHeight: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 9,
        }}
      >
        <span>{renderHijriYear(year)}</span>
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "8px",
            height: "8px",
            flex: "0 0 auto",
            borderRadius: "50%",
            backgroundColor: "#f5a623",
          }}
        />
        <span>{renderTimelineYear(year)}</span>
      </div>
    </>
  );
}

export default memo(PointerOverlayImpl);
