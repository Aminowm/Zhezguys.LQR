// Turn a route drawn on the table into Pybricks code using the team's functions.
import { mmToMotorDeg } from "../sim/robot";
import type { Pose } from "../sim/physics";

export interface RouteStep {
  heading: number; // gyro heading target (deg, relative to start)
  mm: number;
  backwards: boolean;
}

const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** Closest equivalent of `a` to `ref` (keeps gyro headings continuous). */
const near = (a: number, ref: number) => ref + norm180(a - ref);

export function routeSteps(points: [number, number][], start: Pose): RouteStep[] {
  const pts = points.slice();
  const d0 = Math.hypot(pts[0][0] - start.x, pts[0][1] - start.y);
  if (d0 > 15) pts.unshift([start.x, start.y]);
  const steps: RouteStep[] = [];
  let robotHeading = 0; // relative to start heading
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const mm = Math.hypot(dx, dy);
    if (mm < 5) continue;
    const abs = (Math.atan2(dy, dx) * 180) / Math.PI; // screen: clockwise positive
    const fwd = near(abs - start.headingDeg, robotHeading);
    const back = near(abs + 180 - start.headingDeg, robotHeading);
    const backwards = Math.abs(back - robotHeading) + 25 < Math.abs(fwd - robotHeading);
    const heading = backwards ? back : fwd;
    steps.push({ heading, mm, backwards });
    robotHeading = heading;
  }
  return steps;
}

export function routeToCode(points: [number, number][], start: Pose, wheelDiameterMm: number, power = 60) {
  const steps = routeSteps(points, start);
  const lines = ["# route drawn on the table"];
  let h = 0;
  for (const s of steps) {
    const target = Math.round(s.heading);
    if (Math.abs(target - h) >= 1) lines.push(`turn_lqr(${target})`);
    h = target;
    const deg = Math.round(mmToMotorDeg(s.mm, wheelDiameterMm));
    lines.push(`straight_lqr(${deg}, ${s.backwards ? -power : power}, ${target})  # ${Math.round(s.mm)} mm`);
  }
  return lines.join("\n") + "\n";
}

export function segmentInfo(points: [number, number][]) {
  const segs: { mx: number; my: number; mm: number; ang: number }[] = [];
  const turns: { x: number; y: number; deg: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    segs.push({ mx: (x0 + x1) / 2, my: (y0 + y1) / 2, mm: Math.hypot(x1 - x0, y1 - y0), ang: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI });
  }
  for (let i = 1; i < segs.length; i++) {
    turns.push({ x: points[i][0], y: points[i][1], deg: norm180(segs[i].ang - segs[i - 1].ang) });
  }
  return { segs, turns };
}
