import type { TimelineItem } from "./types";

export const initialItems: TimelineItem[] = [
  {
    id: 1,
    type: "event",
    title: "Hijra",
    description:
      "The migration of the Prophet Muhammad and the early Muslim community from Mecca to Medina.",
    color: "#ddd",
    textColor: "#ffffff",
    tags: [],
    startDate: {
      year: 622,
      era: "CE",
    },
    position: "above",
  },
  {
    id: 2,
    type: "period",
    title: "Abbasid Caliphate",
    description:
      "The Abbasid Caliphate ruled much of the Islamic world from Baghdad.",
    color: "#ddd",
    textColor: "#ffffff",
    tags: [],
    startDate: {
      year: 750,
      era: "CE",
    },
    endDate: {
      year: 1258,
      era: "CE",
    },
    position: "below",
  },
  {
    id: 3,
    type: "event",
    title: "Battle of Manzikert",
    description:
      "The Seljuk victory over the Byzantine Empire at Manzikert.",
    color: "#ddd",
    textColor: "#ffffff",
    tags: [],
    startDate: {
      year: 1071,
      era: "CE",
    },
    position: "above",
  },
];
