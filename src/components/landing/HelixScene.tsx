"use client";

import dynamic from "next/dynamic";

/*
 * Three.js is the one heavy dependency in the project, so the scene is loaded
 * after hydration and only on the landing page. Nothing renders on the server
 * and nothing blocks first paint: the page is complete before the helix
 * arrives, and complete without it if WebGL is unavailable.
 */
const HelixCanvas = dynamic(() => import("./HelixCanvas"), { ssr: false });

export default function HelixScene() {
  return <HelixCanvas />;
}
