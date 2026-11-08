import type { ReactElement } from "react";
import { memo } from "react";
import { HOME_AREAS, MissionDef, TABLE_H, TABLE_W, WALL } from "../../field/bioglow";
import type { CardMode } from "../../storage/types";

interface Props {
  mode: CardMode;
  grid: boolean;
  matImage: string | null;
  homeLabel: string;
}

/** Table walls + mat surface for the three card modes. */
export const MatLayer = memo(function MatLayer({ mode, grid, matImage, homeLabel }: Props) {
  const gridLines: ReactElement[] = [];
  if (grid) {
    for (let x = 100; x < TABLE_W; x += 100)
      gridLines.push(<line key={"gx" + x} x1={x} y1={0} x2={x} y2={TABLE_H} stroke={x % 500 === 0 ? "var(--mat-line-strong)" : "var(--mat-line)"} strokeWidth={x % 500 === 0 ? 2.5 : 1.5} />);
    for (let y = 100; y < TABLE_H; y += 100)
      gridLines.push(<line key={"gy" + y} x1={0} y1={y} x2={TABLE_W} y2={y} stroke={y % 500 === 0 ? "var(--mat-line-strong)" : "var(--mat-line)"} strokeWidth={y % 500 === 0 ? 2.5 : 1.5} />);
  }
  const ticks: ReactElement[] = [];
  for (let x = 0; x <= TABLE_W; x += 200)
    ticks.push(<text key={"tx" + x} x={x} y={-WALL / 2 + 9} fontSize="24" textAnchor="middle" fill="#d8d0bf" className="num">{x}</text>);
  for (let y = 200; y <= TABLE_H; y += 200)
    ticks.push(<text key={"ty" + y} x={-WALL / 2} y={y + 8} fontSize="24" textAnchor="middle" fill="#d8d0bf" className="num">{y}</text>);

  return (
    <g>
      <defs>
        <radialGradient id="bg-glow-a" cx="0.3" cy="0.35" r="0.6">
          <stop offset="0" stopColor="#1fb59f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0b3b4a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bg-glow-b" cx="0.78" cy="0.7" r="0.55">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.45" />
          <stop offset="1" stopColor="#0b3b4a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bg-deep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d4f5c" />
          <stop offset="0.55" stopColor="#103d55" />
          <stop offset="1" stopColor="#1d2f57" />
        </linearGradient>
        <pattern id="hatch" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="24" stroke="currentColor" strokeWidth="3" />
        </pattern>
      </defs>
      {/* walls */}
      <rect x={-WALL} y={-WALL} width={TABLE_W + 2 * WALL} height={TABLE_H + 2 * WALL} rx="16" fill="var(--table-wall)" />
      <rect x={-WALL + 6} y={-WALL + 6} width={TABLE_W + 2 * WALL - 12} height={TABLE_H + 2 * WALL - 12} rx="12" fill="none" stroke="var(--table-wall-top)" strokeWidth="4" />
      {ticks}
      {/* surface */}
      {mode === "full" ? (
        matImage ? (
          <image href={matImage} x={0} y={0} width={TABLE_W} height={TABLE_H} preserveAspectRatio="none" />
        ) : (
          <g>
            <rect x={0} y={0} width={TABLE_W} height={TABLE_H} fill="url(#bg-deep)" />
            <rect x={0} y={0} width={TABLE_W} height={TABLE_H} fill="url(#bg-glow-a)" />
            <rect x={0} y={0} width={TABLE_W} height={TABLE_H} fill="url(#bg-glow-b)" />
            {Array.from({ length: 40 }, (_, i) => {
              const x = (i * 613) % TABLE_W;
              const y = (i * 379 + 120) % TABLE_H;
              return <circle key={i} cx={x} cy={y} r={4 + (i % 4) * 3} fill="#bef264" opacity={0.18 + (i % 5) * 0.06} />;
            })}
          </g>
        )
      ) : (
        <rect x={0} y={0} width={TABLE_W} height={TABLE_H} fill="var(--mat-blank)" />
      )}
      {gridLines}
      {/* home / launch areas */}
      {HOME_AREAS.map((z) => (
        <g key={z.id}>
          <rect
            x={z.x + 4}
            y={z.y + 4}
            width={z.w - 8}
            height={z.h - 8}
            rx="10"
            fill={mode === "full" ? "rgba(255,255,255,0.06)" : "none"}
            stroke={mode === "full" ? "#e2f7c8" : "var(--mat-line-strong)"}
            strokeWidth="5"
            strokeDasharray={mode === "blank" ? "16 12" : undefined}
          />
          <text x={z.x + z.w / 2} y={z.y + z.h - 26} textAnchor="middle" fontSize="30" fontWeight="600" fill={mode === "full" ? "#e2f7c8" : "#6b7570"} opacity="0.9">
            {homeLabel}
          </text>
        </g>
      ))}
    </g>
  );
});

interface MissionProps {
  missions: MissionDef[];
  mode: CardMode;
  editable: boolean;
  highlight: Set<string>;
  onDown?: (id: string, e: React.PointerEvent) => void;
}

export const MissionLayer = memo(function MissionLayer({ missions, mode, editable, highlight, onDown }: MissionProps) {
  if (mode === "blank") return null;
  return (
    <g>
      {missions.map((m) => {
        const hl = highlight.has(m.id);
        const full = mode === "full";
        return (
          <g
            key={m.id}
            transform={`translate(${m.x} ${m.y})`}
            style={{ cursor: editable ? "grab" : undefined, pointerEvents: editable ? "all" : "none" }}
            onPointerDown={editable ? (e) => onDown?.(m.id, e) : undefined}
          >
            <rect
              x={-m.w / 2}
              y={-m.h / 2}
              width={m.w}
              height={m.h}
              rx="22"
              fill={full ? `hsl(${m.hue} 70% 45% / 0.55)` : "#ffffff"}
              stroke={full ? `hsl(${m.hue} 90% 75%)` : "#4d5751"}
              strokeWidth={hl ? 9 : 4}
              strokeDasharray={!full ? "0" : undefined}
            />
            {full && <rect x={-m.w / 2 + 14} y={-m.h / 2 + 14} width={m.w - 28} height={m.h - 28} rx="14" fill="none" stroke={`hsl(${m.hue} 90% 80% / 0.5)`} strokeWidth="3" />}
            <text y="13" textAnchor="middle" fontSize="40" fontWeight="700" fill={full ? "#ffffff" : "#2c3430"} style={{ paintOrder: "stroke", stroke: full ? `hsl(${m.hue} 70% 25%)` : "#ffffff", strokeWidth: 6 }}>
              {m.label}
            </text>
            {hl && <circle cx={m.w / 2 - 6} cy={-m.h / 2 + 6} r="16" fill="#bef264" stroke="#1b2420" strokeWidth="4" />}
          </g>
        );
      })}
    </g>
  );
});
