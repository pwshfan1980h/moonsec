/**
 * Graphics options. Pure parsing/serialisation so it can be unit-tested; persistence
 * goes through loadGraphicsSettings/saveGraphicsSettings (localStorage, guarded).
 */
export type GfxPreset = 'crunchy' | 'clean' | 'low';
export type GfxView = 'wide' | 'close';

export interface GraphicsSettings {
  preset: GfxPreset;
  /** WIDE = zoom 1 (960×540 virtual), CLOSE = zoom 1.5 (640×360 virtual). */
  view: GfxView;
  /** Snap the frame to the 2-unit virtual pixel grid. */
  grid: boolean;
  /** Map every pixel onto the palette. */
  quantize: boolean;
  /** Ordered dither between the two nearest palette colours. */
  dither: boolean;
  scanlines: boolean;
  haze: boolean;
  /** 0 = particles only, 1 = + fog layers, 2 = + dust field and light shafts. */
  dust: 0 | 1 | 2;
}

export const PRESETS: Record<GfxPreset, Omit<GraphicsSettings, 'view' | 'scanlines'>> = {
  crunchy: { preset: 'crunchy', grid: true, quantize: true, dither: true, haze: true, dust: 2 },
  clean: { preset: 'clean', grid: false, quantize: false, dither: false, haze: true, dust: 2 },
  low: { preset: 'low', grid: true, quantize: true, dither: true, haze: false, dust: 0 },
};

export const DEFAULT_GRAPHICS: GraphicsSettings = { ...PRESETS.crunchy, view: 'wide', scanlines: false };

const PRESET_ORDER: GfxPreset[] = ['crunchy', 'clean', 'low'];

export function applyPreset(s: GraphicsSettings, preset: GfxPreset): GraphicsSettings {
  return { ...s, ...PRESETS[preset] };
}

export function nextPreset(s: GraphicsSettings): GraphicsSettings {
  const i = PRESET_ORDER.indexOf(s.preset);
  return applyPreset(s, PRESET_ORDER[(i + 1) % PRESET_ORDER.length]);
}

export function toggleView(s: GraphicsSettings): GraphicsSettings {
  return { ...s, view: s.view === 'wide' ? 'close' : 'wide' };
}

export function cameraZoom(s: GraphicsSettings): number {
  return s.view === 'close' ? 1.5 : 1;
}

/** World units per virtual pixel. Art is authored at native size and shown at 2×. */
export const VPX = 2;

/** Filter block size in screen pixels for the current view. */
export function blockSize(s: GraphicsSettings): number {
  return VPX * cameraZoom(s);
}

export function parseGraphicsSettings(json: string | null | undefined, override?: string): GraphicsSettings {
  let s: GraphicsSettings = { ...DEFAULT_GRAPHICS };
  if (json) {
    try {
      const raw = JSON.parse(json) as Partial<GraphicsSettings>;
      if (raw.preset && raw.preset in PRESETS) s = applyPreset(s, raw.preset);
      if (raw.view === 'wide' || raw.view === 'close') s.view = raw.view;
      for (const k of ['grid', 'quantize', 'dither', 'scanlines', 'haze'] as const) {
        if (typeof raw[k] === 'boolean') s[k] = raw[k];
      }
      if (raw.dust === 0 || raw.dust === 1 || raw.dust === 2) s.dust = raw.dust;
    } catch { /* corrupt settings fall back to defaults */ }
  }
  if (override) {
    for (const token of override.split(',')) {
      if (token in PRESETS) s = applyPreset(s, token as GfxPreset);
      else if (token === 'wide' || token === 'close') s.view = token;
      else if (token === 'scanlines') s.scanlines = true;
      else if (token === 'nodither') s.dither = false;
    }
  }
  return s;
}

export function serializeGraphicsSettings(s: GraphicsSettings): string {
  return JSON.stringify(s);
}

const STORAGE_KEY = 'moonsec.gfx';

export function loadGraphicsSettings(override?: string): GraphicsSettings {
  let json: string | null = null;
  try { json = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null; } catch { /* storage blocked */ }
  return parseGraphicsSettings(json, override);
}

export function saveGraphicsSettings(s: GraphicsSettings): void {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, serializeGraphicsSettings(s)); } catch { /* storage blocked */ }
}
