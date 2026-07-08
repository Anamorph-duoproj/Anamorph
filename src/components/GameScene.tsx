import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BASE_PITCH, PLATFORM_SIZE, SNAP_COUNT, type Level } from "../game/types";
import { activeEdgesForCamera } from "../game/anamorph";
import { adjacency, bfsDistances, planWalk } from "../game/pathfinding";

interface Stats {
  moves: number;
  rotations: number;
}

interface Props {
  level: Level;
  onWin: (stats: Stats) => void;
}

const PLATFORM_HEIGHT = 0.45;
const PALETTE = [0xb9aee8, 0xa8d5e5, 0xf8dfa8, 0xd8b4dc, 0xa9dcc3, 0xf0c4ad];
const START_COLOR = 0x7ad3b2;
const GOAL_COLOR = 0xf7998f;

const TAU = Math.PI * 2;
const SNAP_STEP = TAU / SNAP_COUNT;

function easeOutBack(t: number): number {
  const c = 1.70158;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

export default function GameScene({ level, onWin }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onWinRef = useRef(onWin);
  onWinRef.current = onWin;

  const [viewLabel, setViewLabel] = useState("View 1/8");
  const [activeCount, setActiveCount] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const rotateByRef = useRef<(dir: 1 | -1) => void>(() => {});

  useEffect(() => {
    const mount = mountRef.current!;
    const n = level.positions.length;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.className = "touch-none";

    const radius =
      Math.max(2.5, ...level.positions.map((p) => Math.hypot(p.x, p.y, p.z))) + 2.6;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    let zoomPx = 1;
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      const aspect = w / Math.max(1, h);
      camera.left = -radius * aspect;
      camera.right = radius * aspect;
      camera.top = radius;
      camera.bottom = -radius;
      camera.updateProjectionMatrix();
      zoomPx = h / (2 * radius);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xfff2df, 1.1);
    sun.position.set(4, 8, 5);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.45);
    fill.position.set(-5, 3, -4);
    scene.add(fill);

    const platformGeo = new THREE.BoxGeometry(
      PLATFORM_SIZE,
      PLATFORM_HEIGHT,
      PLATFORM_SIZE
    );
    const platforms: THREE.Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const color =
        i === level.start ? START_COLOR : i === level.goal ? GOAL_COLOR : PALETTE[i % PALETTE.length];
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      const mesh = new THREE.Mesh(platformGeo, mat);
      const p = level.positions[i];
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.setScalar(0.001);
      scene.add(mesh);
      platforms.push(mesh);
    }

    const goalPos = level.positions[level.goal];
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(PLATFORM_SIZE * 0.42, 0.045, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0xf76f63, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(goalPos.x, goalPos.y + PLATFORM_HEIGHT / 2 + 0.06, goalPos.z);
    scene.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.36, 16),
      new THREE.MeshStandardMaterial({ color: 0xf76f63, roughness: 0.6 })
    );
    beacon.position.set(goalPos.x, goalPos.y + PLATFORM_HEIGHT / 2 + 0.5, goalPos.z);
    scene.add(beacon);

    const topOf = (i: number) =>
      new THREE.Vector3(
        level.positions[i].x,
        level.positions[i].y + PLATFORM_HEIGHT / 2,
        level.positions[i].z
      );
    const bridges: THREE.Mesh[] = level.edges.map(([a, b]) => {
      const pa = topOf(a);
      const pb = topOf(b);
      const len = pa.distanceTo(pb);
      const geo = new THREE.CylinderGeometry(0.06, 0.06, len, 8);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd76e,
        transparent: true,
        opacity: 0.85,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        pb.clone().sub(pa).normalize()
      );
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    });

    const figure = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.19, 0.4, 16),
      new THREE.MeshStandardMaterial({ color: 0x6f5fc4, roughness: 0.5 })
    );
    body.position.y = 0.2;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x6f5fc4, roughness: 0.5 })
    );
    head.position.y = 0.5;
    figure.add(body, head);
    scene.add(figure);

    const figureBase = (i: number) => topOf(i);
    let currentNode = level.start;
    figure.position.copy(figureBase(currentNode));

    let yaw = 0;
    let pitch = BASE_PITCH;
    let targetYaw = 0;
    let targetPitch = BASE_PITCH;
    let lastSnapIdx = 0;
    const stats: Stats = { moves: 0, rotations: 0 };

    const placeCamera = () => {
      const cp = Math.cos(pitch);
      camera.position.set(
        Math.sin(yaw) * cp * 30,
        Math.sin(pitch) * 30,
        Math.cos(yaw) * cp * 30
      );
      camera.lookAt(0, 0, 0);
    };
    placeCamera();

    const snapIdxOf = (y: number) =>
      ((Math.round(y / SNAP_STEP) % SNAP_COUNT) + SNAP_COUNT) % SNAP_COUNT;

    const registerSnap = () => {
      const idx = snapIdxOf(targetYaw);
      if (idx !== lastSnapIdx) {
        stats.rotations++;
        lastSnapIdx = idx;
      }
    };

    const fullAdj = adjacency(n, level.edges);
    const goalDistances = bfsDistances(fullAdj, level.goal);
    let walkPath: number[] | null = null;
    let walkSeg = 0;
    let walkT = 0;
    let won = false;
    let activeMask: boolean[] = level.edges.map(() => false);

    const tryWalk = () => {
      if (walkPath || won) return;
      const path = planWalk(n, level.edges, activeMask, currentNode, level.goal, goalDistances);
      if (!path || path.length < 2) {
        setHint(
          activeMask.some(Boolean)
            ? "No active path continues from here. Rotate the structure."
            : "No connection is active. Rotate until platforms line up."
        );
        window.setTimeout(() => setHint(null), 2600);
        return;
      }
      walkPath = path;
      walkSeg = 0;
      walkT = 0;
      stats.moves += path.length - 1;
      setWalking(true);
    };

    let pointerDown = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let yaw0 = 0;
    let pitch0 = 0;

    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      if (walkPath) return;
      pointerDown = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      yaw0 = targetYaw;
      pitch0 = targetPitch;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is optional for synthetic events.
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerDown || walkPath) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
      if (moved) {
        targetYaw = yaw0 + dx * 0.009;
        targetPitch = Math.min(1.25, Math.max(0.12, pitch0 + dy * 0.006));
      }
    };
    const onUp = () => {
      if (!pointerDown) return;
      pointerDown = false;
      if (walkPath) return;
      if (!moved) {
        tryWalk();
      } else {
        targetYaw = Math.round(targetYaw / SNAP_STEP) * SNAP_STEP;
        targetPitch = BASE_PITCH;
        registerSnap();
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    rotateByRef.current = (dir) => {
      if (walkPath || won) return;
      targetYaw = (Math.round(targetYaw / SNAP_STEP) + dir) * SNAP_STEP;
      targetPitch = BASE_PITCH;
      registerSnap();
    };

    if (import.meta.env.DEV) {
      (window as any).__anamorph = {
        rotate: (d: 1 | -1) => rotateByRef.current(d),
        walk: () => tryWalk(),
        state: () => ({
          yaw,
          targetYaw,
          pitch,
          walking: !!walkPath,
          active: activeMask,
          currentNode,
          goal: level.goal,
        }),
      };
    }

    let raf = 0;
    let timer = 0;
    const schedule = () => {
      if (document.hidden) timer = window.setTimeout(() => tick(performance.now()), 33);
      else raf = requestAnimationFrame(tick);
    };
    let prev = performance.now();
    const startTime = prev;
    let lastLabel = "";
    let lastActive = -1;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const elapsed = (now - startTime) / 1000;

      platforms.forEach((m, i) => {
        const t = Math.min(1, Math.max(0, (elapsed - i * 0.07) / 0.45));
        if (t < 1) m.scale.setScalar(Math.max(0.001, easeOutBack(t)));
        else m.scale.setScalar(1);
      });

      const k = 1 - Math.exp(-dt * 9);
      yaw += (targetYaw - yaw) * k;
      pitch += (targetPitch - pitch) * k;
      placeCamera();

      camera.updateMatrixWorld();
      activeMask = activeEdgesForCamera(
        level,
        camera,
        zoomPx,
        mount.clientWidth,
        mount.clientHeight
      );
      const pulse = 0.6 + 0.35 * Math.sin(elapsed * 5);
      bridges.forEach((b, i) => {
        b.visible = activeMask[i];
        (b.material as THREE.MeshBasicMaterial).opacity = pulse;
      });

      const rs = 1 + 0.12 * Math.sin(elapsed * 3);
      ring.scale.setScalar(rs);
      beacon.rotation.y = elapsed * 1.5;

      const atSnap =
        Math.abs(yaw - Math.round(yaw / SNAP_STEP) * SNAP_STEP) < 0.02 &&
        Math.abs(pitch - BASE_PITCH) < 0.02;
      const label = atSnap ? `View ${snapIdxOf(yaw) + 1}/${SNAP_COUNT}` : "free rotation...";
      if (label !== lastLabel) {
        lastLabel = label;
        setViewLabel(label);
      }
      const ac = activeMask.filter(Boolean).length;
      if (ac !== lastActive) {
        lastActive = ac;
        setActiveCount(ac);
      }

      if (walkPath) {
        const a = figureBase(walkPath[walkSeg]);
        const b = figureBase(walkPath[walkSeg + 1]);
        const segLen = a.distanceTo(b);
        walkT += (dt * 2.6) / Math.max(0.6, segLen);
        const t = Math.min(1, walkT);
        figure.position.lerpVectors(a, b, t);
        figure.position.y += Math.sin(t * Math.PI) * 0.28;
        const dir = b.clone().sub(a);
        if (dir.lengthSq() > 1e-6) figure.rotation.y = Math.atan2(dir.x, dir.z);
        if (t >= 1) {
          walkSeg++;
          walkT = 0;
          currentNode = walkPath[walkSeg];
          if (walkSeg >= walkPath.length - 1) {
            walkPath = null;
            setWalking(false);
            if (currentNode === level.goal && !won) {
              won = true;
              window.setTimeout(() => onWinRef.current({ ...stats }), 450);
            }
          }
        }
      } else {
        figure.position.copy(figureBase(currentNode));
        figure.scale.y = 1 + 0.03 * Math.sin(elapsed * 2.2);
      }

      renderer.render(scene, camera);
      schedule();
    };
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose()
          );
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [level]);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="scene-bg h-full w-full overflow-hidden" />

      <div className="pointer-events-none absolute inset-x-0 top-3 flex items-start justify-center gap-2 px-3">
        <div className="animate-fade-up flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-sm font-medium shadow-sm backdrop-blur">
          <span>{viewLabel}</span>
          <span className="opacity-40">/</span>
          <span className={activeCount > 0 ? "text-emerald-600" : "opacity-60"}>
            {activeCount === 0
              ? "no active path"
              : activeCount === 1
                ? "1 active path"
                : `${activeCount} active paths`}
          </span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-3 px-4">
        {hint && (
          <div className="animate-pop-in max-w-sm rounded-xl bg-white/85 px-4 py-2 text-center text-sm shadow backdrop-blur">
            {hint}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={() => rotateByRef.current(-1)}
            disabled={walking}
            className="h-12 w-16 rounded-full bg-white/80 text-sm font-medium shadow backdrop-blur transition hover:bg-white disabled:opacity-40"
            aria-label="Rotate left"
          >
            Left
          </button>
          <span className="rounded-full bg-white/60 px-4 py-1.5 text-xs backdrop-blur sm:text-sm">
            {walking ? "Figure walking..." : "Drag to rotate / Tap to move"}
          </span>
          <button
            onClick={() => rotateByRef.current(1)}
            disabled={walking}
            className="h-12 w-16 rounded-full bg-white/80 text-sm font-medium shadow backdrop-blur transition hover:bg-white disabled:opacity-40"
            aria-label="Rotate right"
          >
            Right
          </button>
        </div>
      </div>
    </div>
  );
}
