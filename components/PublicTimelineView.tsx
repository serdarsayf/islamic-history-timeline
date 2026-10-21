type PublicTimelineItem = {
  id: string;
  type: "event" | "period";
  name: string;
  description: string;
  start_year: number;
  start_era: "BC" | "CE";
  end_year: number | null;
  end_era: "BC" | "CE" | null;
  box_color: string;
  text_color: string;
};

type PublicTimelineViewProps = {
  title: string;
  description: string;
  calendar: string;
  items: PublicTimelineItem[];
  compact?: boolean;
};

function yearPosition(year: number, era: "BC" | "CE") {
  return era === "BC" ? 1 - year : year;
}

function formatYear(year: number, era: "BC" | "CE") {
  return `${year} ${era}`;
}

export default function PublicTimelineView({
  title,
  description,
  calendar,
  items,
  compact = false,
}: PublicTimelineViewProps) {
  const orderedItems = [...items].sort((first, second) =>
    yearPosition(first.start_year, first.start_era) -
    yearPosition(second.start_year, second.start_era)
  );

  return (
    <main className={`public-timeline${compact ? " public-timeline--compact" : ""}`}>
      <header className="public-timeline__header">
        <p className="public-timeline__eyebrow">Public timeline</p>
        <h1>{title}</h1>
        {description && <p className="public-timeline__description">{description}</p>}
        <p className="public-timeline__calendar">Calendar: {calendar}</p>
      </header>
      <ol className="public-timeline__items">
        {orderedItems.length === 0 ? (
          <li className="public-timeline__empty">No events have been added yet.</li>
        ) : orderedItems.map((item) => (
          <li className="public-timeline__item" key={item.id}>
            <span
              aria-hidden="true"
              className="public-timeline__swatch"
              style={{ backgroundColor: item.box_color }}
            />
            <div className="public-timeline__item-content">
              <div className="public-timeline__item-heading">
                <h2>{item.name}</h2>
                <span>
                  {formatYear(item.start_year, item.start_era)}
                  {item.end_year && item.end_era
                    ? ` - ${formatYear(item.end_year, item.end_era)}`
                    : ""}
                </span>
              </div>
              {item.description && <p>{item.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}