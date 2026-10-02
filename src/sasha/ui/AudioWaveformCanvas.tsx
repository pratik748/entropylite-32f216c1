import React, { useEffect, useRef } from "react";
import type { SashaState } from "../types";

interface AudioWaveformCanvasProps {
  state: SashaState;
  width?: number;
  height?: number;
  className?: string;
}

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  state,
  width = 160,
  height = 36,
  className = ""
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      ctx.clearRect(0, 0, width, height);
      phaseRef.current += 0.08;
      const phase = phaseRef.current;
      const midY = height / 2;

      // Color scheme based on state
      let strokeColor = "rgba(161, 161, 170, 0.4)"; // dormant zinc
      let glowColor = "rgba(161, 161, 170, 0.1)";
      let amplitude = 2;
      let bars = 24;

      if (state === "listening") {
        strokeColor = "rgba(245, 158, 11, 0.9)"; // amber phosphor
        glowColor = "rgba(245, 158, 11, 0.3)";
        amplitude = 10 + Math.sin(phase * 2) * 4;
      } else if (state === "speaking") {
        strokeColor = "rgba(34, 197, 94, 0.95)"; // terminal green
        glowColor = "rgba(34, 197, 94, 0.35)";
        amplitude = 12 + Math.cos(phase * 1.5) * 5;
      } else if (state === "computing") {
        strokeColor = "rgba(59, 130, 246, 0.9)"; // blue pulse
        glowColor = "rgba(59, 130, 246, 0.3)";
        amplitude = 6 + Math.sin(phase * 4) * 3;
      }

      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = glowColor;

      // Draw multi-bar spectrum
      const barWidth = width / bars;
      for (let i = 0; i < bars; i++) {
        const x = i * barWidth + barWidth / 2;
        const distFromCenter = Math.abs(i - bars / 2) / (bars / 2);
        const taper = Math.cos(distFromCenter * Math.PI * 0.5);

        let h = 2;
        if (state === "dormant") {
          h = 2 + Math.sin(phase + i * 0.3) * 1.5;
        } else {
          h = Math.max(3, Math.abs(Math.sin(phase + i * 0.45) * amplitude * taper));
        }

        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.roundRect(x - 1.5, midY - h, 3, h * 2, 2);
        ctx.fill();
      }

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [state, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`block pointer-events-none ${className}`}
    />
  );
};
