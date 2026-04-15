import type { CSSProperties } from "react";

const DEFAULT_PORTAL_PRIMARY = "#3B82F6";

function normalizeHex(color: string): string {
  const raw = color.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((char) => char + char)
      .join("")
      .toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return DEFAULT_PORTAL_PRIMARY;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex).replace(/^#/, "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function normalizePortalPrimaryColor(color?: string | null): string {
  if (!color) return DEFAULT_PORTAL_PRIMARY;
  return normalizeHex(color);
}

export function withPortalAlpha(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getPortalTheme(color?: string | null): {
  primaryColor: string;
  softBorder: string;
  softBackground: string;
  focusRing: string;
  rootStyle: CSSProperties;
} {
  const primaryColor = normalizePortalPrimaryColor(color);
  const softBorder = withPortalAlpha(primaryColor, 0.28);
  const softBackground = withPortalAlpha(primaryColor, 0.08);
  const focusRing = withPortalAlpha(primaryColor, 0.25);

  return {
    primaryColor,
    softBorder,
    softBackground,
    focusRing,
    rootStyle: {
      "--portal-primary": primaryColor,
      "--portal-soft-border": softBorder,
      "--portal-soft-bg": softBackground,
      "--portal-focus-ring": focusRing,
    } as CSSProperties,
  };
}
