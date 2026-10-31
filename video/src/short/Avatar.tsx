import React from "react";
import { COLORS } from "../theme";

/** A round speaker mark for the chat scenes: one or two characters on a two-colour gradient. */
export const Avatar: React.FC<{ label: string; from: string; to: string; size: number }> = ({
  label,
  from,
  to,
  size,
}) => (
  <div
    style={{
      flex: "0 0 auto",
      width: size,
      height: size,
      borderRadius: size / 2,
      background: `linear-gradient(135deg, ${from}, ${to})`,
      boxShadow: "0 0 30px rgba(160, 150, 255, 0.45)",
      color: COLORS.bg,
      fontSize: Math.round(size * 0.44),
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {label}
  </div>
);

/** The person at the keyboard (warm) and the main agent (the accent gradient). */
export const PERSON = { label: "你", from: COLORS.apricot, to: COLORS.rose } as const;
export const MAIN_AGENT = { label: "主", from: COLORS.indigo, to: COLORS.lilac } as const;
export const MODEL = { label: "AI", from: COLORS.cyan, to: COLORS.indigo } as const;
