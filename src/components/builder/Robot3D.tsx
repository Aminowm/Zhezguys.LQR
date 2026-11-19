// 3D robot configurator view (three.js via react-three-fiber).
// Robot frame (x forward, y right, z up) → three.js (X = y, Y = z, Z = −x).
import { ReactElement, useRef } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Edges, RoundedBox, Environment, Lightformer, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { partColor } from "../../robot/colors";
import { BallCaster, ColorSensor, DistanceSensor, ForceSensor, Liftarm, OpenFrame, Plastic, SpikeHub, SpikeMotor, TechnicBrick, Wheel } from "./parts3d";
import { buildStats, fixedParts, Part, partHeight, partZ, RobotBuild, wheelWidth } from "../../robot/build";

const snap = (v: number, s = 4) => Math.round(v / s) * s;

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
  const color = partColor(p);
  const handlers = { onPointerDown: (e: ThreeEvent<PointerEvent>) => onDown(e, p), onPointerMove: onMove, onPointerUp: onUp };
  const dims = { wid: p.wid, h, len: p.len };

  let body: ReactElement;
  switch (p.kind) {
    case "hub":
      body = <SpikeHub {...dims} />;
      break;
    case "motorL":
    case "motorM":
      body = <SpikeMotor {...dims} out={{ axis: "y", sign: 1 }} />;
      break;
    case "colorSensor":
      body = <ColorSensor {...dims} />;
      break;
    case "distanceSensor":
      body = <DistanceSensor {...dims} />;
      break;
    case "forceSensor":
      body = <ForceSensor {...dims} />;
      break;
    case "beam":
      body = <Liftarm {...dims} color={color} />;
      break;
    case "brick":
      body = <TechnicBrick {...dims} color={color} />;
      break;
    case "openFrame":
      body = <OpenFrame {...dims} color={color} />;
      break;
    default:
      // chassis estimate and custom attachments: a tinted see-through volume
      body = (
        <RoundedBox args={[p.wid, h, p.len]} radius={Math.min(3, h / 3)} smoothness={3}>
          <Plastic color={color} opacity={p.kind === "frame" ? 0.28 : 0.55} />
          <Edges threshold={20} color={color} />
        </RoundedBox>
      );
  }
  return (
    <group position={pos} {...handlers}>
      {body}
      {selected && (
        <mesh>
          <boxGeometry args={[p.wid + 1.5, h + 1.5, p.len + 1.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges threshold={15} color="#1d6fd8" lineWidth={2.5} />
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

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ position: [210, 190, 250], fov: 38, near: 1, far: 4000 }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: "none", background: "var(--stage)" }}
    >
      {/* studio lighting made on the fly (no downloads): soft boxes around the robot */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 2]} scale={[10, 4, 1]} rotation={[Math.PI / 2.2, 0, 0]} />
        <Lightformer form="rect" intensity={1.4} position={[-6, 2, 4]} scale={[6, 3, 1]} rotation={[0, -Math.PI / 4, 0]} />
        <Lightformer form="rect" intensity={1.1} position={[6, 2, -4]} scale={[6, 3, 1]} rotation={[0, Math.PI * 0.75, 0]} color="#dbe9ff" />
        <Lightformer form="ring" intensity={0.8} position={[0, 3, -8]} scale={4} color="#fff4e2" />
      </Environment>
      <ambientLight intensity={0.15} />
      <directionalLight position={[220, 420, 160]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-camera-left={-300} shadow-camera-right={300} shadow-camera-top={300} shadow-camera-bottom={-300} />
      <OrbitControls ref={controls} makeDefault enableDamping target={[0, 40, -10]} minDistance={140} maxDistance={1200} maxPolarAngle={Math.PI / 2.05} />
      <Grid
        args={[800, 800]}
        position={[0, -0.3, 0]}
        cellSize={8}
        cellThickness={0.5}
        cellColor={dark ? "#2b3a5c" : "#d9e3ef"}
        sectionSize={40}
        sectionThickness={0.9}
        sectionColor={dark ? "#3f5785" : "#a9c3dd"}
        fadeDistance={900}
        fadeStrength={1.5}
        infiniteGrid
      />
      <ContactShadows position={[0, 0.05, 0]} scale={700} resolution={1024} blur={2.2} far={180} opacity={dark ? 0.7 : 0.42} color="#0b1a33" />

      {/* forward arrow on the floor */}
      <mesh position={[0, 0.5, -(stats.axleToFrontMm + 40)]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <coneGeometry args={[14, 30, 3]} />
        <meshBasicMaterial color="#2c7be5" />
      </mesh>

      {/* drive wheels */}
      {f.wheels.map((w, i) => (
        <group key={"w" + i} position={[w.y, r, 0]} rotation={[0, i === 0 ? Math.PI : 0, 0]}>
          <Wheel d={b.wheelDiameterMm} w={ww} />
        </group>
      ))}
      {/* drive motors, output disc facing the wheel */}
      {f.motors.map((m, i) => (
        <group key={"m" + i} position={[m.y, m.z + ms.h / 2, -m.x]}>
          <SpikeMotor wid={ms.wid} h={ms.h} len={ms.len} out={{ axis: "x", sign: i === 0 ? -1 : 1 }} discZ={-ms.len / 2 + 14} />
        </group>
      ))}
      {/* caster */}
      <group position={[0, 0, -b.casterX]}>
        <BallCaster kind={b.caster} />
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
