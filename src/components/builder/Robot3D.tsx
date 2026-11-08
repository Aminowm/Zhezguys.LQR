// 3D robot configurator view (three.js via react-three-fiber).
// Robot frame (x forward, y right, z up) → three.js (X = y, Y = z, Z = −x).
import { useMemo, useRef } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";
import * as THREE from "three";
import { buildStats, fixedParts, Part, partHeight, partZ, RobotBuild, wheelWidth } from "../../robot/build";

const snap = (v: number, s = 4) => Math.round(v / s) * s;

const COLORS: Record<string, string> = {
  hub: "#f5f6fa",
  motorL: "#f5f6fa",
  motorM: "#f5f6fa",
  colorSensor: "#f5f6fa",
  distanceSensor: "#f5f6fa",
  forceSensor: "#f5f6fa",
  beam: "#3aa7e8",
  thin: "#8ccff5",
  openFrame: "#e9edf6",
  brick: "#f2c230",
  frame: "#3f6fe0",
  attachment: "#f59e0b",
};

// Technic hole strip texture, made once and cloned per beam length.
let holeTex: THREE.CanvasTexture | null = null;
function holeTexture(color: string) {
  if (!holeTex) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#1b2a52";
    g.beginPath();
    g.arc(32, 32, 15, 0, Math.PI * 2);
    g.fill();
    holeTex = new THREE.CanvasTexture(c);
    holeTex.wrapS = THREE.RepeatWrapping;
    holeTex.colorSpace = THREE.SRGBColorSpace;
  }
  void color;
  return holeTex;
}

function BeamMaterials({ p, color }: { p: Part; color: string }) {
  const along = p.len >= p.wid; // holes visible on the long sides
  const n = Math.max(1, Math.round((along ? p.len : p.wid) / 8));
  const tex = useMemo(() => {
    const t = holeTexture(color).clone();
    t.repeat.set(n, 1);
    t.needsUpdate = true;
    return t;
  }, [n, color]);
  // box faces: +X, −X, +Y, −Y, +Z, −Z  (three.js)
  return along ? (
    <>
      {[0, 1].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color={color} map={tex} roughness={0.55} />)}
      {[2, 3, 4, 5].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color={color} roughness={0.55} />)}
    </>
  ) : (
    <>
      {[0, 1, 2, 3].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color={color} roughness={0.55} />)}
      {[4, 5].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color={color} map={tex} roughness={0.55} />)}
    </>
  );
}

function PartMesh({ p, b, selected, onDown, onMove, onUp }: {
  p: Part;
  b: RobotBuild;
  selected: boolean;
  onDown(e: ThreeEvent<PointerEvent>, p: Part): void;
  onMove(e: ThreeEvent<PointerEvent>): void;
  onUp(e: ThreeEvent<PointerEvent>): void;
}) {
  const h = partHeight(p);
  const z = partZ(p, b);
  const pos: [number, number, number] = [p.y, z + h / 2, -p.x];
  const isThin = p.kind === "beam" && h <= 4.5;
  const color = isThin ? COLORS.thin : COLORS[p.kind] ?? "#cccccc";
  const handlers = { onPointerDown: (e: ThreeEvent<PointerEvent>) => onDown(e, p), onPointerMove: onMove, onPointerUp: onUp };
  const edge = selected ? <Edges scale={1.02} threshold={15} color="#1e4fd8" lineWidth={2.5} /> : null;

  if (p.kind === "openFrame") {
    const t = 8; // frame bar width
    const bars: [number, number, number, number][] = [
      [0, -p.len / 2 + t / 2, p.wid, t],
      [0, p.len / 2 - t / 2, p.wid, t],
      [-p.wid / 2 + t / 2, 0, t, p.len - 2 * t],
      [p.wid / 2 - t / 2, 0, t, p.len - 2 * t],
    ];
    return (
      <group position={pos} {...handlers}>
        {bars.map(([x, zz, w, l], i) => (
          <mesh key={i} position={[x, 0, zz]} castShadow receiveShadow>
            <boxGeometry args={[w, h, l]} />
            <meshStandardMaterial color={COLORS.openFrame} roughness={0.5} />
          </mesh>
        ))}
        {selected && (
          <mesh>
            <boxGeometry args={[p.wid, h, p.len]} />
            <meshBasicMaterial transparent opacity={0} />
            {edge}
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group position={pos} {...handlers}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[p.wid, h, p.len]} />
        {p.kind === "beam" || p.kind === "brick" ? (
          <BeamMaterials p={p} color={color} />
        ) : (
          <meshStandardMaterial
            color={color}
            roughness={0.45}
            transparent={p.kind === "attachment" || p.kind === "frame"}
            opacity={p.kind === "attachment" ? 0.7 : p.kind === "frame" ? 0.35 : 1}
          />
        )}
        {edge}
      </mesh>
      {p.kind === "hub" && (
        <>
          <mesh position={[0, h / 2 + 0.6, -p.len * 0.08]}>
            <boxGeometry args={[p.wid - 14, 1.2, p.wid - 14]} />
            <meshStandardMaterial color="#1b2238" roughness={0.3} />
          </mesh>
          <mesh position={[0, h / 2 + 1, p.len / 2 - 14]}>
            <cylinderGeometry args={[6, 6, 2, 24]} />
            <meshStandardMaterial color="#d7dbe6" />
          </mesh>
        </>
      )}
      {(p.kind === "motorL" || p.kind === "motorM") && (
        <mesh position={[0, h / 2 + 0.8, -p.len / 2 + 14]}>
          <cylinderGeometry args={[Math.min(p.wid, 28) / 2 - 2, Math.min(p.wid, 28) / 2 - 2, 1.6, 28]} />
          <meshStandardMaterial color="#14a3c8" />
        </mesh>
      )}
      {(p.kind === "colorSensor" || p.kind === "distanceSensor" || p.kind === "forceSensor") && (
        <mesh position={[0, -h / 2 - 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[6, 20]} />
          <meshStandardMaterial color={p.kind === "forceSensor" ? "#e0a000" : "#1b2238"} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

export interface Robot3DProps {
  value: RobotBuild;
  onChange(b: RobotBuild): void;
  selected: string | null;
  onSelect(id: string | null): void;
  dark: boolean;
}

export default function Robot3D({ value: b, onChange, selected, onSelect, dark }: Robot3DProps) {
  const controls = useRef<any>(null);
  const drag = useRef<null | { id: string; plane: THREE.Plane; dx: number; dy: number }>(null);
  const f = fixedParts(b);
  const stats = buildStats(b);
  const r = b.wheelDiameterMm / 2;
  const ww = wheelWidth(b.wheelDiameterMm);
  const ms = { len: f.motors[0].len, wid: f.motors[0].wid, h: f.motors[0].h };

  const onDown = (e: ThreeEvent<PointerEvent>, p: Part) => {
    e.stopPropagation();
    onSelect(p.id);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -e.point.y);
    drag.current = { id: p.id, plane, dx: -e.point.z - p.x, dy: e.point.x - p.y };
    (e.target as any)?.setPointerCapture?.(e.pointerId);
    if (controls.current) controls.current.enabled = false;
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(d.plane, hit)) return;
    const x = Math.max(-200, Math.min(240, snap(-hit.z - d.dx)));
    const y = Math.max(-200, Math.min(200, snap(hit.x - d.dy)));
    onChange({ ...b, parts: b.parts.map((q) => (q.id === d.id ? { ...q, x, y } : q)) });
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as any)?.releasePointerCapture?.(e.pointerId);
    drag.current = null;
    if (controls.current) controls.current.enabled = true;
  };

  const bg = dark ? "#0b1230" : "#eef2fb";
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [210, 190, 250], fov: 38, near: 1, far: 4000 }}
      onPointerMissed={() => onSelect(null)}
      style={{ borderRadius: 20, touchAction: "none" }}
    >
      <color attach="background" args={[bg]} />
      <hemisphereLight args={["#ffffff", dark ? "#1b2a5a" : "#c9d6f2", 0.9]} />
      <directionalLight position={[220, 420, 160]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-300} shadow-camera-right={300} shadow-camera-top={300} shadow-camera-bottom={-300} />
      <OrbitControls ref={controls} makeDefault enableDamping target={[0, 40, -10]} minDistance={140} maxDistance={1200} maxPolarAngle={Math.PI / 2.05} />
      <Grid
        args={[800, 800]}
        cellSize={8}
        cellThickness={0.6}
        cellColor={dark ? "#24336a" : "#c9d3ec"}
        sectionSize={40}
        sectionThickness={1}
        sectionColor={dark ? "#3a4f96" : "#9fb0dc"}
        fadeDistance={900}
        fadeStrength={1.5}
        infiniteGrid
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[1600, 1600]} />
        <shadowMaterial opacity={dark ? 0.35 : 0.18} />
      </mesh>

      {/* forward arrow on the floor */}
      <mesh position={[0, 0.5, -(stats.axleToFrontMm + 40)]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <coneGeometry args={[14, 30, 3]} />
        <meshBasicMaterial color="#1e4fd8" />
      </mesh>

      {/* drive wheels */}
      {f.wheels.map((w, i) => (
        <group key={"w" + i} position={[w.y, r, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[r, r, ww, 40]} />
            <meshStandardMaterial color="#1c2030" roughness={0.9} />
          </mesh>
          <mesh position={[0, (i === 0 ? -1 : 1) * (ww / 2 + 0.2), 0]}>
            <cylinderGeometry args={[r * 0.62, r * 0.62, 0.6, 32]} />
            <meshStandardMaterial color="#d9deea" />
          </mesh>
        </group>
      ))}
      {/* drive motors */}
      {f.motors.map((m, i) => (
        <group key={"m" + i} position={[m.y, m.z + ms.h / 2, -m.x]}>
          <mesh castShadow>
            <boxGeometry args={[ms.wid, ms.h, ms.len]} />
            <meshStandardMaterial color="#f5f6fa" roughness={0.45} />
          </mesh>
          <mesh position={[(i === 0 ? -1 : 1) * (ms.wid / 2 + 0.6), 0, -ms.len / 2 + 14]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[11, 11, 1.2, 28]} />
            <meshStandardMaterial color="#14a3c8" />
          </mesh>
        </group>
      ))}
      {/* caster */}
      <group position={[0, 0, -b.casterX]}>
        <mesh position={[0, 8, 0]} castShadow>
          {b.caster === "ball" ? <sphereGeometry args={[8, 24, 16]} /> : <boxGeometry args={[24, 6, 14]} />}
          <meshStandardMaterial color={b.caster === "ball" ? "#c8ccd6" : "#9aa3b8"} metalness={0.4} roughness={0.35} />
        </mesh>
        <mesh position={[0, 20, 0]} castShadow>
          <boxGeometry args={[24, 10, 24]} />
          <meshStandardMaterial color="#e9edf6" />
        </mesh>
      </group>

      {/* user parts */}
      {b.parts.map((p) => (
        <PartMesh key={p.id} p={p} b={b} selected={p.id === selected} onDown={onDown} onMove={onMove} onUp={onUp} />
      ))}

      {/* centre of mass */}
      <group position={[stats.com.y, stats.com.z, -stats.com.x]}>
        <mesh>
          <sphereGeometry args={[6, 20, 14]} />
          <meshBasicMaterial color="#0b1f6e" depthTest={false} transparent opacity={0.95} />
        </mesh>
        <mesh position={[0, -stats.com.z / 2, 0]}>
          <cylinderGeometry args={[0.8, 0.8, stats.com.z, 6]} />
          <meshBasicMaterial color="#0b1f6e" depthTest={false} transparent opacity={0.5} />
        </mesh>
      </group>
    </Canvas>
  );
}
