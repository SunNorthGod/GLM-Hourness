import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { CARD, edgePath, Pill, stateEdge, type CardState } from "../parts";
import { CLAMP, COLORS, EASE, MONO, tint } from "../theme";
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
  { label: "冲突检查", x: 175, y: 1072, w: 260, h: 104, parent: 0 },
  { label: "日历视图", x: 175, y: 1275, w: 260, h: 104, parent: 0, above: 0 },
  { label: "到点通知", x: 495, y: 1072, w: 260, h: 104, parent: 1 },
];
// A sub-agent's chip sits this far below its task card. Sub-agent A's chip
// lies between 冲突检查 and 日历视图, so the two cards are far enough apart
// to leave the connector showing above and below it.
const CHIP_GAP = 14;
const TRUNK_Y = 1470;
const COMMIT_X = [300, 495, 690];

const appear = (t: number, at: number, span = 10) =>
  interpolate(t, [at, at + span], [0, 1], { ...CLAMP, easing: EASE });

const Edge: React.FC<{ t: number; from: Box; to: Box; at: number }> = ({ t, from, to, at }) => (
  <path
    d={edgePath(from.x, from.y + from.h / 2, to.x, to.y - to.h / 2)}
    fill="none"
    stroke={COLORS.text}
    strokeWidth={2.4}
    pathLength={1}
    strokeDasharray={1}
    strokeDashoffset={1 - appear(t, at, 16)}
  />
);

const Card: React.FC<{
  t: number;
  box: Box;
  at: number;
  kind?: CardState;
  progress?: number | undefined;
  children?: React.ReactNode;
}> = ({ t, box, at, kind = "plain", progress, children }) => {
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
        translate: `0px ${interpolate(shown, [0, 1], [10, 0])}px`,
      }}
    >
      <div
        style={{
          ...CARD,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 44,
          position: "relative",
          overflow: "visible",
          ...stateEdge(kind, 2),
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
              background: tint(COLORS.text, 0.08),
            }}
          >
            {/* Amber while the task is worked on, green from the moment it passes review. */}
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                borderRadius: 3,
                background: kind === "done" ? COLORS.green : COLORS.amber,
              }}
            />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};

/**
 * A label pinned to the top-right corner of a card, coming in at `at`. Its
 * left edge stays clear of the card's centre, where the connector lands.
 */
const Badge: React.FC<{ t: number; at: number; color: string; children: React.ReactNode }> = ({
  t,
  at,
  color,
  children,
}) => (
  <div style={{ position: "absolute", top: -24, right: 0, opacity: appear(t, at, 8) }}>
    <Pill color={color} style={{ background: tint(COLORS.sheet, 0.94), fontSize: 28, padding: "4px 12px" }}>
      {children}
    </Pill>
  </div>
);

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
      <Pill color={color} style={{ background: tint(COLORS.sheet, 0.94), fontSize: 28 }}>
        {children}
      </Pill>
    </div>
  );
};

const Trunk: React.FC<{ t: number }> = ({ t }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, opacity: appear(t, T.tasks[0], 12) }}>
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 140,
        top: TRUNK_Y,
        height: 3,
        background: COLORS.text,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 80,
        top: TRUNK_Y + 22,
        fontFamily: MONO,
        fontSize: 32,
        color: COLORS.faint,
        letterSpacing: 2,
      }}
    >
      main
    </div>
    {COMMIT_X.map((x, i) => {
      const k = appear(t, T.commits[i], 12);
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
            translate: `0px ${interpolate(k, [0, 1], [-20, 0])}px`,
          }}
        >
          <div style={{ fontSize: 28, color: COLORS.green, marginBottom: 8, whiteSpace: "nowrap" }}>检查 ✓</div>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: COLORS.bg,
              border: `4px solid ${COLORS.green}`,
            }}
          />
        </div>
      );
    })}
  </div>
);

export const GraphStage: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill>
    <svg width={1080} height={1920} style={{ position: "absolute" }}>
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
    <Card t={t} box={GOAL} at={T.goal} kind="goal" />
    {MODULES.map((m, i) => (
      <Card key={m.label} t={t} box={m} at={T.modules[i]}>
        {i < 2 ? (
          <Badge t={t} at={T.released[i]} color={COLORS.text}>
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
      const busy = t >= T.arrive[i] && !done;
      const progress = interpolate(t, [T.arrive[i], T.reviewed[i] - 4], [0, 1], CLAMP);
      return (
        <Card
          key={task.label}
          t={t}
          box={task}
          at={T.tasks[i]}
          kind={done ? "done" : busy ? "working" : "plain"}
          progress={t >= T.arrive[i] ? progress : undefined}
        >
          <Badge t={t} at={T.reviewed[i]} color={COLORS.green}>
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
        y1={task.y + task.h / 2 + CHIP_GAP}
        color={COLORS.amber}
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
      color={COLORS.red}
    >
      {t >= T.rogueRefused ? "✗ 没跑检查，进不了主干" : "● 没跑检查的提交"}
    </Chip>
  </AbsoluteFill>
);
