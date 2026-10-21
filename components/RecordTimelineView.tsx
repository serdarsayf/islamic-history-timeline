"use client";

import { useEffect } from "react";

export default function RecordTimelineView({ timelineId }: { timelineId: string }) {
  useEffect(() => {
    void fetch(`/api/timelines/${timelineId}/view`, { method: "POST" }).catch(() => {});
  }, [timelineId]);

  return null;
}