import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Reveal, SceneFade, SceneLabel } from "../parts";
import { CLAMP, COLORS, EASE } from "../theme";

type Box = { id: string; label: string; x: number; y: number; w: number };

const GOAL: Box = { id: "goal", label: "目标 · 会议室预约", x: 960, y: 250, w: 520 };
const MODULES: Box[] = [
  { id: "book", label: "预约", x: 520, y: 450, w: 300 },
  { id: "remind", label: "提醒", x: 960, y: 450, w: 300 },
  { id: "admin", label: "管理页", x: 1400, y: 450, w: 300 },
];
// Each task: its module, the frame its worker arrives, and the frame its review passes.
const TASKS: (Box & { parent: string; start: number; reviewed: number })[] = [
  { id: "t1", label: "冲突检查", x: 380, y: 650, w: 260, parent: "book", start: 58, reviewed: 128 },
  { id: "t2", label: "日历视图", x: 660, y: 650, w: 260, parent: "book", start: 68, reviewed: 140 },
  { id: "t3", label: "到点通知", x: 960, y: 650, w: 260, parent: "remind", start: 78, reviewed: 152 },
];
const BOX_H = 96;

const center = (id: string) => {
  const box = [GOAL, ...MODULES, ...TASKS].find((b) => b.id === id);
  if (!box) throw new Error(`no box ${id}`);
  return box;
};

const Edge: React.FC<{ from: string; to: string; at: number }> = ({ from, to, at }) => {
  const frame = useCurrentFrame();
  const a = center(from);
  const b = center(to);
  const x1 = a.x;
  const y1 = a.y + BOX_H / 2;
  const x2 = b.x;
  const y2 = b.y - BOX_H / 2;
  const length = Math.hypot(x2 - x1, y2 - y1);
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={COLORS.line}
      strokeWidth={4}
      strokeDasharray={length}
      strokeDashoffset={interpolate(frame, [at, at + 18], [length, 0], { ...CLAMP, easing: EASE })}
    />
  );
};

const Node: React.FC<{ box: Box; at: number; border?: string; badge?: React.ReactNode }> = ({
  box,
  at,
  border = COLORS.line,
  badge,
}) => (
  <Reveal
    at={at}
    style={{
      position: "absolute",
      left: box.x - box.w / 2,
      top: box.y - BOX_H / 2,
      width: box.w,
      height: BOX_H,
    }}
  >
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: 20,
        background: COLORS.panel,
        border: `3px solid ${border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 40,
        position: "relative",
      }}
    >
      {box.label}
      {badge}
    </div>
  </Reveal>
);

const Badge: React.FC<{ at: number; text: string; color: string }> = ({ at, text, color }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: -26,
        right: -18,
        background: color,
        color: COLORS.bg,
        fontSize: 26,
        fontWeight: 700,
        borderRadius: 14,
        padding: "4px 14px",
        opacity: interpolate(frame, [at, at + 8], [0, 1], CLAMP),
        scale: interpolate(frame, [at, at + 10], [0.6, 1], { ...CLAMP, easing: EASE, output: "perceptual-scale" }),
      }}
    >
      {text}
    </div>
  );
};

const TaskNode: React.FC<{ task: (typeof TASKS)[number] }> = ({ task }) => {
  const frame = useCurrentFrame();
  const done = frame >= task.reviewed;
  const working = frame >= task.start && !done;
  const pulse = working ? 0.5 + 0.5 * Math.sin((frame - task.start) / 4) : 0;
  const border = done ? COLORS.green : working ? `rgba(94, 234, 212, ${0.45 + 0.55 * pulse})` : COLORS.line;
  return (
    <Node
      box={task}
      at={40}
      border={border}
      badge={<Badge at={task.reviewed} text="审查 ✓" color={COLORS.green} />}
    />
  );
};

/** A worker chip that travels from the left edge onto its task. */
const Worker: React.FC<{ task: (typeof TASKS)[number]; name: string }> = ({ task, name }) => {
  const frame = useCurrentFrame();
  const travel = interpolate(frame, [task.start - 16, task.start], [0, 1], { ...CLAMP, easing: EASE });
  const x = interpolate(travel, [0, 1], [-120, task.x - 60]);
  const y = interpolate(travel, [0, 1], [920, task.y + BOX_H / 2 + 14]);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: interpolate(frame, [task.start - 16, task.start - 10, task.reviewed + 6, task.reviewed + 14], [0, 1, 1, 0], CLAMP),
        background: COLORS.teal,
        color: COLORS.bg,
        fontSize: 24,
        fontWeight: 700,
        borderRadius: 12,
        padding: "4px 12px",
      }}
    >
      {name}
    </div>
  );
};

/** The trunk line at the bottom: a commit appears only after its check passes. */
const Trunk: React.FC = () => {
  const frame = useCurrentFrame();
  const commits = [134, 146, 158];
  return (
    <div style={{ position: "absolute", left: 300, right: 300, top: 860, height: 90 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 44, height: 4, background: COLORS.line }} />
      <div style={{ position: "absolute", left: -120, top: 22, fontSize: 34, color: COLORS.dim }}>main</div>
      {commits.map((at, i) => (
        <div
          key={at}
          style={{
            position: "absolute",
            left: 260 + i * 300,
            top: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: interpolate(frame, [at, at + 8], [0, 1], CLAMP),
          }}
        >
          <div style={{ fontSize: 24, color: COLORS.green, marginBottom: 4 }}>合入前的检查 ✓</div>
          <div style={{ width: 26, height: 26, borderRadius: 13, background: COLORS.green }} />
        </div>
      ))}
    </div>
  );
};

export const Drive: React.FC = () => (
  <SceneFade>
    <SceneLabel text="② 放行以后，它自己往下做" />
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {MODULES.map((m, i) => (
          <Edge key={m.id} from="goal" to={m.id} at={16 + i * 4} />
        ))}
        {TASKS.map((t) => (
          <Edge key={t.id} from={t.parent} to={t.id} at={36} />
        ))}
      </svg>
      <Node box={GOAL} at={8} border={COLORS.violet} />
      {MODULES.map((m, i) => (
        <Node
          key={m.id}
          box={m}
          at={20 + i * 4}
          badge={i < 2 ? <Badge at={30 + i * 6} text="已放行" color={COLORS.amber} /> : <Badge at={36} text="设计中" color={COLORS.dim} />}
        />
      ))}
      {TASKS.map((t) => (
        <TaskNode key={t.id} task={t} />
      ))}
      {TASKS.map((t, i) => (
        <Worker key={t.id} task={t} name={`子 Agent ${"ABC"[i]}`} />
      ))}
      <Trunk />
      <Reveal at={170} style={{ position: "absolute", right: 110, top: 90 }}>
        <div style={{ fontSize: 44, color: COLORS.text }}>主干只前进到<span style={{ color: COLORS.green }}>检查过的提交</span></div>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
);
