import { Easing } from "remotion";

export const COLORS = {
  bg: "#0B1020",
  panel: "#131A2E",
  line: "#25304D",
  text: "#E8ECF5",
  dim: "#8A93A8",
  teal: "#5EEAD4",
  violet: "#A78BFA",
  amber: "#FBBF24",
  green: "#34D399",
};

export const FONT =
  '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
