import defaultTheme from "../themes/default.css?inline";
import lapisTheme from "../themes/lapis.css?inline";
import sakuraTheme from "../themes/sakura.css?inline";
import techTheme from "../themes/tech.css?inline";

export const builtinThemes = {
  "Default (Green)": defaultTheme,
  "Lapis (Blue)": lapisTheme,
  "Sakura (Pink)": sakuraTheme,
  "Tech (Dark)": techTheme,
} as const;

export type BuiltinThemeName = keyof typeof builtinThemes;
