/**
 * Perceptual color math for the Procedural Engine: sRGB, OKLab and OKLCH. Lightness, chroma and hue
 * move in OKLCH, and the distance of two colors is the distance of their OKLab points, so equal
 * steps look equal. Colors cross the module as `[r, g, b]` bytes. Pure functions.
 *
 * @module src/projects/cyberia/procedural/core/oklab.js
 */

const TAU = Math.PI * 2;
const GAMUT_EPSILON = 1e-6;
const GAMUT_STEPS = 24;

const toLinear = (byte) => {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const toByte = (linear) => {
  const value = Math.min(1, Math.max(0, linear));
  return Math.round((value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) * 255);
};

/** The OKLab point `[L, a, b]` of an sRGB color. */
export function toOklab([red, green, blue]) {
  const [r, g, b] = [red, green, blue].map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const linearOf = ([lightness, a, b]) => {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};

const inGamut = (linear) => linear.every((value) => value >= -GAMUT_EPSILON && value <= 1 + GAMUT_EPSILON);

/** The OKLCH triple `[L, C, h]` of an sRGB color; `h` is a turn of the color wheel, from 0 to 1. */
export function toOklch(rgb) {
  const [lightness, a, b] = toOklab(rgb);
  return [lightness, Math.hypot(a, b), (Math.atan2(b, a) / TAU + 1) % 1];
}

/**
 * The sRGB color of an OKLCH triple. A color outside the sRGB gamut keeps its lightness and hue and
 * loses chroma until it fits.
 */
export function fromOklch([lightness, chroma, hue]) {
  const L = Math.min(1, Math.max(0, lightness));
  const at = (c) => linearOf([L, c * Math.cos(hue * TAU), c * Math.sin(hue * TAU)]);
  let fit = Math.max(0, chroma);
  if (!inGamut(at(fit))) {
    let [low, high] = [0, fit];
    for (let step = 0; step < GAMUT_STEPS; step++) {
      const middle = (low + high) / 2;
      if (inGamut(at(middle))) low = middle;
      else high = middle;
    }
    fit = low;
  }
  return at(fit).map(toByte);
}

/** The distance of two sRGB colors in OKLab: 0 for the same, about 1 for black and white. */
export function oklabDistance(left, right) {
  const [a, b] = [toOklab(left), toOklab(right)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
