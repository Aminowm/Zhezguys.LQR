// Geometric "ice shard" leaves in the Zhezguys jersey colours (decorative).
import type { ReactElement } from "react";

const COLORS = ["#0b1f6e", "#1e4fd8", "#3fa9f5", "#9fd2ff", "#ffffff"];

function leaf(cx: number, cy: number, len: number, angle: number, width: number) {
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = -uy;
  const py = ux;
  const tip = [cx + ux * len, cy + uy * len];
  const mid = [cx + ux * len * 0.45, cy + uy * len * 0.45];
  return [
    [cx, cy],
    [mid[0] + px * width, mid[1] + py * width],
    tip,
    [mid[0] - px * width * 0.7, mid[1] - py * width * 0.7],
  ]
    .map((p) => p.map((v) => v.toFixed(1)).join(","))
    .join(" ");
}

export default function Shards({ className }: { className?: string }) {
  // deterministic pseudo-random layout
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const flowers: ReactElement[] = [];
  const centers = [
    [520, 420, 1.15],
    [300, 520, 0.9],
    [690, 330, 0.8],
    [120, 420, 0.65],
  ];
  centers.forEach(([cx, cy, k], fi) => {
    const n = 7 + Math.round(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const ang = (360 / n) * i + rnd() * 20;
      const len = (110 + rnd() * 90) * k;
      const w = (26 + rnd() * 18) * k;
      const c = COLORS[(i + fi) % 4];
      flowers.push(<polygon key={`${fi}-${i}`} points={leaf(cx, cy, len, ang, w)} fill={c} stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" opacity={0.92} />);
    }
  });
  // flying splinters
  for (let i = 0; i < 22; i++) {
    const x = 200 + rnd() * 580;
    const y = 300 + rnd() * 300;
    const len = 14 + rnd() * 26;
    flowers.push(<polygon key={"s" + i} points={leaf(x, y, len, rnd() * 360, len * 0.35)} fill={COLORS[i % 4]} opacity={0.85} />);
  }
  return (
    <svg className={className} viewBox="0 0 800 640" aria-hidden="true" focusable="false">
      {flowers}
    </svg>
  );
}
