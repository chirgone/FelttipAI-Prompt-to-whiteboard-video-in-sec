import React from "react";
import { useVideoConfig } from "remotion";
import type { TimedElement } from "@chalkline/engine";
import { HandText } from "./HandText";
import { StrokeDraw } from "./StrokeDraw";
import { THEME } from "./theme";

const msToFrames = (ms: number, fps: number): number => (ms / 1000) * fps;

/** Rough width estimate for Caveat text, used to size emphasis overlays. */
const estimateTextWidth = (text: string, fontSize: number): number =>
  text.length * fontSize * 0.42;

export const ElementView: React.FC<{ element: TimedElement }> = ({ element }) => {
  const { fps, width, height } = useVideoConfig();
  const strokeWidthPx = height * THEME.strokeWidthFactor;
  const boxH = element.size * height;
  const isText = element.kind === "text" || element.kind === "number";
  const fontSize = boxH;
  const boxW = isText
    ? estimateTextWidth(element.text ?? "", fontSize)
    : boxH;
  const left = element.position.x * width - boxW / 2;
  const top = element.position.y * height - boxH / 2;
  const startFrame = msToFrames(element.revealAtMs, fps);

  return (
    <>
      <div style={{ position: "absolute", left, top, width: boxW, height: boxH }}>
        {element.paths.length > 0 && (
          <StrokeDraw
            paths={element.paths}
            pathLengths={element.pathLengths}
            startFrame={startFrame}
            drawDurationMs={element.drawDurationMs}
            color={THEME.ink}
            strokeWidthPx={strokeWidthPx}
          />
        )}
        {isText && element.text !== undefined && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HandText
              text={element.text}
              fontSizePx={fontSize}
              startFrame={startFrame}
              drawDurationMs={element.drawDurationMs}
              color={THEME.ink}
              bold={element.kind === "number"}
            />
          </div>
        )}
        {element.fallbackLabel !== undefined && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HandText
              text={element.fallbackLabel}
              fontSizePx={boxH * 0.22}
              startFrame={startFrame + msToFrames(element.drawDurationMs, fps) * 0.5}
              drawDurationMs={element.drawDurationMs}
              color={THEME.ink}
            />
          </div>
        )}
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
