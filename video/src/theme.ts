import { Easing } from "remotion";

// An off-white page set like a printed manual: black type, headings in a
// serif, hairline boxes with square corners, no gradients, shadows or halos.
// Vermilion marks what to look at (the goal, the emphasised words, House and
// Harness, what went wrong). Two colours mark state and nothing else: amber
// while a task is being worked on, green once a check has passed.
export const COLORS = {
  bg: "#F2EEE5",
  /** Ground of cards and labels. */
  sheet: "#FAF8F3",
  /** The person's chat bubble. */
  bubble: "#E3DED3",
  /** Text, and the lines and boxes drawn in it. */
  text: "#1B1A17",
  dim: "#5F5A51",
  // The lightest text ("main", the labels of a proposal, the footnote of the
  // end card): about 3.8:1 on the paper. The paper sample's #9C968B was 2.5:1.
  faint: "#7D776C",
  red: "#C23B22",
  // Darker than the amber and green of the blueprint sample (made for a dark
  // ground), so that text in them stays above 4.5:1 on a card.
  amber: "#9A6700",
  green: "#287538",
};

/** Body text. */
export const FONT = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
/** The name, captions and headings. */
export const SERIF = '"Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
/** Short code-like labels (the trunk's "main", `dsh-hourness`, scene numbers). */
export const MONO = '"Cascadia Mono", Consolas, monospace';

export const EASE = Easing.out(Easing.cubic);

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** A six-digit hex colour at an alpha, as rgba(). */
export const tint = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
