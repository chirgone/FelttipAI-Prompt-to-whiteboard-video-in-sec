import React from "react";
import { useVideoConfig } from "remotion";
import type { TimedElement } from "@chalkline/engine";
import { StrokeDraw } from "./StrokeDraw";
import { THEME } from "./theme";

const msToFrames = (ms: number, fps: number): number => (ms / 1000) * fps;

/**
 * Every element — icons, text, numbers, arrows, boxes — is pen strokes drawn
 * by StrokeDraw. `size` is the element's height; width follows the element's
 * local viewBox (square for icons, text width for writing).
 */
export const ElementView: React.FC<{ element: TimedElement }> = ({ element }) => {
  const { fps, width, height } = useVideoConfig();
  const strokeWidthPx = height * THEME.strokeWidthFactor;
  const boxH = element.size * height;
  const viewBoxWidth = element.viewBoxWidth ?? 100;
  const boxW = boxH * (viewBoxWidth / 100);
  const left = element.position.x * width - boxW / 2;
  const top = element.position.y * height - boxH / 2;
  const startFrame = msToFrames(element.revealAtMs, fps);
  const isWriting = element.kind === "text" || element.kind === "number";

  return (
    <>
      <div style={{ position: "absolute", left, top, width: boxW, height: boxH }}>
        <StrokeDraw
          paths={element.paths}
          pathLengths={element.pathLengths}
          startFrame={startFrame}
          drawDurationMs={element.drawDurationMs}
          color={THEME.ink}
          strokeWidthPx={isWriting ? strokeWidthPx * 0.85 : strokeWidthPx}
          viewBoxWidth={viewBoxWidth}
        />
      </div>
      {element.emphasis && (
        <div
          style={{
            position: "absolute",
            left: element.position.x * width - (boxW * 1.45) / 2,
            top: element.position.y * height - (boxH * 1.45) / 2,
            width: boxW * 1.45,
            height: boxH * 1.45,
          }}
        >
          <StrokeDraw
            paths={element.emphasis.paths}
            pathLengths={element.emphasis.pathLengths}
            startFrame={msToFrames(element.emphasis.startMs, fps)}
            drawDurationMs={element.emphasis.drawDurationMs}
            color={THEME.accent}
            strokeWidthPx={strokeWidthPx}
          />
        </div>
      )}
    </>
  );
};
