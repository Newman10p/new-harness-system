/**
 * M.A.I. UI Theme System - Aura & Light Mode
 * Token-based CSS theming with 4 dark auras + 1 light mode
 */

export type AuraTheme = 'cobalt' | 'crimson' | 'verdant' | 'obsidian';
export type ColorMode = 'dark' | 'light';

export interface ThemeTokens {
  // Colors
  colorBgPrimary: string;
  colorBgSecondary: string;
  colorBgTertiary: string;
  colorFgPrimary: string;
  colorFgSecondary: string;
  colorFgMuted: string;
  colorAccent: string;
  colorAccentGlow: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorInfo: string;
  
  // Typography
  fontDisplay: string;
  fontUi: string;
  fontMono: string;
  
  // Effects
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  glowSm: string;
  glowMd: string;
  glowLg: string;
  
  // Motion
  motionFast: string;
  motionNormal: string;
  motionSlow: string;
  easingSmooth: string;
}

export const AURA_THEMES: Record<AuraTheme, Partial<ThemeTokens>> = {
  cobalt: {
    colorBgPrimary: '#020817',
    colorBgSecondary: '#0a1628',
    colorBgTertiary: '#112240',
    colorFgPrimary: '#e2e8f0',
    colorFgSecondary: '#94a3b8',
    colorFgMuted: '#64748b',
    colorAccent: '#06b6d4',
    colorAccentGlow: 'rgba(6, 182, 212, 0.4)',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    glowSm: '0 0 8px rgba(6, 182, 212, 0.3)',
    glowMd: '0 0 16px rgba(6, 182, 212, 0.4)',
    glowLg: '0 0 32px rgba(6, 182, 212, 0.5)',
  },
  crimson: {
    colorBgPrimary: '#0a0a0a',
    colorBgSecondary: '#1a0a0f',
    colorBgTertiary: '#2a0f1a',
    colorFgPrimary: '#f0e6e6',
    colorFgSecondary: '#c9a9a9',
    colorFgMuted: '#8b6f6f',
    colorAccent: '#dc2626',
    colorAccentGlow: 'rgba(220, 38, 38, 0.4)',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorInfo: '#2563eb',
    glowSm: '0 0 8px rgba(220, 38, 38, 0.3)',
    glowMd: '0 0 16px rgba(220, 38, 38, 0.4)',
    glowLg: '0 0 32px rgba(220, 38, 38, 0.5)',
  },
  verdant: {
    colorBgPrimary: '#050a05',
    colorBgSecondary: '#0a1a0a',
    colorBgTertiary: '#0f2a0f',
    colorFgPrimary: '#e6f0e6',
    colorFgSecondary: '#a9c9a9',
    colorFgMuted: '#6f8b6f',
    colorAccent: '#22c55e',
    colorAccentGlow: 'rgba(34, 197, 94, 0.4)',
    colorSuccess: '#22c55e',
    colorWarning: '#ca8a04',
    colorError: '#dc2626',
    colorInfo: '#3b82f6',
    glowSm: '0 0 8px rgba(34, 197, 94, 0.3)',
    glowMd: '0 0 16px rgba(34, 197, 94, 0.4)',
    glowLg: '0 0 32px rgba(34, 197, 94, 0.5)',
  },
  obsidian: {
    colorBgPrimary: '#0a0a0a',
    colorBgSecondary: '#111111',
    colorBgTertiary: '#1a1a1a',
    colorFgPrimary: '#f0f0f0',
    colorFgSecondary: '#a0a0a0',
    colorFgMuted: '#606060',
    colorAccent: '#94a3b8',
    colorAccentGlow: 'rgba(148, 163, 184, 0.3)',
    colorSuccess: '#22c55e',
    colorWarning: '#eab308',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    glowSm: '0 0 8px rgba(148, 163, 184, 0.2)',
    glowMd: '0 0 16px rgba(148, 163, 184, 0.3)',
    glowLg: '0 0 32px rgba(148, 163, 184, 0.4)',
  },
};

export const LIGHT_THEME: ThemeTokens = {
  colorBgPrimary: '#fafaf9',
  colorBgSecondary: '#ffffff',
  colorBgTertiary: '#f5f5f4',
  colorFgPrimary: '#1c1917',
  colorFgSecondary: '#44403c',
  colorFgMuted: '#78716c',
  colorAccent: '#0369a1',
  colorAccentGlow: 'rgba(3, 105, 161, 0.15)',
  colorSuccess: '#16a34a',
  colorWarning: '#ca8a04',
  colorError: '#dc2626',
  colorInfo: '#0284c7',
  fontDisplay: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontUi: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontMono: 'JetBrains Mono, monospace',
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '12px',
  shadowSm: '0 1px 2px rgba(0,0,0,0.05)',
  shadowMd: '0 4px 6px rgba(0,0,0,0.07)',
  shadowLg: '0 10px 15px rgba(0,0,0,0.1)',
  glowSm: 'none',
  glowMd: 'none',
  glowLg: 'none',
  motionFast: '0.15s',
  motionNormal: '0.25s',
  motionSlow: '0.4s',
  easingSmooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

export const DEFAULT_DARK_THEME: Omit<ThemeTokens, keyof typeof LIGHT_THEME> = {
  fontDisplay: 'Orbitron, Rajdhani, sans-serif',
  fontUi: 'Inter, sans-serif',
  fontMono: 'JetBrains Mono, monospace',
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '12px',
  shadowSm: '0 1px 2px rgba(0,0,0,0.2)',
  shadowMd: '0 4px 6px rgba(0,0,0,0.3)',
  shadowLg: '0 10px 15px rgba(0,0,0,0.4)',
  motionFast: '0.15s',
  motionNormal: '0.25s',
  motionSlow: '0.4s',
  easingSmooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

export function getThemeTokens(aura: AuraTheme, mode: ColorMode): ThemeTokens {
  if (mode === 'light') {
    return LIGHT_THEME;
  }
  
  const auraTokens = AURA_THEMES[aura];
  return {
    ...DEFAULT_DARK_THEME,
    ...auraTokens,
  } as ThemeTokens;
}

export function generateCssVariables(aura: AuraTheme, mode: ColorMode): string {
  const tokens = getThemeTokens(aura, mode);
  
  return `
    :root {
      /* Background Colors */
      --color-bg-primary: ${tokens.colorBgPrimary};
      --color-bg-secondary: ${tokens.colorBgSecondary};
      --color-bg-tertiary: ${tokens.colorBgTertiary};
      
      /* Foreground Colors */
      --color-fg-primary: ${tokens.colorFgPrimary};
      --color-fg-secondary: ${tokens.colorFgSecondary};
      --color-fg-muted: ${tokens.colorFgMuted};
      
      /* Accent Colors */
      --color-accent: ${tokens.colorAccent};
      --color-accent-glow: ${tokens.colorAccentGlow};
      --color-success: ${tokens.colorSuccess};
      --color-warning: ${tokens.colorWarning};
      --color-error: ${tokens.colorError};
      --color-info: ${tokens.colorInfo};
      
      /* Typography */
      --font-display: ${tokens.fontDisplay};
      --font-ui: ${tokens.fontUi};
      --font-mono: ${tokens.fontMono};
      
      /* Border Radius */
      --radius-sm: ${tokens.radiusSm};
      --radius-md: ${tokens.radiusMd};
      --radius-lg: ${tokens.radiusLg};
      
      /* Shadows */
      --shadow-sm: ${tokens.shadowSm};
      --shadow-md: ${tokens.shadowMd};
      --shadow-lg: ${tokens.shadowLg};
      
      /* Glows */
      --glow-sm: ${tokens.glowSm};
      --glow-md: ${tokens.glowMd};
      --glow-lg: ${tokens.glowLg};
      
      /* Motion */
      --motion-fast: ${tokens.motionFast};
      --motion-normal: ${tokens.motionNormal};
      --motion-slow: ${tokens.motionSlow};
      --easing-smooth: ${tokens.easingSmooth};
    }
  `;
}

export const PRESENCE_STATES = {
  OFFLINE: 'OFFLINE',
  IDLE: 'IDLE',
  OBSERVING: 'OBSERVING',
  THINKING: 'THINKING',
  WORKING: 'WORKING',
  WAITING: 'WAITING',
  ALERT: 'ALERT',
  SPEAKING: 'SPEAKING',
  ERROR: 'ERROR',
} as const;

export type PresenceState = typeof PRESENCE_STATES[keyof typeof PRESENCE_STATES];

export const REACTOR_ANIMATIONS: Record<PresenceState, string> = {
  [PRESENCE_STATES.OFFLINE]: 'reactor-offline',
  [PRESENCE_STATES.IDLE]: 'reactor-idle',
  [PRESENCE_STATES.OBSERVING]: 'reactor-observing',
  [PRESENCE_STATES.THINKING]: 'reactor-thinking',
  [PRESENCE_STATES.WORKING]: 'reactor-working',
  [PRESENCE_STATES.WAITING]: 'reactor-waiting',
  [PRESENCE_STATES.ALERT]: 'reactor-alert',
  [PRESENCE_STATES.SPEAKING]: 'reactor-speaking',
  [PRESENCE_STATES.ERROR]: 'reactor-error',
};
