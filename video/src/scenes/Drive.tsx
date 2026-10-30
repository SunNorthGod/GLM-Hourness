import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GLASS, GradientText, Pill, Reveal, SceneFade, SceneLabel } from "../parts";
import { CLAMP, COLORS, EASE, PASSED } from "../theme";

type Box = { id: string; label: string; x: number; y: number; w: number };

const GOAL: Box = { id: "goal", label: "目标 · 会议室预约", x: 960, y: 260, w: 520 };
const MODULES: Box[] = [
  { id: "book", label: "预约", x: 520, y: 460, w: 300 },
  { id: "remind", label: "提醒", x: 960, y: 460, w: 300 },
  { id: "admin", label: "管理页", x: 1400, y: 460, w: 300 },
];
// Each task: its module, the frame its worker arrives and the frame its review passes, on the beat.
const TASKS: (Box & { parent: string; start: number; reviewed: number })[] = [
  { id: "t1", label: "冲突检查", x: 375, y: 660, w: 260, parent: "book", start: 60, reviewed: 135 },
  { id: "t2", label: "日历视图", x: 665, y: 660, w: 260, parent: "book", start: 75, reviewed: 150 },
  { id: "t3", label: "到点通知", x: 960, y: 660, w: 260, parent: "remind", start: 90, reviewed: 165 },
];
const BOX_H = 96;
const COMMIT_DELAY = 6;

const boxOf = (id: string) => {
  const box = [GOAL, ...MODULES, ...TASKS].find((b) => b.id === id);
  if (!box) throw new Error(`no box ${id}`);
  return box;
};

/** A smooth curve from the bottom of one box to the top of another, drawn in over 18 frames. */
const Edge: React.FC<{ from: string; to: string; at: number }> = ({ from, to, at }) => {
  const frame = useCurrentFrame();
  const a = boxOf(from);
  const b = boxOf(to);
  const y1 = a.y + BOX_H / 2;
  const y2 = b.y - BOX_H / 2;
  const mid = (y1 + y2) / 2;
  return (
    <path
      d={`M ${a.x} ${y1} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${y2}`}
      fill="none"
      stroke="url(#edge)"
      strokeWidth={2.5}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={interpolate(frame, [at, at + 18], [1, 0], { ...CLAMP, easing: EASE })}
    />
  );
};

const Card: React.FC<{
  box: Box;
  at: number;
  border?: string;
  glow?: string;
  badge?: React.ReactNode;
}> = ({ box, at, border, glow, badge }) => (
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
        ...GLASS,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 38,
        position: "relative",
        ...(border ? { border: `1.5px solid ${border}` } : {}),
        ...(glow ? { boxShadow: `0 0 42px ${glow}, 0 24px 70px rgba(0,0,0,0.45)` } : {}),
      }}
    >
      {box.label}
      {badge}
    </div>
  </Reveal>
);

const Badge: React.FC<{ at: number; color: string; children: React.ReactNode }> = ({ at, color, children }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: -20,
        right: 18,
        opacity: interpolate(frame, [at, at + 8], [0, 1], CLAMP),
        scale: interpolate(frame, [at, at + 12], [0.7, 1], { ...CLAMP, easing: EASE, output: "perceptual-scale" }),
      }}
    >
      <Pill color={color} style={{ background: "rgba(10, 12, 22, 0.92)" }}>
        {children}
      </Pill>
    </div>
  );
};

const TaskCard: React.FC<{ task: (typeof TASKS)[number] }> = ({ task }) => {
  const frame = useCurrentFrame();
  const done = frame >= task.reviewed;
  const working = frame >= task.start && !done;
  const pulse = working ? 0.5 + 0.5 * Math.sin((frame - task.start) / 4) : 0;
  const border = done
    ? "rgba(134, 227, 192, 0.75)"
    : working
      ? `rgba(125, 216, 240, ${0.4 + 0.5 * pulse})`
      : undefined;
  const glow = done
    ? "rgba(134, 227, 192, 0.28)"
    : working
      ? `rgba(125, 216, 240, ${0.12 + 0.22 * pulse})`
      : undefined;
  return (
    <Card
      box={task}
      at={40}
      {...(border ? { border } : {})}
      {...(glow ? { glow } : {})}
      badge={
        <Badge at={task.reviewed} color={COLORS.mint}>
          审查 ✓
        </Badge>
      }
    />
  );
};

/** A worker chip that travels in from the lower left onto its task and leaves once the review passes. */
const Worker: React.FC<{ task: (typeof TASKS)[number]; name: string }> = ({ task, name }) => {
  const frame = useCurrentFrame();
  const travel = interpolate(frame, [task.start - 16, task.start], [0, 1], { ...CLAMP, easing: EASE });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        translate: `${interpolate(travel, [0, 1], [-160, task.x - 82])}px ${interpolate(travel, [0, 1], [930, task.y + BOX_H / 2 + 16])}px`,
        opacity: interpolate(
          frame,
          [task.start - 16, task.start - 10, task.reviewed + 6, task.reviewed + 14],
          [0, 1, 1, 0],
          CLAMP,
        ),
      }}
    >
      <Pill color={COLORS.cyan} style={{ background: "rgba(10, 12, 22, 0.92)" }}>
        ● {name}
      </Pill>
    </div>
  );
};

/** The trunk line at the bottom: a commit appears only after its check passes. */
const Trunk: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 300, right: 300, top: 860, height: 90 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 44,
          height: 2,
          background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.18) 12%, rgba(255,255,255,0.18) 88%, rgba(255,255,255,0))",
        }}
      />
      <div style={{ position: "absolute", left: -118, top: 24, fontSize: 30, color: COLORS.faint, letterSpacing: 2 }}>
        main
      </div>
      {TASKS.map((task, i) => {
        const at = task.reviewed + COMMIT_DELAY;
        return (
          <div
            key={task.id}
            style={{
              position: "absolute",
              left: 230 + i * 300,
              top: 0,
              width: 120,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              opacity: interpolate(frame, [at, at + 8], [0, 1], CLAMP),
            }}
          >
            <div style={{ fontSize: 22, color: COLORS.mint, marginBottom: 6, whiteSpace: "nowrap" }}>
              合入前的检查 ✓
            </div>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: COLORS.bg,
                border: `3px solid ${COLORS.mint}`,
                boxShadow: "0 0 18px rgba(134, 227, 192, 0.6)",
                scale: interpolate(frame, [at, at + 12], [0.4, 1], { ...CLAMP, easing: EASE, output: "perceptual-scale" }),
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

export const Drive: React.FC = () => (
  <SceneFade>
    <SceneLabel index="02" text="放行以后，它自己往下做" />
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(142,162,255,0.55)" />
            <stop offset="100%" stopColor="rgba(195,166,255,0.25)" />
          </linearGradient>
        </defs>
        {MODULES.map((m, i) => (
          <Edge key={m.id} from="goal" to={m.id} at={16 + i * 4} />
        ))}
        {TASKS.map((t) => (
          <Edge key={t.id} from={t.parent} to={t.id} at={36} />
        ))}
      </svg>
      <Card
        box={GOAL}
        at={8}
        border="rgba(195, 166, 255, 0.55)"
        glow="rgba(142, 162, 255, 0.25)"
      />
      {MODULES.map((m, i) => (
        <Card
          key={m.id}
          box={m}
          at={20 + i * 4}
          badge={
            i < 2 ? (
              <Badge at={32 + i * 6} color={COLORS.apricot}>
                已放行
              </Badge>
            ) : (
              <Badge at={44} color={COLORS.dim}>
                设计中
              </Badge>
            )
          }
        />
      ))}
      {TASKS.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
      {TASKS.map((t, i) => (
        <Worker key={t.id} task={t} name={`子 Agent ${"ABC"[i]}`} />
      ))}
      <Trunk />
      <Reveal at={185} style={{ position: "absolute", right: 110, top: 84 }}>
        <div style={{ fontSize: 42 }}>
          主干只前进到<GradientText gradient={PASSED}>检查过的提交</GradientText>
        </div>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
);
