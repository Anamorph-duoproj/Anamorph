import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_NODES, type Sketch, type SketchNode } from "../game/types";

type Tool = "draw" | "start" | "goal" | "erase";

interface Props {
  sketch: Sketch;
  onChange: (s: Sketch) => void;
  onNotice: (msg: string) => void;
}

const HIT_RADIUS = 22;
const NODE_RADIUS = 15;

function jitter(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export default function SketchCanvas({ sketch, onChange, onNotice }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("draw");
  const [drag, setDrag] = useState<{ from: number; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const wrap = wrapRef.current!;
    const measure = () => setSize({ w: wrap.clientWidth, h: wrap.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const toPx = useCallback(
    (n: { x: number; y: number }) => ({ x: n.x * size.w, y: n.y * size.h }),
    [size]
  );

  const nodeAt = useCallback(
    (px: number, py: number): SketchNode | null => {
      for (const n of sketch.nodes) {
        const p = toPx(n);
        if (Math.hypot(p.x - px, p.y - py) <= HIT_RADIUS) return n;
      }
      return null;
    },
    [sketch.nodes, toPx]
  );

  const edgeAt = useCallback(
    (px: number, py: number): number => {
      const byId = new Map(sketch.nodes.map((n) => [n.id, toPx(n)]));
      for (let i = 0; i < sketch.edges.length; i++) {
        const [a, b] = sketch.edges[i];
        const pa = byId.get(a)!;
        const pb = byId.get(b)!;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((px - pa.x) * dx + (py - pa.y) * dy) / len2));
        const d = Math.hypot(pa.x + t * dx - px, pa.y + t * dy - py);
        if (d < 12) return i;
      }
      return -1;
    },
    [sketch, toPx]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);

    const byId = new Map(sketch.nodes.map((n) => [n.id, toPx(n)]));

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#6b6480";
    ctx.lineCap = "round";
    for (const [a, b] of sketch.edges) {
      const pa = byId.get(a)!;
      const pb = byId.get(b)!;
      const mx = (pa.x + pb.x) / 2 + jitter(a + b, 1) * 6;
      const my = (pa.y + pb.y) / 2 + jitter(a + b, 2) * 6;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(mx, my, pb.x, pb.y);
      ctx.stroke();
    }

    if (drag) {
      const from = sketch.nodes.find((n) => n.id === drag.from);
      if (from) {
        const pf = toPx(from);
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "#b9aee8";
        ctx.beginPath();
        ctx.moveTo(pf.x, pf.y);
        ctx.lineTo(drag.x, drag.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const n of sketch.nodes) {
      const p = toPx(n);
      const isStart = sketch.start === n.id;
      const isGoal = sketch.goal === n.id;
      ctx.beginPath();
      ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isStart ? "#7ad3b2" : isGoal ? "#f7998f" : "#fffdf8";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#4a4458";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(
        p.x + jitter(n.id, 3) * 1.5,
        p.y + jitter(n.id, 4) * 1.5,
        NODE_RADIUS + 1.5,
        0.2,
        Math.PI * 2 - 0.3
      );
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgba(74,68,88,0.35)";
      ctx.stroke();

      if (isStart || isGoal) {
        ctx.fillStyle = "#3d3750";
        ctx.font = "bold 13px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isStart ? "S" : "G", p.x, p.y + 0.5);
      }
      if (isGoal) {
        ctx.beginPath();
        ctx.moveTo(p.x + 8, p.y - NODE_RADIUS - 2);
        ctx.lineTo(p.x + 8, p.y - NODE_RADIUS - 16);
        ctx.strokeStyle = "#4a4458";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x + 8, p.y - NODE_RADIUS - 16);
        ctx.lineTo(p.x + 20, p.y - NODE_RADIUS - 12);
        ctx.lineTo(p.x + 8, p.y - NODE_RADIUS - 8);
        ctx.closePath();
        ctx.fillStyle = "#f7998f";
        ctx.fill();
      }
    }
  }, [sketch, drag, size, toPx]);

  const pointerPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      canvasRef.current!.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is optional for synthetic events.
    }
    const { x, y } = pointerPos(e);
    const hit = nodeAt(x, y);

    if (tool === "draw") {
      if (hit) {
        setDrag({ from: hit.id, x, y });
      } else {
        if (size.w === 0 || size.h === 0) return;
        if (sketch.nodes.length >= MAX_NODES) {
          onNotice(`Maximum ${MAX_NODES} platforms. Erase something first.`);
          return;
        }
        const id = sketch.nodes.reduce((m, n) => Math.max(m, n.id), -1) + 1;
        const node = { id, x: x / size.w, y: y / size.h };
        onChange({ ...sketch, nodes: [...sketch.nodes, node] });
        setDrag({ from: id, x, y });
      }
    } else if (tool === "start" && hit) {
      onChange({
        ...sketch,
        start: hit.id,
        goal: sketch.goal === hit.id ? null : sketch.goal,
      });
    } else if (tool === "goal" && hit) {
      onChange({
        ...sketch,
        goal: hit.id,
        start: sketch.start === hit.id ? null : sketch.start,
      });
    } else if (tool === "erase") {
      if (hit) {
        onChange({
          nodes: sketch.nodes.filter((n) => n.id !== hit.id),
          edges: sketch.edges.filter(([a, b]) => a !== hit.id && b !== hit.id),
          start: sketch.start === hit.id ? null : sketch.start,
          goal: sketch.goal === hit.id ? null : sketch.goal,
        });
      } else {
        const ei = edgeAt(x, y);
        if (ei >= 0) {
          onChange({ ...sketch, edges: sketch.edges.filter((_, i) => i !== ei) });
        }
      }
    }
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = pointerPos(e);
    setDrag({ ...drag, x, y });
  };

  const handleUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = pointerPos(e);
    const hit = nodeAt(x, y);
    if (hit && hit.id !== drag.from) {
      const key = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
      const exists = sketch.edges.some(([a, b]) => key(a, b) === key(drag.from, hit.id));
      if (!exists) {
        onChange({ ...sketch, edges: [...sketch.edges, [drag.from, hit.id]] });
      }
    }
    setDrag(null);
  };

  const tools: { id: Tool; label: string }[] = [
    { id: "draw", label: "Draw" },
    { id: "start", label: "Start" },
    { id: "goal", label: "Goal" },
    { id: "erase", label: "Erase" },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
              tool === t.id
                ? "bg-ink text-paper shadow-md"
                : "bg-white/70 text-ink hover:bg-white"
            }`}
            style={tool === t.id ? { backgroundColor: "#4a4458", color: "#faf6ee" } : {}}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-ink-soft" style={{ color: "#8b84a0" }}>
            {sketch.nodes.length}/{MAX_NODES} platforms
          </span>
          <button
            onClick={() => onChange({ nodes: [], edges: [], start: null, goal: null })}
            className="rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-ink transition-all hover:bg-white"
          >
            Clear all
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="paper relative min-h-0 flex-1 rounded-2xl">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none rounded-2xl"
          style={{ cursor: tool === "erase" ? "not-allowed" : "crosshair" }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={() => setDrag(null)}
        />
        {sketch.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="max-w-xs text-center text-sm" style={{ color: "#8b84a0" }}>
              Tap to place platforms.
              <br />
              Drag from point to point to create paths.
              <br />
              Then mark the start and the goal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
