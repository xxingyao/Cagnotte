'use client';

import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/money';

interface Point { date: string; value: number; cost: number }

interface Props {
  points: Point[]; // one currency's worth, sorted or not — this sorts by date
  currency: string;
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD = 28;

export function PortfolioChart({ points, currency }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  );

  if (sorted.length < 2) {
    return (
      <div className="chart-empty">
        Track a value change on another day to start seeing a trend here.
      </div>
    );
  }

  const values = sorted.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const xAt = (i: number) => PAD + (i / (sorted.length - 1)) * (WIDTH - PAD * 2);
  const yAt = (v: number) => HEIGHT - PAD - ((v - min) / range) * (HEIGHT - PAD * 2);

  const linePath = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.value)}`).join(' ');
  const areaPath = `${linePath} L ${xAt(sorted.length - 1)} ${HEIGHT - PAD} L ${xAt(0)} ${HEIGHT - PAD} Z`;

  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;
  const up = last >= first;

  const hover = hoverIdx !== null ? sorted[hoverIdx] : null;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fill-${currency}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? 'var(--positive)' : 'var(--negative)'} stopOpacity="0.22" />
            <stop offset="100%" stopColor={up ? 'var(--positive)' : 'var(--negative)'} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#fill-${currency})`} />
        <path d={linePath} fill="none" stroke={up ? 'var(--positive)' : 'var(--negative)'} strokeWidth="2" />

        {/* Wide invisible hit targets — easier to hover than the 2px line itself. */}
        {sorted.map((p, i) => (
          <rect
            key={p.date}
            x={xAt(i) - (WIDTH / sorted.length) / 2}
            y={0}
            width={WIDTH / sorted.length}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}

        {hover && (
          <>
            <line
              x1={xAt(hoverIdx!)} x2={xAt(hoverIdx!)} y1={PAD} y2={HEIGHT - PAD}
              stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3"
            />
            <circle cx={xAt(hoverIdx!)} cy={yAt(hover.value)} r="4" fill={up ? 'var(--positive)' : 'var(--negative)'} />
          </>
        )}
      </svg>

      <div className="chart-tooltip">
        {hover ? (
          <>
            <strong>{formatMoney(hover.value, currency)}</strong>
            <span className="sub">{hover.date}</span>
          </>
        ) : (
          <>
            <strong>{formatMoney(last, currency)}</strong>
            <span className="sub">Latest · {sorted[sorted.length - 1].date}</span>
          </>
        )}
      </div>
    </div>
  );
}