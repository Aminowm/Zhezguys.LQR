import { describe, it, expect } from "vitest";
import { applyBuild, buildStats, defaultBuild, TEMPLATES } from "./build";
import { DEFAULT_PROFILE, derive } from "../sim/robot";
import { MISSIONS, MAT, HOME_AREAS } from "../field/bioglow";

describe("robot builder", () => {
  it("computes mass, inertia and wheel load from the parts", () => {
    const b = defaultBuild();
    const s = buildStats(b);
    expect(s.massG).toBeGreaterThan(500);
    expect(s.massG).toBeLessThan(900);
    expect(s.inertiaKgM2).toBeGreaterThan(0.001);
    expect(s.wheelLoadShare).toBeGreaterThan(0.5);
    // a scale reading rescales the mass and the inertia together
    const heavy = buildStats({ ...b, measuredMassG: s.massG * 2 });
    expect(heavy.massG).toBe(s.massG * 2);
    expect(heavy.inertiaKgM2 / s.inertiaKgM2).toBeCloseTo(2, 5);
  });
  it("moving weight away from the centre increases turning inertia", () => {
    const b = defaultBuild();
    const far = { ...b, parts: b.parts.map((p) => (p.kind === "attachment" ? { ...p, x: p.x + 80 } : p)) };
    expect(buildStats(far).inertiaKgM2).toBeGreaterThan(buildStats(b).inertiaKgM2);
  });
  it("warns when the robot would tip", () => {
    const b = defaultBuild(); // caster behind the axle
    const nose = { ...b, parts: [...b.parts, { id: "w", kind: "attachment" as const, x: 200, y: 0, len: 40, wid: 40, mass: 900 }] };
    expect(buildStats(nose).warnings).toContain("tipFront");
  });
  it("feeds the simulator", () => {
    for (const tp of TEMPLATES) {
      const p = applyBuild(DEFAULT_PROFILE, tp.build());
      const d = derive(p);
      expect(d.Jeff).toBeGreaterThan(0.001);
      expect(p.build).toBeTruthy();
    }
  });
  it("places BIOGLOW inside the table", () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10", "M11", "M12"]);
    for (const m of MISSIONS) for (const s of m.spots) {
      expect(s.x).toBeGreaterThan(MAT.x);
      expect(s.x).toBeLessThan(MAT.x + MAT.w);
    }
    expect(HOME_AREAS[0].cy).toBe(MAT.y + MAT.h);
  });
});
