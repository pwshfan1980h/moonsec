/**
 * MOON pixel font, authored as code. Caps-only, 7 rows tall, proportional widths.
 * `#` = ink, `.` = empty. Digits are all 5 wide so numbers line up (tabular).
 * Pure data + helpers so it can be tested and rasterized anywhere.
 */
export const GLYPH_H = 7;

const G: Record<string, string> = {
  'A': '.###. #...# #...# ##### #...# #...# #...#',
  'B': '####. #...# #...# ####. #...# #...# ####.',
  'C': '.###. #...# #.... #.... #.... #...# .###.',
  'D': '####. #...# #...# #...# #...# #...# ####.',
  'E': '##### #.... #.... ####. #.... #.... #####',
  'F': '##### #.... #.... ####. #.... #.... #....',
  'G': '.###. #...# #.... #.### #...# #...# .###.',
  'H': '#...# #...# #...# ##### #...# #...# #...#',
  'I': '### .#. .#. .#. .#. .#. ###',
  'J': '..### ...#. ...#. ...#. #..#. #..#. .##..',
  'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  'L': '#.... #.... #.... #.... #.... #.... #####',
  'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  'N': '#...# ##..# #.#.# #..## #...# #...# #...#',
  'O': '.###. #...# #...# #...# #...# #...# .###.',
  'P': '####. #...# #...# ####. #.... #.... #....',
  'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#',
  'R': '####. #...# #...# ####. #.#.. #..#. #...#',
  'S': '.#### #.... #.... .###. ....# ....# ####.',
  'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  'U': '#...# #...# #...# #...# #...# #...# .###.',
  'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
  'W': '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  'Z': '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  ' ': '... ... ... ... ... ... ...',
  '.': '. . . . . . #',
  ',': '.. .. .. .. .. .# #.',
  ':': '. # . . . # .',
  ';': '.. .# .. .. .. .# #.',
  '-': '... ... ... ### ... ... ...',
  '+': '... ... .#. ### .#. ... ...',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '!': '# # # # # . #',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  "'": '# # . . . . .',
  '"': '#.# #.# ... ... ... ... ...',
  '(': '.# #. #. #. #. #. .#',
  ')': '#. .# .# .# .# .# #.',
  '[': '## #. #. #. #. #. ##',
  ']': '## .# .# .# .# .# ##',
  '<': '...# ..#. .#.. #... .#.. ..#. ...#',
  '>': '#... .#.. ..#. ...# ..#. .#.. #...',
  '=': '.... .... #### .... #### .... ....',
  '_': '..... ..... ..... ..... ..... ..... #####',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  '*': '..... #.#.# .###. ##### .###. #.#.# .....',
  '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
  '·': '. . . # . . .',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  '@': '.###. #...# #.### #.#.# #.### #.... .####',
};

export interface Glyph {
  ch: string;
  w: number;
  h: number;
  /** Row-major 0/1 pixels. */
  px: Uint8Array;
}

function parse(ch: string, rows: string): Glyph {
  const r = rows.split(' ');
  const w = r[0].length;
  const px = new Uint8Array(w * r.length);
  r.forEach((row, y) => { for (let x = 0; x < w; x++) px[y * w + x] = row[x] === '#' ? 1 : 0; });
  return { ch, w, h: r.length, px };
}

/** The base 5×7 glyph set. */
export const GLYPHS: readonly Glyph[] = Object.entries(G).map(([ch, rows]) => parse(ch, rows));

/**
 * EPX / Scale2x: doubles a glyph while rounding diagonal steps, which turns the 5×7 font
 * into a smooth 10×14 display face without hand-drawing a second font.
 */
export function epx(g: Glyph): Glyph {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : g.px[y * g.w + x]);
  const w = g.w * 2, h = g.h * 2;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
      let o1 = p, o2 = p, o3 = p, o4 = p;
      if (c === a && c !== d && a !== b) o1 = a;
      if (a === b && a !== c && b !== d) o2 = b;
      if (d === c && d !== b && c !== a) o3 = c;
      if (b === d && b !== a && d !== c) o4 = d;
      px[(y * 2) * w + x * 2] = o1;
      px[(y * 2) * w + x * 2 + 1] = o2;
      px[(y * 2 + 1) * w + x * 2] = o3;
      px[(y * 2 + 1) * w + x * 2 + 1] = o4;
    }
  }
  return { ch: g.ch, w, h, px };
}

/** Font text is caps-only; everything outside the set falls back to '?'. */
export function normalizeText(s: string, known: ReadonlySet<string>): string {
  let out = '';
  for (const raw of s.toUpperCase()) out += raw === '\n' || known.has(raw) ? raw : '?';
  return out;
}

/** Pixel width of a single line in font units (glyph widths + 1px tracking). */
export function measure(s: string, glyphs: ReadonlyMap<string, Glyph>, tracking = 1): number {
  let w = 0, n = 0;
  for (const ch of s) { const g = glyphs.get(ch); if (g) { w += g.w; n++; } }
  return n ? w + (n - 1) * tracking : 0;
}
