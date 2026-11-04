import React from "react";
import { COLORS } from "../theme";

type Role = "person" | "main" | "model";

/** A round speaker mark for the chat scenes: black with white type for the person, a black ring otherwise. */
export const Avatar: React.FC<{ label: string; role: Role; size: number }> = ({ label, role, size }) => (
  <div
    style={{
      flex: "0 0 auto",
      width: size,
      height: size,
      boxSizing: "border-box",
      borderRadius: size / 2,
      ...(role === "person"
        ? { background: COLORS.text, color: COLORS.bg }
        : { background: COLORS.sheet, color: COLORS.text, border: `2px solid ${COLORS.text}` }),
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

/** The person at the keyboard, the main agent and the model. */
export const PERSON = { label: "你", role: "person" } as const;
export const MAIN_AGENT = { label: "主", role: "main" } as const;
export const MODEL = { label: "AI", role: "model" } as const;
