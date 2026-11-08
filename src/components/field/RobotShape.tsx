import type { ReactElement as JSXEl } from "react";
import type { RobotProfile } from "../../sim/robot";
import { buildStats, fixedParts, wheelWidth } from "../../robot/build";

interface Props {
  x: number;
  y: number;
  heading: number;
  profile: RobotProfile;
  color: string;
  label?: string;
  opacity?: number;
  ghost?: boolean;
  selected?: boolean;
}

/** Top view of the team's robot in table millimetres (drawn from the robot builder when available). */
export default function RobotShape({ x, y, heading, profile, color, label, opacity = 1, ghost, selected }: Props) {
  const b = profile.build;
  let front = profile.axleToFrontMm;
  let back = profile.lengthMm - profile.axleToFrontMm;
  let half = profile.widthMm / 2;
  let minY = -half;
  if (b) {
    const s = buildStats(b);
    front = s.axleToFrontMm;
    back = s.lengthMm - s.axleToFrontMm;
    half = s.widthMm / 2;
    minY = -half;
  }
  const outline = (
    <rect
      x={-back}
      y={minY}
      width={front + back}
      height={2 * half}
      rx="16"
      fill={ghost ? "none" : color}
      fillOpacity={ghost ? 0 : b ? 0.1 : 0.28}
      stroke={color}
      strokeWidth={ghost ? 4 : b ? 4 : 6}
      strokeDasharray={ghost ? "12 10" : undefined}
    />
  );

  let body: JSXEl | null = null;
  if (!ghost && b) {
    const f = fixedParts(b);
    const ww = wheelWidth(b.wheelDiameterMm);
    body = (
      <g>
        {b.parts
          .slice()
          .sort((p, q) => (p.kind === "frame" ? -1 : 0) - (q.kind === "frame" ? -1 : 0))
          .map((p) => {
            const fill =
              p.kind === "frame" ? color : p.kind === "attachment" ? "#f59e0b" : p.kind === "beam" ? "#3aa7e8" : p.kind === "brick" ? "#f2c230" : p.kind === "openFrame" ? "#e9edf6" : "#f5f6fa";
            const op = p.kind === "frame" ? 0.22 : p.kind === "attachment" ? 0.55 : p.kind === "openFrame" ? 0.6 : 1;
            return (
              <g key={p.id}>
                <rect x={p.x - p.len / 2} y={p.y - p.wid / 2} width={p.len} height={p.wid} rx={p.kind === "frame" ? 10 : 6} fill={fill} fillOpacity={op} stroke={p.kind === "frame" ? color : "#9a9484"} strokeWidth="2.5" />
                {p.kind === "hub" && <rect x={p.x - p.len / 2 + 10} y={p.y - p.wid / 2 + 8} width={p.wid - 16} height={p.wid - 16} rx="4" fill="#2b2f2d" />}
                {(p.kind === "motorL" || p.kind === "motorM") && <circle cx={p.x + p.len / 2 - 14} cy={p.y} r="9" fill="#14a3b8" />}
              </g>
            );
          })}
        {f.motors.map((m, i) => (
          <rect key={"m" + i} x={m.x - m.len / 2} y={m.y - m.wid / 2} width={m.len} height={m.wid} rx="6" fill="#ffffff" stroke="#9a9484" strokeWidth="2.5" />
        ))}
        {f.wheels.map((w, i) => (
          <rect key={"w" + i} x={-w.len / 2} y={w.y - ww / 2} width={w.len} height={ww} rx="6" fill="#1f2421" />
        ))}
        <circle cx={b.casterX} cy="0" r="10" fill="#c9c4b6" stroke="#6b665a" strokeWidth="2" />
      </g>
    );
  } else if (!ghost) {
    const wheelL = profile.wheelDiameterMm;
    const wheelW = Math.max(14, Math.min(30, profile.wheelDiameterMm * 0.3));
    const track = profile.axleTrackMm / 2;
    body = (
      <>
        <rect x={-wheelL / 2} y={-track - wheelW / 2} width={wheelL} height={wheelW} rx="6" fill="#1f2421" />
        <rect x={-wheelL / 2} y={track - wheelW / 2} width={wheelL} height={wheelW} rx="6" fill="#1f2421" />
        <rect x={-back * 0.55} y={-half * 0.55} width={back * 0.55 + front * 0.45} height={half * 1.1} rx="12" fill="#f4f2ec" stroke="#c9c2b0" strokeWidth="3" />
        <circle cx={front * 0.12} cy="0" r="9" fill={color} />
      </>
    );
  }

  return (
    <g transform={`translate(${x} ${y}) rotate(${heading})`} opacity={opacity} style={{ pointerEvents: "none" }}>
      {selected && <rect x={-back - 14} y={minY - 14} width={front + back + 28} height={2 * half + 28} rx="22" fill="none" stroke="var(--ink)" strokeWidth="4" strokeDasharray="14 10" />}
      {outline}
      {body}
      <path d={`M ${front + 4} 0 L ${front - 30} -20 L ${front - 30} 20 Z`} fill={color} stroke="#ffffff" strokeWidth="3" />
      {label && (
        <text x={-back + 18} y={minY - 16} fontSize="40" fontWeight="700" fill={color} transform={`rotate(${-heading} ${-back + 18} ${minY - 16})`} style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 10 }}>
          {label}
        </text>
      )}
    </g>
  );
}
