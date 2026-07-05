import { loadFont } from "@remotion/google-fonts/Caveat";
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const { fontFamily } = loadFont();

/** Handwriting text revealed with a left-to-right clip-path wipe. */
export const HandText: React.FC<{
  text: string;
  fontSizePx: number;
  startFrame: number;
  drawDurationMs: number;
  color: string;
  bold?: boolean;
}> = ({ text, fontSizePx, startFrame, drawDurationMs, color, bold }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durFrames = Math.max(1, (drawDurationMs / 1000) * fps);
  const progress = interpolate(frame, [startFrame, startFrame + durFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (progress <= 0.001) return null;
  return (
    <div
      style={{
        fontFamily,
        fontSize: fontSizePx,
        fontWeight: bold ? 700 : 500,
        color,
        whiteSpace: "nowrap",
        lineHeight: 1.1,
        clipPath: `inset(-20% ${(1 - progress) * 100}% -20% -5%)`,
      }}
    >
      {text}
    </div>
  );
};

export const HANDWRITING_FONT = fontFamily;
