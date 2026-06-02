"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";

import { OrbitControls, Center, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";

import { AppShell } from "./shell";

type ReviewViewerSurfaceProps = {
  modelLabel?: string;
  modelUrl?: string;
  reviewStatus?: string;
  sourceLabel?: string;
  formatLabel?: string;
  technicalNotes?: string;
  allowPreviewFallback?: boolean;
  surface?: "page" | "modal";
};

function disposeMaterial(material: { dispose: () => void } | Array<{ dispose: () => void }>) {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }
  material.dispose();
}

function disposeObject(root: {
  traverse: (visitor: (node: { geometry?: { dispose?: () => void }; material?: unknown }) => void) => void;
}) {
  root.traverse((node) => {
    node.geometry?.dispose?.();
    if (node.material) {
      disposeMaterial(node.material as { dispose: () => void } | Array<{ dispose: () => void }>);
    }
  });
}

function ViewerCleanup({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    return () => {
      controlsRef.current?.dispose();
      scene.clear();
      gl.dispose();
      if ("forceContextLoss" in gl) {
        gl.forceContextLoss();
      }
    };
  }, [controlsRef, gl, scene]);

  return null;
}

function ProceduralPreview() {
  return (
    <mesh rotation={[0.4, 0.6, 0.2]}>
      <boxGeometry args={[1.4, 1.8, 1.2]} />
      <meshStandardMaterial color="#00d1ff" metalness={0.45} roughness={0.35} />
    </mesh>
  );
}

function LoadedModel({ modelUrl }: { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl) as { scene: { clone: (recursive?: boolean) => { traverse: (visitor: (node: { geometry?: { dispose?: () => void }; material?: unknown }) => void) => void } } };
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    return () => {
      disposeObject(clonedScene);
    };
  }, [clonedScene]);

  return (
    <Center>
      <primitive object={clonedScene} />
    </Center>
  );
}

function ModelPreview({ allowPreviewFallback, modelUrl }: { allowPreviewFallback: boolean; modelUrl?: string }) {
  if (!modelUrl) {
    return allowPreviewFallback ? <ProceduralPreview /> : null;
  }
  return <LoadedModel modelUrl={modelUrl} />;
}

export function ReviewViewerSurface({
  modelLabel = "Procedural Preview",
  modelUrl,
  reviewStatus = "Pending",
  sourceLabel = "ForgeFlow Artifact",
  formatLabel = "GLB",
  technicalNotes = "Orbit, pan, and zoom are available in the viewer.",
  allowPreviewFallback = true,
  surface = "page",
}: ReviewViewerSurfaceProps) {
  const controlsRef = useRef<any>(null);
  const isModal = surface === "modal";

  return (
    <main
      className={[
        "flex flex-col gap-4 xl:flex-row",
        isModal ? "h-full min-h-0" : "flex-1",
      ].join(" ")}
      data-testid="review-viewer-surface"
    >
      <section
        className={[
          "relative flex-1 bg-[#0e0f10] shadow-[0_24px_80px_rgba(0,0,0,0.34)]",
          isModal ? "min-h-0 rounded-none" : "min-h-[55vh] rounded-2xl",
        ].join(" ")}
        data-testid="review-viewer-canvas-shell"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,209,255,0.12),transparent_42%)]" />
        <div className={["absolute overflow-hidden bg-[#111315]", isModal ? "inset-0" : "inset-3 rounded-xl sm:inset-5"].join(" ")}>
          <Canvas camera={{ position: [3, 2, 4], fov: 45 }}>
            <ViewerCleanup controlsRef={controlsRef} />
            <ambientLight intensity={0.8} />
            <directionalLight intensity={1.5} position={[4, 5, 3]} />
            <Suspense fallback={null}>
              <ModelPreview allowPreviewFallback={allowPreviewFallback} modelUrl={modelUrl} />
            </Suspense>
            <gridHelper args={[12, 12, "#154d5d", "#353534"]} />
            <OrbitControls enablePan enableRotate enableZoom ref={controlsRef} />
          </Canvas>
        </div>
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-[#171a1c]/86 px-4 py-2 text-[11px] tracking-[0.1em] text-[#a4e6ff] backdrop-blur">
          Orbit, pan, and zoom available
        </div>
      </section>
      <aside className={["w-full bg-[#181a1b] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] xl:w-[320px]", isModal ? "hidden xl:block" : "rounded-2xl xl:p-6"].join(" ")}>
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#859399]">Asset Inspection</div>
        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-[#232526] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[#859399]">Metadata</div>
            <div className="mt-3 space-y-2 text-sm">
              <div>Asset: {modelLabel}</div>
              <div>Format: {formatLabel}</div>
              <div>Status: {reviewStatus}</div>
              <div>Source: {sourceLabel}</div>
            </div>
          </div>
          <div className="rounded-xl bg-[#232526] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[#859399]">Viewer Notes</div>
            <div className="mt-3 rounded-lg bg-[#101112] p-4 text-sm text-[#859399]">{technicalNotes}</div>
          </div>
        </div>
      </aside>
    </main>
  );
}

export function ReviewViewer3D({
  modelLabel = "Procedural Preview",
  modelUrl,
  reviewStatus,
  sourceLabel,
  formatLabel,
  technicalNotes,
  allowPreviewFallback,
  surface,
}: ReviewViewerSurfaceProps) {
  return (
    <AppShell activeNav="3D Review" title="ForgeFlow" subtitle="3D Review Viewer" statusPill="Viewer Ready">
      <ReviewViewerSurface
        allowPreviewFallback={allowPreviewFallback}
        formatLabel={formatLabel}
        modelLabel={modelLabel}
        modelUrl={modelUrl}
        reviewStatus={reviewStatus}
        sourceLabel={sourceLabel}
        surface={surface}
        technicalNotes={technicalNotes}
      />
    </AppShell>
  );
}
