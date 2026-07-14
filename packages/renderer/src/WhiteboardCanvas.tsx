import React, { useEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { TimedScene } from "@chalkline/engine";
import { drawSceneFrame, type Path2DLike } from "./draw";

/** Path2D per `d` is stable across frames — build once. */
const path2dCache = new Map<string, Path2D>();
const pathFor = (d: string): Path2DLike => {
  let p = path2dCache.get(d);
  if (!p) {
    p = new Path2D(d);
    path2dCache.set(d, p);
  }
  return p;
};

/**
 * One scene on a single full-frame canvas. All drawing math lives in draw.ts,
 * shared verbatim with the fast Node renderer — this wrapper only owns the
 * <canvas> element and clears it each frame.
 */
export const WhiteboardCanvas: React.FC<{ scene: TimedScene; isFirst: boolean }> = ({
  scene,
  isFirst,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    drawSceneFrame({ ctx, scene, frame, fps, width, height, isFirst, pathFor });
  }, [frame, scene, fps, width, height, isFirst]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
};
