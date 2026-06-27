/**
 * Hex equivalents of the oklch design tokens in app/globals.css, computed
 * once — NVL's renderer takes literal color strings, not CSS variables.
 */
const LIGHT = {
  primary: "#23344a",
  attention: "#c9892b",
  compliant: "#467748",
  partial: "#bf801e",
  noncompliant: "#a03f3c",
  unclear: "#77706b",
  mutedForeground: "#69625b",
  border: "#e2ddd9",
  card: "#fefcfa",
};

const DARK = {
  primary: "#9fbade",
  attention: "#d6963b",
  compliant: "#679f69",
  partial: "#d6963b",
  noncompliant: "#db6c66",
  unclear: "#98918b",
  mutedForeground: "#98918b",
  border: "#484848",
  card: "#1f1b17",
};

type Palette = typeof LIGHT;

const FINDING_STATUS_KEY: Record<string, keyof Palette> = {
  compliant: "compliant",
  partially_compliant: "partial",
  non_compliant: "noncompliant",
  unclear: "unclear",
};

export function colorForNode(palette: Palette, label: string, status?: string | null): string {
  switch (label) {
    case "Matter":
      return palette.primary;
    case "Finding":
      return palette[status ? FINDING_STATUS_KEY[status] ?? "unclear" : "unclear"];
    case "PlaybookRule":
      return palette.attention;
    case "Review":
    case "SignOff":
      return palette.primary;
    default:
      return palette.mutedForeground;
  }
}

export function graphPalette(resolvedTheme: string | undefined): Palette {
  return resolvedTheme === "dark" ? DARK : LIGHT;
}
