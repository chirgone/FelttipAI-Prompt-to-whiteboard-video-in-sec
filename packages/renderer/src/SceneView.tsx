import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { TimedScene } from "@chalkline/engine";
import { ElementView } from "./ElementView";

const WIPE_MS = 300;

/**
 * One scene: 300ms wipe-in (except the very first), a gentle camera drift
 * between layout regions as elements reveal, and a slow settle-zoom.
 */
export const SceneView: React.FC<{ scene: TimedScene; isFirst: boolean }> = ({
  scene,
  isFirst,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const msToFrames = (ms: number): number => (ms / 1000) * fps;

  const wipeProgress = isFirst
    ? 1
    : interpolate(frame, [0, msToFrames(WIPE_MS)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // Camera: drift toward each element as it reveals (5% parallax), plus a
  // slow settle-zoom over the whole scene.
  const reveals = scene.elements
    .map((el) => ({
      at: msToFrames(el.revealAtMs),
      x: -(el.position.x - 0.5) * width * 0.05,
      y: -(el.position.y - 0.5) * height * 0.05,
    }))
    .sort((a, b) => a.at - b.at);
  // interpolate() needs strictly increasing input frames.
  for (let i = 1; i < reveals.length; i++) {
    if (reveals[i]!.at <= reveals[i - 1]!.at) reveals[i]!.at = reveals[i - 1]!.at + 1;
  }
  const panEasing = {
    easing: Easing.inOut(Easing.ease),
    extrapolateLeft: "clamp" as const,
    extrapolateRight: "clamp" as const,
  };
  const camX =
    reveals.length > 1
      ? interpolate(frame, reveals.map((r) => r.at), reveals.map((r) => r.x), panEasing)
      : (reveals[0]?.x ?? 0);
  const camY =
    reveals.length > 1
      ? interpolate(frame, reveals.map((r) => r.at), reveals.map((r) => r.y), panEasing)
      : (reveals[0]?.y ?? 0);
  const zoom = interpolate(
    frame,
    [0, msToFrames(scene.durationMs)],
    [1.0, 1.035],
    panEasing,
  );

  return (
    <AbsoluteFill
      style={{
        clipPath: `inset(0 ${(1 - wipeProgress) * 100}% 0 0)`,
      }}
    >
      {scene.audioFile !== undefined && <Audio src={staticFile(scene.audioFile)} />}
      <AbsoluteFill
        style={{ transform: `translate(${camX}px, ${camY}px) scale(${zoom})` }}
      >
        {scene.elements.map((el) => (
          <ElementView key={el.id} element={el} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
