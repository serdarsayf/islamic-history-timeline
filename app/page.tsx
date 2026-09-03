"use client";

import { useState } from "react";

type Event = {
  title: string;
  year: number;
};

const START_YEAR = 600;
const END_YEAR = 1100;

export default function Home() {
  const [events, setEvents] = useState<Event[]>([
    {
      title: "Hijra",
      year: 622,
    },
    {
      title: "Abbasid Revolution",
      year: 750,
    },
    {
      title: "Battle of Manzikert",
      year: 1071,
    },
  ]);

  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");

  function addEvent() {
    if (title === "" || year === "") {
      return;
    }

    const newEvent: Event = {
      title: title,
      year: Number(year),
    };

    setEvents([...events, newEvent]);

    setTitle("");
    setYear("");
  }

  function getPosition(year: number) {
    return ((year - START_YEAR) / (END_YEAR - START_YEAR)) * 100;
  }

  return (
    <main>
      <h1>My Timeline</h1>

      <h2>Add Event</h2>

      <input
        type="text"
        placeholder="Event name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        type="number"
        placeholder="Year"
        value={year}
        onChange={(e) => setYear(e.target.value)}
      />

      <button onClick={addEvent}>Add Event</button>

      <h2>Timeline</h2>

      <div
        style={{
          position: "relative",
          height: "300px",
          borderTop: "2px solid black",
          borderBottom: "2px solid black",
          marginTop: "30px",
        }}
      >
        {/* Time labels */}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>600</span>
          <span>700</span>
          <span>800</span>
          <span>900</span>
          <span>1000</span>
          <span>1100</span>
        </div>

        {/* Events */}

        {events.map((event) => (
          <div
            key={event.title}
            style={{
              position: "absolute",
              left: `${getPosition(event.year)}%`,
              top: "100px",
              transform: "translateX(-50%)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px" }}>●</div>
              <strong>{event.title}</strong>
              <div>{event.year}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}