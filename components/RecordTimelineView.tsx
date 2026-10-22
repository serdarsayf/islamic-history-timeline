"use client";

import { useEffect } from "react";

export default function RecordTimelineView({ timelineId }: { timelineId: string }) {
  useEffect(() => {
    const storageKey = `timeline-view-recorded:${timelineId}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Storage can be blocked; recording the view anyway is harmless because the server de-duplicates.
    }

    const url = `/api/timelines/${timelineId}/view`;
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url)) return;
    void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }, [timelineId]);

  return null;
}