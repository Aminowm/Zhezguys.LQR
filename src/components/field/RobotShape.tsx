import type { RobotProfile } from "../../sim/robot";

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

/** Top view of a SPIKE robot in table millimetres. */
export default function RobotShape({ x, y, heading, profile, color, label, opacity = 1, ghost, selected }: Props) {
  const front = profile.axleToFrontMm;
  const back = profile.lengthMm - profile.axleToFrontMm;
  const half = profile.widthMm / 2;
  const wheelL = profile.wheelDiameterMm;
  const wheelW = Math.max(14, Math.min(30, profile.wheelDiameterMm * 0.3));
  const track = profile.axleTrackMm / 2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${heading})`} opacity={opacity} style={{ pointerEvents: "none" }}>
      {selected && <rect x={-back - 14} y={-half - 14} width={front + back + 28} height={2 * half + 28} rx="22" fill="none" stroke="var(--ink)" strokeWidth="4" strokeDasharray="14 10" />}
      <rect x={-back} y={-half} width={front + back} height={2 * half} rx="18" fill={ghost ? "none" : color} fillOpacity={ghost ? 0 : 0.28} stroke={color} strokeWidth={ghost ? 4 : 6} strokeDasharray={ghost ? "12 10" : undefined} />
      {!ghost && (
        <>
          <rect x={-wheelL / 2} y={-track - wheelW / 2} width={wheelL} height={wheelW} rx="6" fill="#1f2421" />
          <rect x={-wheelL / 2} y={track - wheelW / 2} width={wheelL} height={wheelW} rx="6" fill="#1f2421" />
          <rect x={-back * 0.55} y={-half * 0.55} width={back * 0.55 + front * 0.45} height={half * 1.1} rx="12" fill="#f4f1e8" stroke="#c9c2b0" strokeWidth="3" />
          <circle cx={front * 0.12} cy="0" r="9" fill={color} />
        </>
      )}
      <path d={`M ${front - 8} 0 L ${front - 40} -22 L ${front - 40} 22 Z`} fill={color} />
      {label && (
        <text x={-back + 18} y={-half - 16} fontSize="40" fontWeight="700" fill={color} transform={`rotate(${-heading} ${-back + 18} ${-half - 16})`} style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 10 }}>
          {label}
        </text>
      )}
    </g>
  );
}
