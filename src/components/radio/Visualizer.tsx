import { useEffect, useRef } from "react";

export function Visualizer({
  analyser,
  active,
  className,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const bars = 16;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let t = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (analyser && data) analyser.getByteFrequencyData(data);

      const barW = w / bars;
      for (let i = 0; i < bars; i++) {
        let v: number;
        if (active && data) {
          v = data[Math.floor((i / bars) * data.length)] / 255;
        } else if (active) {
          v = 0.3 + 0.25 * Math.sin(t / 8 + i * 0.7);
        } else {
          v = 0.08;
        }
        const bh = Math.max(2 * dpr, v * h * 0.95);
        const x = i * barW + barW * 0.2;
        const y = (h - bh) / 2;
        ctx.fillStyle = `hsl(var(--primary-h, 220) 70% ${50 + v * 20}% / ${0.5 + v * 0.5})`;
        // Fallback to currentColor via CSS var on canvas not supported; use accent.
        ctx.fillStyle = active
          ? `rgba(212,175,55,${0.4 + v * 0.6})`
          : "rgba(150,150,150,0.25)";
        const r = Math.min(barW * 0.3, 4 * dpr);
        roundRect(ctx, x, y, barW * 0.6, bh, r);
        ctx.fill();
      }
      t += 1;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [analyser, active]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
