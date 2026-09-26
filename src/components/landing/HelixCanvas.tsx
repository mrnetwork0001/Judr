"use client";

/*
 * The helix.
 *
 * A fixed, full-viewport WebGL scene behind the landing page: a ribbon of
 * rounded plates - documents, in Judr's terms - laid along a gentle curve and
 * twisted into a helix. Glossy pearl and brass under a studio environment,
 * drawn at low opacity so the sheen and the glass do the rest.
 *
 * It is scroll-driven. Each section of the page has a keyframe (position,
 * rotation, twist phase) and the ribbon eases between them as the visitor
 * scrolls, so it drifts across the page rather than sitting behind it. When
 * motion is welcome the twist also advances with time; under
 * prefers-reduced-motion it renders only on scroll. Without WebGL the canvas
 * simply hides, and the page is complete without it.
 *
 * The technique is after usereins.xyz; the object and palette are Judr's.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/* ---------------------------------------------------------------- */
/* Geometry - one rounded plate, extruded with a soft bevel          */
/* ---------------------------------------------------------------- */

const PLATE_W = 2.5;
const PLATE_H = 1.55;
const PLATE_R = 0.42;

function plateShape(): THREE.Shape {
  const w = PLATE_W / 2;
  const h = PLATE_H / 2;
  const r = PLATE_R;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w, h - r);
  s.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w + r, h);
  s.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w, -h + r);
  s.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function plateGeometry(): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(plateShape(), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.045,
    bevelSegments: 4,
    curveSegments: 14,
  });
  geo.computeVertexNormals();
  geo.center();
  // Stand the plate up so the ribbon reads edge-on as it twists.
  geo.rotateY(Math.PI / 2);
  return geo;
}

/* ---------------------------------------------------------------- */
/* The ribbon                                                        */
/* ---------------------------------------------------------------- */

const COUNT = 96;
const SPACING = 0.52;
const TWIST = 0.135;
const TWIST_BASE = -0.9;
const TWIST_PHASE = 0.42;

/* Judr's palette in the metal: pearl and silver with brass caught in it. */
const PALETTE = {
  pearl: new THREE.Color("#ece8f1"),
  silver: new THREE.Color("#cdd2dc"),
  champagne: new THREE.Color("#f1e3c6"),
  brass: new THREE.Color("#d9a441"),
  white: new THREE.Color("#ffffff"),
};

function paint(mesh: THREE.InstancedMesh): void {
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const a = 0.5 + 0.5 * Math.sin(i * 0.17 + 1.3);
    const b = 0.5 + 0.5 * Math.sin(i * 0.08 - 0.6);
    const brass = 0.5 + 0.5 * Math.sin(i * 0.105 + 2.2);
    const lift = 0.06 + 0.5 * brass ** 2;
    c.copy(PALETTE.pearl)
      .lerp(PALETTE.silver, a * 0.45)
      .lerp(PALETTE.champagne, b * 0.55)
      .lerp(PALETTE.brass, brass ** 2 * 0.38)
      .lerp(PALETTE.white, lift * 0.35);
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function buildRibbon() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.42,
    roughness: 0.09,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.45,
    specularIntensity: 1.2,
    iridescence: 0.9,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [160, 640],
  });
  const mesh = new THREE.InstancedMesh(plateGeometry(), material, COUNT);
  mesh.frustumCulled = false;
  paint(mesh);

  const dummy = new THREE.Object3D();
  const layout = (phase: number) => {
    for (let i = 0; i < COUNT; i++) {
      const k = i - COUNT / 2;
      dummy.position.set(k * SPACING, 0.42 * Math.sin(k * 0.085), 0.22 * Math.sin(k * 0.06 + 1.2));
      const wobble = 0.05 * Math.sin(i * 0.21 - phase * 0.9);
      dummy.rotation.set(TWIST_BASE + i * TWIST + phase * TWIST_PHASE + wobble, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    mesh,
    layout,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/* ---------------------------------------------------------------- */
/* Lighting                                                          */
/* ---------------------------------------------------------------- */

const LIGHTS: Array<{ color: string; intensity: number; position: [number, number, number] }> = [
  { color: "#fff6e6", intensity: 1.35, position: [2.5, 6, 5] },
  { color: "#f3d9a4", intensity: 1.0, position: [-4, 3.5, 1.5] },
  { color: "#d5dcf0", intensity: 0.55, position: [-6, 1, 4] },
  { color: "#d9a441", intensity: 1.5, position: [6, -1.5, 4] },
  { color: "#c9c4d8", intensity: 0.3, position: [0, -6, 2] },
];

function light(scene: THREE.Scene): void {
  for (const l of LIGHTS) {
    const p = new THREE.PointLight(l.color, l.intensity);
    p.position.set(...l.position);
    scene.add(p);
  }
  scene.add(new THREE.AmbientLight("#bfbccb", 0.06));
}

/* ---------------------------------------------------------------- */
/* Scroll keyframes - one per landing section                        */
/* ---------------------------------------------------------------- */

interface Pose {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  ph: number;
}

const HERO: Pose = { px: -2.2, py: 2.6, pz: 0.4, rx: 0.34, ry: 0.26, rz: -0.56, ph: 0 };

const KEYFRAMES: Array<[string, Pose]> = [
  ["hero", HERO],
  ["how", { px: 0.8, py: -5, pz: 0.6, rx: -0.2, ry: 0.18, rz: -0.34, ph: 1.6 }],
  ["graph", { px: 6.4, py: 0.6, pz: 1.2, rx: 0.55, ry: 0.1, rz: -1.32, ph: 2.9 }],
  ["safeguards", { px: -1, py: 6.9, pz: 1, rx: 1.3, ry: 0.15, rz: -0.28, ph: 4.1 }],
  ["built", { px: 5.6, py: -3.4, pz: 0.4, rx: -0.34, ry: 0.2, rz: -0.4, ph: 5.3 }],
  ["closing", { px: 0.2, py: 6.8, pz: 0.2, rx: 0.26, ry: 0.2, rz: -0.58, ph: 6.4 }],
];

type Stop = Pose & { at: number };

/** Where each section's keyframe sits, in viewport heights of scroll. */
function measure(): Stop[] {
  const vh = window.innerHeight;
  return KEYFRAMES.flatMap(([id, pose]) => {
    const el = document.getElementById(id);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    const centre = r.top + window.scrollY + Math.min(r.height, vh * 1.4) / 2 - vh / 2;
    return [{ ...pose, at: Math.max(0, centre) / vh }];
  }).sort((a, b) => a.at - b.at);
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function poseAt(stops: Stop[], y: number): Pose {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return HERO;
  if (y <= first.at) return first;
  if (y >= last.at) return last;
  const i = stops.findIndex((s) => s.at >= y);
  const a = stops[i - 1] ?? first;
  const b = stops[i] ?? last;
  const t = smooth((y - a.at) / Math.max(1e-6, b.at - a.at));
  return {
    px: mix(a.px, b.px, t),
    py: mix(a.py, b.py, t),
    pz: mix(a.pz, b.pz, t),
    rx: mix(a.rx, b.rx, t),
    ry: mix(a.ry, b.ry, t),
    rz: mix(a.rz, b.rz, t),
    ph: mix(a.ph, b.ph, t),
  };
}

/* ---------------------------------------------------------------- */
/* Runtime                                                           */
/* ---------------------------------------------------------------- */

const CAMERA_Z = 21;
const STILL_PHASE = 7.3;

function start(canvas: HTMLCanvasElement, context: WebGL2RenderingContext, animate: boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.fog = new THREE.Fog("#f1f1f3", 26, 50);
  light(scene);

  const ribbon = buildRibbon();
  const group = new THREE.Group();
  group.add(ribbon.mesh);
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  let stops = measure();

  const render = (scrollY: number, time: number) => {
    const p = poseAt(stops, scrollY / window.innerHeight);
    group.position.set(p.px, p.py, p.pz);
    group.rotation.set(p.rx, p.ry, p.rz);
    ribbon.layout(time * 0.55 + p.ph);
    renderer.render(scene, camera);
  };
  const renderStill = () => render(window.scrollY, STILL_PHASE);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0, CAMERA_Z * Math.max(1, (1.15 / camera.aspect) ** 0.65));
    camera.updateProjectionMatrix();
    stops = measure();
    if (!animate) renderStill();
  };

  // Scroll is smoothed so the ribbon glides rather than tracking the wheel.
  let frame = 0;
  let smoothed = window.scrollY;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    smoothed += (window.scrollY - smoothed) * (1 - Math.exp(-dt * 6));
    render(smoothed, now / 1000);
    frame = requestAnimationFrame(loop);
  };
  const pause = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (animate && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }
  };

  const observer = new ResizeObserver(() => {
    stops = measure();
  });
  observer.observe(document.body);
  window.addEventListener("resize", resize);
  resize();

  if (animate) {
    frame = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", pause);
  } else {
    window.addEventListener("scroll", renderStill, { passive: true });
  }

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", renderStill);
    document.removeEventListener("visibilitychange", pause);
    ribbon.dispose();
    env.dispose();
    renderer.dispose();
  };
}

export default function HelixCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("webgl2", { antialias: true, alpha: true });
    if (!context) {
      canvas.hidden = true;
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return start(canvas, context, !reduced);
  }, []);

  return <canvas ref={ref} className="scene" aria-hidden="true" />;
}
