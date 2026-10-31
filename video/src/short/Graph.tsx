import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { GLASS, Pill } from "../parts";
import { CLAMP, COLORS, EASE } from "../theme";
import { T } from "./timeline";

// Layout for 1080x1920. Everything is driven by `t`, a frame of the whole
// video. Nothing goes right of x = 945: the short-video apps put their
// buttons in that column.

type Box = { label: string; x: number; y: number; w: number; h: number };

const GOAL: Box = { label: "目标 · 会议室预约", x: 495, y: 690, w: 660, h: 120 };
const MODULES: Box[] = [
  { label: "预约", x: 175, y: 900, w: 260, h: 110 },
  { label: "提醒", x: 495, y: 900, w: 260, h: 110 },
  { label: "管理页", x: 815, y: 900, w: 260, h: 110 },
];
const TASKS: (Box & { parent: number; above?: number })[] = [
  { label: "冲突检查", x: 175, y: 1100, w: 260, h: 104, parent: 0 },
  { label: "日历视图", x: 175, y: 1265, w: 260, h: 104, parent: 0, above: 0 },
  { label: "到点通知", x: 495, y: 1100, w: 260, h: 104, parent: 1 },
];
const TRUNK_Y = 1470;
const COMMIT_X = [300, 495, 690];

const appear = (t: number, at: number, span = 10) =>
  interpolate(t, [at, at + span], [0, 1], { ...CLAMP, easing: EASE });

const Edge: React.FC<{ t: number; from: Box; to: Box; at: number }> = ({ t, from, to, at }) => {
  const y1 = from.y + from.h / 2;
  const y2 = to.y - to.h / 2;
  const mid = (y1 + y2) / 2;
  return (
    <path
      d={`M ${from.x} ${y1} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${y2}`}
      fill="none"
      stroke="url(#edge)"
      strokeWidth={3}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - appear(t, at, 16)}
    />
  );
};

const Card: React.FC<{
  t: number;
  box: Box;
  at: number;
  border?: string;
  glow?: string;
  progress?: number;
  children?: React.ReactNode;
}> = ({ t, box, at, border, glow, progress, children }) => {
  const shown = appear(t, at);
  return (
    <div
      style={{
        position: "absolute",
        left: box.x - box.w / 2,
        top: box.y - box.h / 2,
        width: box.w,
        height: box.h,
        opacity: shown,
        translate: `0px ${interpolate(shown, [0, 1], [20, 0])}px`,
      }}
    >
      <div
        style={{
          ...GLASS,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          borderRadius: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 44,
          position: "relative",
          overflow: "visible",
          ...(border ? { border: `2px solid ${border}` } : {}),
          ...(glow ? { boxShadow: `0 0 48px ${glow}, 0 24px 70px rgba(0,0,0,0.45)` } : {}),
        }}
      >
        {box.label}
        {progress !== undefined ? (
          <div
            style={{
              position: "absolute",
              left: 24,
              right: 24,
              bottom: 14,
              height: 5,
              borderRadius: 3,
              background: "rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                borderRadius: 3,
                background: `linear-gradient(90deg, ${COLORS.cyan}, ${COLORS.mint})`,
              }}
            />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};

/** A label pinned to the top-right corner of a card, popping in at `at`. */
const Badge: React.FC<{ t: number; at: number; color: string; until?: number; children: React.ReactNode }> = ({
  t,
  at,
  color,
  until,
  children,
}) => {
  const shown = appear(t, at, 8) * (until === undefined ? 1 : 1 - appear(t, until, 8));
  return (
    <div
      style={{
        position: "absolute",
        top: -24,
        right: 14,
        opacity: shown,
        scale: interpolate(shown, [0, 1], [0.7, 1], { output: "perceptual-scale" }),
      }}
    >
      <Pill color={color} style={{ background: "rgba(10, 12, 22, 0.94)", fontSize: 28 }}>
        {children}
      </Pill>
    </div>
  );
};

/** A chip that travels from (x0, y0) to (x1, y1) between `from` and `to`, and fades out after `leave`. */
const Chip: React.FC<{
  t: number;
  from: number;
  to: number;
  leave: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  children: React.ReactNode;
}> = ({ t, from, to, leave, x0, y0, x1, y1, color, children }) => {
  const k = interpolate(t, [from, to], [0, 1], { ...CLAMP, easing: EASE });
  const visible = interpolate(t, [from - 4, from + 2, leave, leave + 8], [0, 1, 1, 0], CLAMP);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        translate: `${x0 + (x1 - x0) * k}px ${y0 + (y1 - y0) * k}px`,
        opacity: visible,
      }}
    >
      <Pill color={color} style={{ background: "rgba(10, 12, 22, 0.94)", fontSize: 28 }}>
        {children}
      </Pill>
    </div>
  );
};

const Trunk: React.FC<{ t: number }> = ({ t }) => {
  const shown = appear(t, T.tasks[0], 12);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, opacity: shown }}>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 140,
          top: TRUNK_Y,
          height: 3,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.2) 12%, rgba(255,255,255,0.2) 88%, rgba(255,255,255,0))",
        }}
      />
      <div style={{ position: "absolute", left: 80, top: TRUNK_Y + 22, fontSize: 32, color: COLORS.faint, letterSpacing: 2 }}>
        main
      </div>
      {COMMIT_X.map((x, i) => {
        const at = T.commits[i];
        const k = appear(t, at, 12);
        return (
          <div
            key={x}
            style={{
              position: "absolute",
              left: x - 80,
              top: TRUNK_Y - 64,
              width: 160,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              opacity: k,
              translate: `0px ${interpolate(k, [0, 1], [-40, 0])}px`,
            }}
          >
            <div style={{ fontSize: 28, color: COLORS.mint, marginBottom: 8, whiteSpace: "nowrap" }}>检查 ✓</div>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                background: COLORS.bg,
                border: `4px solid ${COLORS.mint}`,
                boxShadow: "0 0 22px rgba(134, 227, 192, 0.7)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

export const GraphStage: React.FC<{ t: number }> = ({ t }) => {
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(142,162,255,0.6)" />
            <stop offset="100%" stopColor="rgba(195,166,255,0.3)" />
          </linearGradient>
        </defs>
        {MODULES.map((m, i) => (
          <Edge key={m.label} t={t} from={GOAL} to={m} at={T.modules[i] - 6} />
        ))}
        {TASKS.map((task, i) => (
          <Edge
            key={task.label}
            t={t}
            from={task.above === undefined ? MODULES[task.parent] : TASKS[task.above]}
            to={task}
            at={T.tasks[i] - 6}
          />
        ))}
      </svg>
      <Card t={t} box={GOAL} at={T.goal} border="rgba(195, 166, 255, 0.55)" glow="rgba(142, 162, 255, 0.25)" />
      {MODULES.map((m, i) => (
        <Card key={m.label} t={t} box={m} at={T.modules[i]}>
          {i < 2 ? (
            <Badge t={t} at={T.released[i]} color={COLORS.apricot}>
              已放行
            </Badge>
          ) : (
            <Badge t={t} at={T.designing} color={COLORS.dim}>
              设计中
            </Badge>
          )}
        </Card>
      ))}
      {TASKS.map((task, i) => {
        const done = t >= T.reviewed[i];
        const working = t >= T.arrive[i] && !done;
        const pulse = working ? 0.5 + 0.5 * Math.sin((t - T.arrive[i]) / 4) : 0;
        const progress = interpolate(t, [T.arrive[i], T.reviewed[i] - 4], [0, 1], CLAMP);
        return (
          <Card
            key={task.label}
            t={t}
            box={task}
            at={T.tasks[i]}
            border={done ? "rgba(134, 227, 192, 0.8)" : working ? `rgba(125, 216, 240, ${0.45 + 0.5 * pulse})` : undefined}
            glow={done ? "rgba(134, 227, 192, 0.3)" : working ? `rgba(125, 216, 240, ${0.14 + 0.24 * pulse})` : undefined}
            progress={t >= T.arrive[i] ? progress : undefined}
          >
            <Badge t={t} at={T.reviewed[i]} color={COLORS.mint}>
              审查 ✓
            </Badge>
          </Card>
        );
      })}
      {TASKS.map((task, i) => (
        <Chip
          key={task.label}
          t={t}
          from={T.arrive[i] - 16}
          to={T.arrive[i]}
          leave={T.reviewed[i] + 8}
          x0={-220}
          y0={1700}
          x1={task.x - 100}
          y1={task.y + task.h / 2 + 10}
          color={COLORS.cyan}
        >
          ● 子 Agent {"ABC"[i]}
        </Chip>
      ))}
      <Trunk t={t} />
      {/* A commit that skipped the check is turned back from the trunk. */}
      <Chip
        t={t}
        from={T.rogue}
        to={T.rogue + 14}
        leave={T.rogueRefused + 22}
        x0={1100}
        y0={TRUNK_Y - 130}
        x1={300}
        y1={TRUNK_Y - 130}
        color={COLORS.rose}
      >
        {t >= T.rogueRefused ? "✗ 没跑检查，进不了主干" : "● 没跑检查的提交"}
      </Chip>
    </AbsoluteFill>
  );
};
