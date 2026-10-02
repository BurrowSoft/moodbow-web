import { Poppins, Prompt } from "next/font/google";

// Self-hosted at build time by next/font (no request to Google from the
// visitor's browser).
export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

// Thai only: Latin text stays in Poppins (see --font-sans in globals.css).
export const prompt = Prompt({
  subsets: ["thai"],
  weight: ["400", "500"],
  variable: "--font-prompt",
  display: "swap",
  // No Thai pages ship yet (English-only beta), so don't preload it; its
  // unicode-range keeps it from downloading until Thai text appears.
  preload: false,
});

export const fontVariables = `${poppins.variable} ${prompt.variable}`;
