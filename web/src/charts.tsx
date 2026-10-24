import { useState, type PointerEvent, type KeyboardEvent } from "react";
import { assetValue, displayDate, percent } from "./data";
export interface ChartSeries {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}
interface Props {
  dates: string[];
  series: ChartSeries[];
  symbol: string;
  volume?: (number | null)[];
  returns?: boolean;
  label: string;
}
export function InteractiveChart({
  dates,
  series,
  symbol,
  volume,
  returns = false,
  label,
}: Props) {
  const [active, setActive] = useState<number | null>(null);
  if (!dates.length)
    return (
      <div className="chart-empty">No observations match this selection.</div>
    );
  const selected = active === null ? null : Math.min(active, dates.length - 1);
  const values = series.flatMap((s) =>
    s.values.filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  if (!values.length)
    return (
      <div className="chart-empty">
        Enable a price series or moving average to inspect the chart.
      </div>
    );
  let low = Math.min(...values),
    high = Math.max(...values);
  const pad = Math.max((high - low) * 0.1, returns ? 0.001 : 0.01);
  low -= pad;
  high += pad;
  const width = 1200,
    left = 76,
    right = 1115,
    top = 34,
    bottom = 365;
  const x = (i: number) =>
    left + (i * (right - left)) / Math.max(dates.length - 1, 1);
  const y = (value: number) =>
    bottom - ((value - low) / (high - low)) * (bottom - top);
  const maxVol = Math.max(
    ...(volume || []).filter((v): v is number => v !== null),
    1,
  );
  const format = (v: number) => (returns ? percent(v) : assetValue(v, symbol));
  const choose = (event: PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const value = point.matrixTransform(matrix.inverse()).x;
    setActive(
      Math.max(
        0,
        Math.min(
          dates.length - 1,
          Math.round(((value - left) / (right - left)) * (dates.length - 1)),
        ),
      ),
    );
  };
  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setActive(
        Math.max(
          0,
          Math.min(
            dates.length - 1,
            (selected ?? 0) + (event.key === "ArrowRight" ? 1 : -1),
          ),
        ),
      );
    } else if (event.key === "Escape") setActive(null);
  };
  const tickCount = Math.min(6, dates.length);
  const shortSpan =
    (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000 <=
    100;
  return (
    <div className="interactive-chart">
      <svg
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={key}
        onPointerMove={choose}
        onPointerLeave={() => setActive(null)}
        onPointerDown={choose}
        viewBox={`0 0 ${width} 420`}
      >
        <title>
          {label}. Hover, touch, or use the left and right arrow keys to inspect
          a session.
        </title>
        {Array.from({ length: 6 }, (_, i) => {
          const value = low + ((high - low) * i) / 5;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={right}
                y1={y(value)}
                y2={y(value)}
                className="gridline"
              />
              <text x={right + 12} y={y(value) + 5}>
                {returns
                  ? percent(value, 1)
                  : new Intl.NumberFormat("en-IN", {
                      maximumFractionDigits: high - low < 10 ? 2 : 0,
                    }).format(value)}
              </text>
              {volume && (
                <text
                  x={left - 12}
                  textAnchor="end"
                  y={bottom - (i * (bottom - top)) / 5 + 5}
                >
                  {new Intl.NumberFormat("en-IN", {
                    notation: "compact",
                    maximumFractionDigits: 0,
                  }).format((maxVol * i) / 5)}
                </text>
              )}
            </g>
          );
        })}
        {volume &&
          volume.map(
            (v, i) =>
              v !== null && (
                <rect
                  key={dates[i]}
                  x={x(i) - ((right - left) / dates.length) * 0.38}
                  y={bottom - (v / maxVol) * (bottom - top)}
                  width={Math.max(0.6, ((right - left) / dates.length) * 0.76)}
                  height={(v / maxVol) * (bottom - top)}
                  fill="#bdceff"
                  opacity=".85"
                />
              ),
          )}
        {series.map((s) => (
          <path
            key={s.name}
            d={s.values
              .map((v, i) =>
                v === null
                  ? ""
                  : `${i === 0 || s.values[i - 1] === null ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`,
              )
              .join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={s.name === "Actual" || s.name === "Price" ? 2 : 1.55}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {Array.from({ length: tickCount }, (_, n) => {
          const i = Math.round(
            (n * (dates.length - 1)) / Math.max(tickCount - 1, 1),
          );
          return (
            <text
              key={n}
              x={x(i)}
              y="390"
              textAnchor={
                n === 0 ? "start" : n === tickCount - 1 ? "end" : "middle"
              }
            >
              {new Date(dates[i] + "T00:00:00Z").toLocaleDateString("en-GB", {
                day: shortSpan ? "2-digit" : undefined,
                month: "short",
                year: shortSpan ? undefined : "numeric",
                timeZone: "UTC",
              })}
            </text>
          );
        })}
        <text transform="translate(1190,200) rotate(90)" textAnchor="middle">
          {returns
            ? "Return"
            : symbol === "^NSEI"
              ? "Index points"
              : "Adjusted close · INR"}
        </text>
        {volume && (
          <text transform="translate(16,200) rotate(-90)" textAnchor="middle">
            Volume
          </text>
        )}
        {selected !== null && (
          <g>
            <line
              x1={x(selected)}
              x2={x(selected)}
              y1={top}
              y2={bottom}
              stroke="#b6bbc4"
            />
            {series.map(
              (s) =>
                s.values[selected] !== null && (
                  <circle
                    key={s.name}
                    cx={x(selected)}
                    cy={y(s.values[selected]!)}
                    r="3.8"
                    fill={s.color}
                    stroke="white"
                    strokeWidth="1.5"
                  />
                ),
            )}
          </g>
        )}
      </svg>
      {selected !== null && (
        <div
          className={`chart-tip ${selected > dates.length * 0.62 ? "tip-left" : ""}`}
          role="status"
          style={{
            left: `${Math.max(6, Math.min(78, (x(selected) / width) * 100))}%`,
          }}
        >
          <div className="tip-date">{displayDate(dates[selected])}</div>
          {series.map((s) => (
            <div className="tip-row" key={s.name}>
              <span>
                <i style={{ background: s.color }} />
                {s.name}
              </span>
              <strong>
                {s.values[selected] === null
                  ? "Not available"
                  : format(s.values[selected]!)}
              </strong>
            </div>
          ))}
          {volume && (
            <div className="tip-volume">
              Volume:{" "}
              {volume[selected] === null
                ? "Not available"
                : new Intl.NumberFormat("en-IN").format(volume[selected]!)}
            </div>
          )}
        </div>
      )}
      <p className="chart-help">
        Hover or touch to inspect a date. Keyboard: ← / →.{" "}
        {volume ? "Bars show available cached volume. " : ""}Dates follow
        observed sessions.
      </p>
    </div>
  );
}
