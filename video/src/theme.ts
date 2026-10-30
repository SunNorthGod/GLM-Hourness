import { Easing } from "remotion";

// Deep blue-black ground, one soft accent gradient (mist blue to lilac),
// and muted status colours: cyan while working, mint when passed,
// apricot for the emphasised words of a proposal.
export const COLORS = {
  bg: "#06070D",
  text: "#F3F5FA",
  dim: "#99A2B6",
  faint: "#5C657A",
  indigo: "#8EA2FF",
  lilac: "#C3A6FF",
  cyan: "#7DD8F0",
  mint: "#86E3C0",
  apricot: "#FFD08A",
  rose: "#FF9DB3",
};

export const ACCENT = `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.lilac})`;
export const PASSED = `linear-gradient(90deg, ${COLORS.mint}, ${COLORS.cyan})`;
export const SILVER = "linear-gradient(180deg, #FFFFFF 0%, #C9D1FF 100%)";

// Latin glyphs from Segoe UI, Chinese from Microsoft YaHei.
export const FONT =
  '"Segoe UI Variable Display", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

// The score runs at 120 BPM: one beat is half a second.
export const BEAT_FRAMES = 15;
