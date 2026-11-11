"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Interactive 3D hero: a glowing "room" core with participant video tiles
 * orbiting it, live signal links, floating chat bubbles and a particle field.
 * The whole scene leans toward the pointer. Loaded client-side only (see
 * LandingPage) so three.js never lands in other routes' bundles.
 */

const PEOPLE = [
  { name: "Ava", color: "#7C5CFF" },
  { name: "Leo", color: "#3D8BFF" },
  { name: "Mia", color: "#22C55E" },
  { name: "Noah", color: "#F59E0B" },
  { name: "Zara", color: "#06B6D4" },
  { name: "Kai", color: "#EC4899" },
];

const BUBBLES = [
  { pos: [-2.6, 1.6, 0.8], color: "#7C5CFF", phase: 0 },
  { pos: [2.4, 1.9, -0.6], color: "#3D8BFF", phase: 1.3 },
  { pos: [-2.1, -1.7, -0.4], color: "#22C55E", phase: 2.1 },
  { pos: [2.7, -1.3, 0.9], color: "#F59E0B", phase: 3.4 },
] as const;

/** Small deterministic PRNG (mulberry32): same "random" field every render. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SceneProps {
  /** Animate continuously (false = render one still frame, for reduced motion). */
  animate: boolean;
  /** Lighter scene for small/low-power devices. */
  lite: boolean;
}

/** Pointer position over the whole window, normalised to -1..1. */
function usePointer() {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return pointer;
}

/** A mini "video call" card drawn onto a canvas: gradient, avatar, name tag. */
function makeTileTexture(name: string, color: string): THREE.CanvasTexture {
  const w = 320;
  const h = 200;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#1C1C2A");
  bg.addColorStop(1, "#0B0B14");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 26);
  ctx.fill();

  // soft colour glow behind the avatar
  const glow = ctx.createRadialGradient(w / 2, h / 2 - 8, 6, w / 2, h / 2 - 8, 110);
  glow.addColorStop(0, `${color}AA`);
  glow.addColorStop(1, `${color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // avatar
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2 - 10, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "600 40px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name[0], w / 2, h / 2 - 8);

  // name tag + "speaking" dot
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(16, h - 46, 118, 30, 15);
  ctx.fill();
  ctx.fillStyle = "#22C55E";
  ctx.beginPath();
  ctx.arc(34, h - 31, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#F5F5F7";
  ctx.font = "500 18px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(name, 48, h - 30);

  // border
  ctx.strokeStyle = `${color}CC`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 24);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Core({ animate }: { animate: boolean }) {
  const solid = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    if (!animate || !solid.current || !shell.current || !halo.current) return;
    const t = clock.elapsedTime;
    solid.current.rotation.y += delta * 0.3;
    solid.current.rotation.x += delta * 0.12;
    solid.current.scale.setScalar(1 + Math.sin(t * 1.8) * 0.05);
    shell.current.rotation.y -= delta * 0.18;
    shell.current.rotation.z += delta * 0.08;
    const pulse = (Math.sin(t * 1.8) + 1) / 2;
    (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + pulse * 0.1;
    halo.current.scale.setScalar(1.9 + pulse * 0.25);
  });

  return (
    <group>
      <mesh ref={solid}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial
          color="#7C5CFF"
          emissive="#4B2FD6"
          emissiveIntensity={0.7}
          roughness={0.25}
          metalness={0.45}
          flatShading
        />
      </mesh>
      <mesh ref={shell} scale={1.4}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshBasicMaterial color="#9D87FF" wireframe transparent opacity={0.28} />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#7C5CFF" transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Tiles({ animate, radius }: { animate: boolean; radius: number }) {
  const tiles = useRef<(THREE.Group | null)[]>([]);
  const links = useRef<THREE.LineSegments>(null);
  const angle = useRef(0);
  const { camera } = useThree();

  const textures = useMemo(() => PEOPLE.map((p) => makeTileTexture(p.name, p.color)), []);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  const linkGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(PEOPLE.length * 2 * 3), 3),
    );
    return geometry;
  }, []);
  useEffect(() => () => linkGeometry.dispose(), [linkGeometry]);

  const place = (t: number) => {
    const positions = linkGeometry.getAttribute("position") as THREE.BufferAttribute;
    tiles.current.forEach((tile, i) => {
      if (!tile) return;
      const a = angle.current + (i / PEOPLE.length) * Math.PI * 2;
      const bob = Math.sin(t * 1.2 + i * 1.7) * 0.18;
      tile.position.set(Math.cos(a) * radius, Math.sin(a * 2 + i) * 0.3 + bob, Math.sin(a) * radius * 0.55);
      tile.lookAt(camera.position);
      positions.setXYZ(i * 2, 0, 0, 0);
      positions.setXYZ(i * 2 + 1, tile.position.x, tile.position.y, tile.position.z);
    });
    positions.needsUpdate = true;
    linkGeometry.computeBoundingSphere();
  };

  useFrame(({ clock }, delta) => {
    if (animate) angle.current += delta * 0.18;
    place(animate ? clock.elapsedTime : 0);
  });

  return (
    <group>
      <lineSegments ref={links} geometry={linkGeometry}>
        <lineBasicMaterial color="#8B7BFF" transparent opacity={0.35} />
      </lineSegments>
      {PEOPLE.map((person, i) => (
        <group
          key={person.name}
          scale={0.82}
          ref={(el) => {
            tiles.current[i] = el;
          }}
        >
          {/* glass frame */}
          <mesh position={[0, 0, -0.03]}>
            <boxGeometry args={[1.72, 1.12, 0.05]} />
            <meshPhysicalMaterial
              color={person.color}
              roughness={0.15}
              metalness={0.1}
              clearcoat={1}
              transparent
              opacity={0.55}
            />
          </mesh>
          {/* "video" */}
          <mesh>
            <planeGeometry args={[1.6, 1]} />
            <meshStandardMaterial
              map={textures[i]}
              emissiveMap={textures[i]}
              emissive="#FFFFFF"
              emissiveIntensity={0.35}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ChatBubbles({ animate }: { animate: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const b = BUBBLES[i];
      g.position.y = b.pos[1] + Math.sin(t * 1.4 + b.phase) * 0.22;
      g.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.12;
    });
  });
  return (
    <>
      {BUBBLES.map((b, i) => (
        <group
          key={i}
          position={[...b.pos]}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.2, 0.42, 8, 16]} />
            <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.45} roughness={0.3} />
          </mesh>
          {/* typing dots */}
          {[-0.14, 0, 0.14].map((x) => (
            <mesh key={x} position={[x, 0, 0.19]}>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function Particles({ count, animate }: { count: number; animate: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const random = seededRandom(20261111);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // random points in a spherical shell
      const r = 4.2 + random() * 3.5;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.7;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (animate && ref.current) ref.current.rotation.y += delta * 0.03;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color="#A5B4FC" size={0.035} sizeAttenuation transparent opacity={0.75} depthWrite={false} />
    </points>
  );
}

/** Orbit radius and how far the scene reaches sideways (tile half-width + bubbles). */
const ORBIT_RADIUS = 3.4;
const SCENE_HALF_WIDTH = ORBIT_RADIUS + 1.25;
const FOV = 45;

function Rig({ animate, lite }: SceneProps) {
  const root = useRef<THREE.Group>(null);
  const pointer = usePointer();
  const { size, camera } = useThree();
  const aspect = size.width / Math.max(1, size.height);

  // Fit the whole orbit horizontally for whatever shape the canvas is
  // (phones get a narrower canvas, so the camera pulls back further).
  useEffect(() => {
    const halfFov = THREE.MathUtils.degToRad(FOV / 2);
    const distance = Math.max(8, SCENE_HALF_WIDTH / (Math.tan(halfFov) * aspect));
    camera.position.set(0, 0.4, distance);
    camera.lookAt(0, 0, 0);
  }, [camera, aspect]);

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    // ease toward the pointer for a responsive, weighty tilt
    const targetY = pointer.current.x * 0.45;
    const targetX = 0.32 + pointer.current.y * 0.25;
    g.rotation.y += (targetY - g.rotation.y) * 0.05;
    g.rotation.x += (targetX - g.rotation.x) * 0.05;
  });

  return (
    <group ref={root} rotation={[0.32, 0, 0]}>
      <Core animate={animate} />
      <Tiles animate={animate} radius={ORBIT_RADIUS} />
      <ChatBubbles animate={animate} />
      <Particles count={lite ? 260 : 700} animate={animate} />
    </group>
  );
}

export default function HeroScene({
  animate,
  lite,
  active,
}: SceneProps & { /** Render loop on (false while scrolled out of view). */ active: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 9], fov: FOV }}
      dpr={lite ? [1, 1.25] : [1, 1.75]}
      gl={{ antialias: !lite, alpha: true, powerPreference: "high-performance" }}
      frameloop={!active ? "never" : animate ? "always" : "demand"}
      aria-hidden="true"
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={1.1} />
      <pointLight position={[-5, 2, 3]} intensity={30} color="#7C5CFF" />
      <pointLight position={[5, -2, 4]} intensity={30} color="#3D8BFF" />
      <Rig animate={animate} lite={lite} />
    </Canvas>
  );
}
