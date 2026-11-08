import { memo } from "react";
import type { ReactElement } from "react";
import { BADGE_MM, HOME_AREAS, MAT, MAT_IMAGE, MissionDef, TABLE_H, TABLE_W, WALL, WIREFRAME_IMAGE } from "../../field/bioglow";
import type { CardMode } from "../../storage/types";

interface Props {
  mode: CardMode;
  grid: boolean;
}

/**
 * Table walls + surface for the three card modes:
 *  blank    – just the table, nothing on it
 *  full     – the BIOGLOW mat picture at its real size
 *  missions – FIRST's wireframe of the mission models (no colours) + mission numbers
 */
export const MatLayer = memo(function MatLayer({ mode, grid }: Props) {
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
      {/* walls */}
      <rect x={-WALL} y={-WALL} width={TABLE_W + 2 * WALL} height={TABLE_H + 2 * WALL} rx="16" fill="var(--table-wall)" />
      <rect x={-WALL + 6} y={-WALL + 6} width={TABLE_W + 2 * WALL - 12} height={TABLE_H + 2 * WALL - 12} rx="12" fill="none" stroke="var(--table-wall-top)" strokeWidth="4" />
      {ticks}
      {/* table surface */}
      <rect x={0} y={0} width={TABLE_W} height={TABLE_H} fill={mode === "blank" ? "var(--mat-blank)" : "var(--table-floor)"} />
      {mode === "full" && <image href={MAT_IMAGE} x={MAT.x} y={MAT.y} width={MAT.w} height={MAT.h} preserveAspectRatio="none" />}
      {mode === "missions" && (
        <g>
          <rect x={MAT.x} y={MAT.y} width={MAT.w} height={MAT.h} fill="#ffffff" />
          <image href={WIREFRAME_IMAGE} x={MAT.x} y={MAT.y} width={MAT.w} height={MAT.h} preserveAspectRatio="none" />
        </g>
      )}
      {mode !== "blank" && <rect x={MAT.x} y={MAT.y} width={MAT.w} height={MAT.h} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />}
      {gridLines}
    </g>
  );
});

interface MissionProps {
  missions: MissionDef[];
  mode: CardMode;
  highlight: Set<string>;
  showNumbers: boolean;
}

/** Mission number badges (missions mode) and glow rings for the missions of the active program. */
export const MissionLayer = memo(function MissionLayer({ missions, mode, highlight, showNumbers }: MissionProps) {
  if (mode === "blank" || (mode === "missions" && !showNumbers)) return null;
  const s = BADGE_MM;
  return (
    <g style={{ pointerEvents: "none" }}>
      {missions.flatMap((m) =>
        m.spots.map((p, i) => {
          const hl = highlight.has(m.id);
          return (
            <g key={m.id + i} transform={`translate(${p.x} ${p.y})`}>
              {hl && <rect x={-s / 2 - 16} y={-s / 2 - 16} width={s + 32} height={s + 32} rx="26" fill="none" stroke="#bef264" strokeWidth="12" />}
              {hl && <rect x={-s / 2 - 16} y={-s / 2 - 16} width={s + 32} height={s + 32} rx="26" fill="none" stroke="#1b2420" strokeWidth="3" />}
              {mode === "missions" && (
                <>
                  <rect x={-s / 2} y={-s / 2} width={s} height={s} rx="16" fill="#e0242c" stroke="#ffffff" strokeWidth="6" />
                  <text y="17" textAnchor="middle" fontSize="50" fontWeight="700" fill="#ffffff">{m.label}</text>
                </>
              )}
            </g>
          );
        }),
      )}
    </g>
  );
});

export { HOME_AREAS };
