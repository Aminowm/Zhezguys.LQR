// Realistic-looking SPIKE Prime / LEGO Technic parts for the 3D configurator.
// Units are millimetres. three.js axes: X = robot right, Y = up, Z = robot backwards.
import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";

export const SPIKE = {
  white: "#F2F3F2",
  gray: "#C9CDD1",
  azure: "#36AEBF",
  dark: "#1F2328",
  tyre: "#1C1D1F",
  rim: "#A0A5A9",
};

const PITCH = 8;
const HOLE_R = 2.45;

/** ABS plastic: slightly glossy with a clear coat, like real LEGO. */
export function Plastic({ color, opacity = 1, emissive, emissiveIntensity }: { color: string; opacity?: number; emissive?: string; emissiveIntensity?: number }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={0.38}
      metalness={0}
      clearcoat={0.35}
      clearcoatRoughness={0.4}
      transparent={opacity < 1}
      opacity={opacity}
      depthWrite={opacity >= 1}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
    />
  );
}

function circlePath(cx: number, cy: number, r: number) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

/** Stadium (rounded-end bar) of length L and height H, centred, with optional Technic holes. */
function stadiumShape(L: number, H: number, holes: boolean) {
  const r = H / 2 - 0.05;
  const half = Math.max(0, L / 2 - r);
  const s = new THREE.Shape();
  s.moveTo(-half, -r);
  s.lineTo(half, -r);
  s.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-half, r);
  s.absarc(-half, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  if (holes) {
    const n = Math.max(1, Math.round(L / PITCH));
    for (let k = 0; k < n; k++) s.holes.push(circlePath(-((n - 1) * PITCH) / 2 + k * PITCH, 0, Math.min(HOLE_R, r - 1)));
  }
  return s;
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0.35) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.2, depth - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 14,
  });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}

/** Technic liftarm. Long axis is the bigger of (wid, len); thick beams stand on edge, thin ones lie flat. */
export function Liftarm({ wid, h, len, color }: { wid: number; h: number; len: number; color: string }) {
  const geo = useMemo(() => {
    const alongZ = len >= wid;
    const L = Math.max(len, wid);
    const T = Math.min(len, wid);
    const flat = h <= 4.5;
    let g: THREE.ExtrudeGeometry;
    if (flat) {
      // holes vertical: stadium in the top view, extruded by the height
      g = extrude(stadiumShape(L, Math.min(T, 8), true), h, 0.3);
      g.rotateX(-Math.PI / 2);
    } else {
      // holes horizontal: stadium in the side view, extruded by the thickness
      g = extrude(stadiumShape(L, h, true), Math.min(T, 7.4));
      if (T > 8.5) g.scale(1, 1, T / 7.4);
    }
    if (alongZ) g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, [wid, h, len]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <Plastic color={color} />
    </mesh>
  );
}

/** Technic brick 1×N with studs on top and holes through the sides. */
export function TechnicBrick({ wid, h, len, color }: { wid: number; h: number; len: number; color: string }) {
  const alongZ = len >= wid;
  const L = Math.max(len, wid);
  const T = Math.min(len, wid);
  const n = Math.max(1, Math.round(L / PITCH));
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-L / 2 + 0.2, -h / 2);
    s.lineTo(L / 2 - 0.2, -h / 2);
    s.lineTo(L / 2 - 0.2, h / 2);
    s.lineTo(-L / 2 + 0.2, h / 2);
    s.closePath();
    for (let k = 0; k < n - 1; k++) s.holes.push(circlePath(-((n - 2) * PITCH) / 2 + k * PITCH, 0.6, HOLE_R));
    const g = extrude(s, T - 0.2, 0.25);
    if (alongZ) g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, [L, T, h, n, alongZ]);
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <Plastic color={color} />
      </mesh>
      {Array.from({ length: n }, (_, k) => {
        const u = -((n - 1) * PITCH) / 2 + k * PITCH;
        return (
          <mesh key={k} position={alongZ ? [0, h / 2 + 0.85, u] : [u, h / 2 + 0.85, 0]} castShadow>
            <cylinderGeometry args={[2.4, 2.4, 1.7, 20]} />
            <Plastic color={color} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Open Technic frame (5×7, 7×11, 11×15 …): a flat ring with holes all round. */
export function OpenFrame({ wid, h, len, color }: { wid: number; h: number; len: number; color: string }) {
  const geo = useMemo(() => {
    const W = wid, L = len, t = PITCH, r = 4;
    const s = new THREE.Shape();
    s.moveTo(-W / 2 + r, -L / 2);
    s.lineTo(W / 2 - r, -L / 2);
    s.absarc(W / 2 - r, -L / 2 + r, r, -Math.PI / 2, 0, false);
    s.lineTo(W / 2, L / 2 - r);
    s.absarc(W / 2 - r, L / 2 - r, r, 0, Math.PI / 2, false);
    s.lineTo(-W / 2 + r, L / 2);
    s.absarc(-W / 2 + r, L / 2 - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-W / 2, -L / 2 + r);
    s.absarc(-W / 2 + r, -L / 2 + r, r, Math.PI, (3 * Math.PI) / 2, false);
    const inner = new THREE.Path();
    const iw = W / 2 - t, il = L / 2 - t;
    if (iw > 2 && il > 2) {
      inner.moveTo(-iw, -il);
      inner.lineTo(-iw, il);
      inner.lineTo(iw, il);
      inner.lineTo(iw, -il);
      inner.closePath();
      s.holes.push(inner);
    }
    const nx = Math.round(W / PITCH), nz = Math.round(L / PITCH);
    for (let i = 0; i < nx; i++) {
      const x = -((nx - 1) * PITCH) / 2 + i * PITCH;
      s.holes.push(circlePath(x, -L / 2 + t / 2, HOLE_R));
      s.holes.push(circlePath(x, L / 2 - t / 2, HOLE_R));
    }
    for (let k = 1; k < nz - 1; k++) {
      const z = -((nz - 1) * PITCH) / 2 + k * PITCH;
      s.holes.push(circlePath(-W / 2 + t / 2, z, HOLE_R));
      s.holes.push(circlePath(W / 2 - t / 2, z, HOLE_R));
    }
    const g = extrude(s, h, 0.3);
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, [wid, h, len]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <Plastic color={color} />
    </mesh>
  );
}

// a 5×5 "Z" for Zhezguys on the light matrix
const MATRIX = ["11111", "00010", "00100", "01000", "11111"];

/** SPIKE Prime hub: white body, black top with the 5×5 light matrix, buttons and ports. */
export function SpikeHub({ wid, h, len }: { wid: number; h: number; len: number }) {
  const top = h / 2;
  const panelL = len * 0.66;
  const panelZ = -len / 2 + panelL / 2 + 6;
  return (
    <group>
      <RoundedBox args={[wid, h, len]} radius={5} smoothness={4} castShadow receiveShadow>
        <Plastic color={SPIKE.white} />
      </RoundedBox>
      {/* gray side bands with pin holes */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (wid / 2 + 0.15), -h * 0.12, 0]}>
          <mesh>
            <boxGeometry args={[0.6, h * 0.5, len - 10]} />
            <Plastic color={SPIKE.gray} />
          </mesh>
          {Array.from({ length: Math.round((len - 16) / PITCH) }, (_, k) => (
            <mesh key={k} position={[s * 0.35, 0, -((Math.round((len - 16) / PITCH) - 1) * PITCH) / 2 + k * PITCH]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[2.3, 2.3, 0.4, 16]} />
              <meshStandardMaterial color="#3a3f45" roughness={0.8} />
            </mesh>
          ))}
          {/* three ports per side */}
          {[-1, 0, 1].map((k) => (
            <mesh key={"p" + k} position={[s * 0.4, h * 0.36, k * (len * 0.26)]}>
              <boxGeometry args={[0.8, 5, 11]} />
              <meshStandardMaterial color="#111316" roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {/* black top panel */}
      <RoundedBox args={[wid - 9, 1.2, panelL]} radius={0.5} smoothness={2} position={[0, top + 0.2, panelZ]}>
        <meshPhysicalMaterial color="#15181c" roughness={0.25} clearcoat={0.8} clearcoatRoughness={0.15} />
      </RoundedBox>
      {/* light matrix */}
      {MATRIX.flatMap((row, i) =>
        row.split("").map((c, j) => (
          <mesh key={`${i}-${j}`} position={[(j - 2) * 6.4, top + 0.95, panelZ - panelL * 0.14 + (i - 2) * 6.4]}>
            <boxGeometry args={[3.6, 0.3, 3.6]} />
            <meshStandardMaterial color={c === "1" ? "#fff6dc" : "#2a2e33"} emissive={c === "1" ? "#ffe9b0" : "#000000"} emissiveIntensity={c === "1" ? 1.6 : 0} />
          </mesh>
        )),
      )}
      {/* centre button with its light ring + left/right buttons */}
      <group position={[0, top + 0.9, panelZ + panelL * 0.36]}>
        <mesh>
          <cylinderGeometry args={[5.4, 5.4, 0.5, 32]} />
          <meshStandardMaterial color="#56d68a" emissive="#3bd47a" emissiveIntensity={1.2} />
        </mesh>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[4.2, 4.2, 0.9, 32]} />
          <meshPhysicalMaterial color="#e9ebee" roughness={0.3} clearcoat={0.5} />
        </mesh>
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[6, 0.9, 4]} radius={0.4} smoothness={2} position={[s * 11, 0.1, 0]}>
            <meshStandardMaterial color="#d9dce0" roughness={0.4} />
          </RoundedBox>
        ))}
      </group>
      {/* bluetooth button */}
      <mesh position={[wid / 2 - 8, top + 0.4, len / 2 - 8]}>
        <cylinderGeometry args={[2.6, 2.6, 0.8, 20]} />
        <meshStandardMaterial color="#d9dce0" emissive="#2f80ff" emissiveIntensity={0.6} />
      </mesh>
      {/* USB port at the back */}
      <mesh position={[0, h * 0.1, len / 2 + 0.2]}>
        <boxGeometry args={[8, 3, 0.6]} />
        <meshStandardMaterial color="#111316" />
      </mesh>
    </group>
  );
}

/** Output disc of a SPIKE motor (medium azure) with axle and pin holes. */
function OutputDisc({ r, depth = 1.6 }: { r: number; depth?: number }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r, 0, Math.PI * 2, false);
    // cross axle hole
    const a = 0.9, b = 2.4;
    const cross = new THREE.Path();
    cross.moveTo(-a, -b);
    cross.lineTo(a, -b);
    cross.lineTo(a, -a);
    cross.lineTo(b, -a);
    cross.lineTo(b, a);
    cross.lineTo(a, a);
    cross.lineTo(a, b);
    cross.lineTo(-a, b);
    cross.lineTo(-a, a);
    cross.lineTo(-b, a);
    cross.lineTo(-b, -a);
    cross.lineTo(-a, -a);
    cross.closePath();
    s.holes.push(cross);
    if (r > 9) for (let k = 0; k < 4; k++) s.holes.push(circlePath(Math.cos((k * Math.PI) / 2) * PITCH, Math.sin((k * Math.PI) / 2) * PITCH, 2.1));
    const g = extrude(s, depth, 0.25);
    g.computeVertexNormals();
    return g;
  }, [r, depth]);
  return (
    <mesh geometry={geo} castShadow>
      <Plastic color={SPIKE.azure} />
    </mesh>
  );
}

/**
 * SPIKE angular motor. `out` is the face the output disc is on (three.js axis + sign),
 * `discZ` where along Z the shaft sits (mm from the motor centre).
 */
export function SpikeMotor({ wid, h, len, out = { axis: "y", sign: 1 }, discZ = -len / 2 + 14 }: {
  wid: number;
  h: number;
  len: number;
  out?: { axis: "x" | "y"; sign: 1 | -1 };
  discZ?: number;
}) {
  const r = Math.min(out.axis === "x" ? h : wid, 28) / 2 - 1.5;
  const facePos = out.axis === "x" ? [out.sign * (wid / 2 + 0.2), 0, discZ] : [0, out.sign * (h / 2 + 0.2), discZ];
  const rot: [number, number, number] = out.axis === "x" ? [0, out.sign * (Math.PI / 2), 0] : [-out.sign * (Math.PI / 2), 0, 0];
  const holeSide = out.axis === "x" ? "y" : "x";
  return (
    <group>
      <RoundedBox args={[wid, h, len]} radius={4} smoothness={4} castShadow receiveShadow>
        <Plastic color={SPIKE.white} />
      </RoundedBox>
      {/* gray ring behind the output disc */}
      <group position={facePos as [number, number, number]} rotation={rot}>
        <mesh position={[0, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r + 1.4, r + 1.4, 0.6, 36]} />
          <meshStandardMaterial color={SPIKE.gray} roughness={0.5} />
        </mesh>
        <group position={[0, 0, 0.6]}>
          <OutputDisc r={r} />
        </group>
      </group>
      {/* passive hub on the opposite face */}
      <group position={(out.axis === "x" ? [-out.sign * (wid / 2 + 0.2), 0, discZ] : [0, -out.sign * (h / 2 + 0.2), discZ]) as [number, number, number]}>
        <mesh rotation={out.axis === "x" ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
          <cylinderGeometry args={[r * 0.55, r * 0.55, 0.8, 28]} />
          <meshStandardMaterial color={SPIKE.gray} roughness={0.5} />
        </mesh>
      </group>
      {/* rows of pin holes along the other two faces */}
      {[-1, 1].map((s) =>
        Array.from({ length: Math.max(1, Math.round((len - 20) / PITCH)) }, (_, k) => {
          const z = len / 2 - 8 - k * PITCH;
          const pos: [number, number, number] = holeSide === "x" ? [s * (wid / 2 + 0.1), 0, z] : [0, s * (h / 2 + 0.1), z];
          return (
            <mesh key={`${s}-${k}`} position={pos} rotation={holeSide === "x" ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
              <cylinderGeometry args={[2.3, 2.3, 0.3, 16]} />
              <meshStandardMaterial color="#3a3f45" roughness={0.8} />
            </mesh>
          );
        }),
      )}
      {/* cable */}
      <mesh position={[0, -h * 0.15, len / 2 + 3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.6, 1.6, 6, 10]} />
        <meshStandardMaterial color="#141517" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** SPIKE colour sensor: white cube, black face with a lens and light ring, looking down. */
export function ColorSensor({ wid, h, len }: { wid: number; h: number; len: number }) {
  return (
    <group>
      <RoundedBox args={[wid, h, len]} radius={3} smoothness={3} castShadow>
        <Plastic color={SPIKE.white} />
      </RoundedBox>
      <group position={[0, -h / 2 - 0.2, 0]}>
        <RoundedBox args={[wid - 4, 0.6, len - 4]} radius={0.25} smoothness={2}>
          <meshPhysicalMaterial color="#15181c" roughness={0.2} clearcoat={1} />
        </RoundedBox>
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[6, 6, 0.4, 32]} />
          <meshStandardMaterial color="#e8fbff" emissive="#9be7ff" emissiveIntensity={1.1} />
        </mesh>
        <mesh position={[0, -0.6, 0]}>
          <cylinderGeometry args={[4.2, 4.2, 0.5, 32]} />
          <meshPhysicalMaterial color="#0d1013" roughness={0.05} clearcoat={1} />
        </mesh>
      </group>
    </group>
  );
}

/** SPIKE distance sensor: two "eyes" with light segments, looking forward (−Z). */
export function DistanceSensor({ wid, h, len }: { wid: number; h: number; len: number }) {
  return (
    <group>
      <RoundedBox args={[wid, h, len]} radius={4} smoothness={3} castShadow>
        <Plastic color={SPIKE.white} />
      </RoundedBox>
      <RoundedBox args={[wid - 6, h - 6, 0.8]} radius={0.3} smoothness={2} position={[0, 0, -len / 2 - 0.2]}>
        <meshPhysicalMaterial color="#15181c" roughness={0.2} clearcoat={1} />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * wid * 0.24, 0, -len / 2 - 0.8]}>
          <mesh>
            <torusGeometry args={[6.4, 0.9, 10, 32]} />
            <meshStandardMaterial color="#ffffff" emissive="#dff4ff" emissiveIntensity={0.9} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[5.2, 5.2, 0.8, 32]} />
            <meshPhysicalMaterial color="#090b0d" roughness={0.05} clearcoat={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** SPIKE force sensor: white body with a push button at the front (−Z). */
export function ForceSensor({ wid, h, len }: { wid: number; h: number; len: number }) {
  return (
    <group>
      <RoundedBox args={[wid, h, len]} radius={3} smoothness={3} castShadow>
        <Plastic color={SPIKE.white} />
      </RoundedBox>
      <mesh position={[0, 0, -len / 2 - 2.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[7, 7, 5, 32]} />
        <meshStandardMaterial color="#2b2f34" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, -len / 2 - 5.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.4, 2.4, 0.4, 16]} />
        <meshStandardMaterial color="#0c0d0f" />
      </mesh>
    </group>
  );
}

/** Wheel: light gray rim with lightening holes and a black tyre with tread lugs. Axis = three X. */
export function Wheel({ d, w }: { d: number; w: number }) {
  const r = d / 2;
  const rimR = r * 0.66;
  const tyre = useMemo(() => {
    const t = Math.min(3, w * 0.18);
    const pts = [
      new THREE.Vector2(rimR - 0.5, -w / 2 + 1),
      new THREE.Vector2(r - t - 1, -w / 2),
      new THREE.Vector2(r - 1.6, -w / 2 + t * 0.4),
      new THREE.Vector2(r - 1.2, -w / 2 + t),
      new THREE.Vector2(r - 1.2, w / 2 - t),
      new THREE.Vector2(r - 1.6, w / 2 - t * 0.4),
      new THREE.Vector2(r - t - 1, w / 2),
      new THREE.Vector2(rimR - 0.5, w / 2 - 1),
    ];
    const g = new THREE.LatheGeometry(pts, 64);
    g.rotateZ(Math.PI / 2);
    return g;
  }, [r, w, rimR]);
  const rim = useMemo(() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, rimR, 0, Math.PI * 2, false);
    const holes = d > 70 ? 6 : 5;
    const hr = rimR * 0.2;
    for (let k = 0; k < holes; k++) {
      const a = (k / holes) * Math.PI * 2;
      s.holes.push(circlePath(Math.cos(a) * rimR * 0.58, Math.sin(a) * rimR * 0.58, hr));
    }
    s.holes.push(circlePath(0, 0, 2.6));
    const g = extrude(s, w * 0.82, 0.6);
    g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, [d, rimR, w]);
  const lugs = useMemo(() => {
    const n = Math.round((2 * Math.PI * r) / 5.5);
    const m = new THREE.Matrix4();
    const out: THREE.Matrix4[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      m.makeRotationX(a);
      m.multiply(new THREE.Matrix4().makeTranslation(0, r - 0.9, 0));
      out.push(m.clone());
    }
    return out;
  }, [r]);
  return (
    <group>
      <mesh geometry={tyre} castShadow receiveShadow>
        <meshStandardMaterial color={SPIKE.tyre} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh
        args={[undefined, undefined, lugs.length]}
        castShadow
        ref={(im) => {
          if (!im) return;
          lugs.forEach((m, i) => im.setMatrixAt(i, m));
          im.instanceMatrix.needsUpdate = true;
        }}
      >
        <boxGeometry args={[w * 0.72, 1.8, 2.6]} />
        <meshStandardMaterial color={SPIKE.tyre} roughness={0.95} />
      </instancedMesh>
      <mesh geometry={rim} castShadow>
        <Plastic color={SPIKE.rim} />
      </mesh>
      {/* inner disc so you can't see through the rim into nothing */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[rimR - 0.6, rimR - 0.6, w * 0.3, 36]} />
        <meshStandardMaterial color="#7d8287" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** LEGO ball caster: gray housing with a steel ball. */
export function BallCaster({ kind }: { kind: "ball" | "skid" }) {
  if (kind === "skid")
    return (
      <group>
        <RoundedBox args={[24, 6, 16]} radius={2.5} smoothness={3} position={[0, 3.2, 0]} castShadow>
          <Plastic color={SPIKE.rim} />
        </RoundedBox>
        <RoundedBox args={[24, 10, 24]} radius={2} smoothness={3} position={[0, 12, 0]} castShadow>
          <Plastic color="#6C6E68" />
        </RoundedBox>
      </group>
    );
  return (
    <group>
      <mesh position={[0, 8, 0]} castShadow>
        <sphereGeometry args={[8, 32, 24]} />
        <meshStandardMaterial color="#d8dde3" metalness={0.95} roughness={0.12} />
      </mesh>
      <mesh position={[0, 12.5, 0]} castShadow>
        <cylinderGeometry args={[10.5, 9.5, 7, 32]} />
        <Plastic color="#6C6E68" />
      </mesh>
      <RoundedBox args={[24, 8, 24]} radius={2} smoothness={3} position={[0, 19.5, 0]} castShadow>
        <Plastic color="#6C6E68" />
      </RoundedBox>
    </group>
  );
}
