/**
 * Parametric shape generator with procedural noise, seeded RNG, and arc-length resampling.
 * Exports a single pure function `generateShape` that returns ordered contour points.
 * @module src/server/shape-generator.js
 * @namespace ShapeGenerator
 */

/* ═══════════════════════════════════════════════════════════════════════════
 *  SEEDED PRNG  –  Mulberry32 (32-bit, fast, deterministic)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Creates a seeded pseudo-random number generator (Mulberry32).
 * @param {number} seed - Integer seed value.
 * @returns {function(): number} Returns a function that yields 0..1 on each call.
 * @memberof ShapeGenerator
 */
function createRng(seed) {
  let s = seed | 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Converts an arbitrary seed (string or number) into a 32-bit integer.
 * @param {number|string} seed
 * @returns {number}
 * @memberof ShapeGenerator
 */
function seedToInt(seed) {
  if (typeof seed === 'number') return seed | 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return h;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SIMPLEX-LIKE 2-D NOISE  (value noise with smooth interpolation)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Creates a 2D value-noise function seeded by the provided RNG.
 * Uses smooth Hermite interpolation for organic feel.
 * @param {function(): number} rng - Seeded random number generator.
 * @returns {function(number, number): number} Noise function returning -1..1.
 * @memberof ShapeGenerator
 */
function createNoise2D(rng) {
  const SIZE = 256;
  const perm = new Uint8Array(SIZE * 2);
  const grad = new Float64Array(SIZE);

  // Fill gradient table
  for (let i = 0; i < SIZE; i++) {
    grad[i] = rng() * 2 - 1;
  }

  // Fill permutation table
  const p = Array.from({ length: SIZE }, (_, i) => i);
  for (let i = SIZE - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < SIZE * 2; i++) perm[i] = p[i & (SIZE - 1)];

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + t * (b - a);
  }

  function hash(ix, iy) {
    return perm[(perm[ix & (SIZE - 1)] + iy) & (SIZE - 1)];
  }

  return function noise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const u = fade(fx);
    const v = fade(fy);

    const g00 = grad[hash(ix, iy) & (SIZE - 1)];
    const g10 = grad[hash(ix + 1, iy) & (SIZE - 1)];
    const g01 = grad[hash(ix, iy + 1) & (SIZE - 1)];
    const g11 = grad[hash(ix + 1, iy + 1) & (SIZE - 1)];

    const n0 = lerp(g00, g10, u);
    const n1 = lerp(g01, g11, u);
    return lerp(n0, n1, v);
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  PARAMETRIC SHAPE REGISTRY
 *  Each shape function receives (t, params) where t ∈ [0, 1]
 *  and returns {x, y} in arbitrary local coordinates.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} ShapePoint
 * @property {number} x
 * @property {number} y
 * @memberof ShapeGenerator
 */

/**
 * Registry of parametric shape functions.
 * Each entry maps a key string to a function (t, params) → {x, y}.
 * @type {Object<string, function(number, Object): ShapePoint>}
 * @memberof ShapeGenerator
 */
const shapeRegistry = {};

/**
 * Registers a new parametric shape function.
 * @param {string} key - Unique shape identifier.
 * @param {function(number, Object): ShapePoint} fn - Parametric function.
 * @memberof ShapeGenerator
 */
export function registerShape(key, fn) {
  shapeRegistry[key] = fn;
}

// ---- Built-in shapes -------------------------------------------------------

registerShape('circle', (t, params) => {
  const r = params.r ?? 1;
  const angle = t * Math.PI * 2;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
});

registerShape('ellipse', (t, params) => {
  const a = params.a ?? 1;
  const b = params.b ?? 0.6;
  const angle = t * Math.PI * 2;
  return { x: a * Math.cos(angle), y: b * Math.sin(angle) };
});

registerShape('parabola', (t, params) => {
  const a = params.a ?? 1;
  const rangeX = params.rangeX ?? 2;
  const x = (t - 0.5) * rangeX;
  return { x, y: a * x * x };
});

registerShape('heart', (t) => {
  const angle = t * Math.PI * 2;
  const x = 16 * Math.pow(Math.sin(angle), 3);
  const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
  return { x: x / 17, y: -y / 17 }; // normalize roughly to -1..1 and flip y
});

registerShape('skull-bone', (t) => {
  // Skull-and-crossbones: cranium dome, two eyes, nose V, mouth with teeth,
  // goatee/chin, jaw, flattened X-bones with knobs.
  // All segment endpoints are carefully matched so there are no stray diagonal lines.
  const PI = Math.PI;
  const mix = (ax, ay, bx, by, f) => ({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f });

  const crR = 0.6; // cranium radius
  const crCY = -0.1; // cranium vertical center (shifted up a bit for room)
  const eyeR = 0.13; // eye socket radius
  const eyeY = 0.01; // eye socket center Y
  const eyeRX = 0.22; // right eye center X
  const eyeLX = -0.22; // left eye center X
  const noseY = 0.27; // nose tip Y
  const mouthY = 0.38; // mouth line Y
  const mouthW = 0.22; // mouth half-width
  const teethN = 3; // number of teeth
  const goateeY = 0.52; // goatee tip Y
  const goateeW = 0.08; // goatee half-width at top
  const jawW = 0.34; // jaw half-width
  const jawY = 0.46; // jaw bottom Y
  const boneStartY = 0.56; // bone origin Y (just below jaw)
  const crossY = 0.68; // bone crossing Y (flatter — closer to start/end)
  const endY = 0.78; // bone knob center Y (much closer to crossY)
  const boneX = 0.52; // bone knob spread X (wider for flatter angle)
  const knob = 0.06; // knob radius
  const crA0 = PI * 1.15; // cranium start angle (left temple)
  const crA1 = PI * 1.85; // cranium end angle (right temple)

  // Key anchor points for seamless transitions:
  // Right eye: inner-bottom at angle ~(PI*0.75) from center, outer-top at angle ~(-PI*0.35)
  // Left eye: inner-bottom at angle ~(PI*0.25) from center, outer-top at angle ~(-PI*0.65+2PI)
  const reInnerA = PI * 0.75; // right eye angle toward nose (inner-bottom)
  const reOuterA = -PI * 0.35; // right eye angle toward right temple (outer-top)
  const leInnerA = PI * 0.25; // left eye angle toward nose (inner-bottom)
  const leOuterA = PI + PI * 0.35; // left eye angle toward left temple (outer-top)

  // Precomputed anchor coords
  const rTempleX = Math.cos(crA1) * crR;
  const rTempleY = crCY + Math.sin(crA1) * crR;
  const reOuterX = eyeRX + Math.cos(reOuterA) * eyeR;
  const reOuterY = eyeY + Math.sin(reOuterA) * eyeR;
  const reInnerX = eyeRX + Math.cos(reInnerA) * eyeR;
  const reInnerY = eyeY + Math.sin(reInnerA) * eyeR;
  const leInnerX = eyeLX + Math.cos(leInnerA) * eyeR;
  const leInnerY = eyeY + Math.sin(leInnerA) * eyeR;
  const leOuterX = eyeLX + Math.cos(leOuterA) * eyeR;
  const leOuterY = eyeY + Math.sin(leOuterA) * eyeR;
  const lTempleX = Math.cos(crA0) * crR;
  const lTempleY = crCY + Math.sin(crA0) * crR;

  // 0.00–0.14 : cranium dome (left temple → top → right temple)
  if (t < 0.14) {
    const a = crA0 + (t / 0.14) * (crA1 - crA0);
    return { x: Math.cos(a) * crR, y: crCY + Math.sin(a) * crR };
  }
  // 0.14–0.16 : right temple → right eye outer-top (short connector)
  if (t < 0.16) {
    return mix(rTempleX, rTempleY, reOuterX, reOuterY, (t - 0.14) / 0.02);
  }
  // 0.16–0.22 : right eye socket (from outer-top, clockwise full circle back to outer-top)
  if (t < 0.22) {
    const a = reOuterA - ((t - 0.16) / 0.06) * PI * 2;
    return { x: eyeRX + Math.cos(a) * eyeR, y: eyeY + Math.sin(a) * eyeR };
  }
  // 0.22–0.23 : right eye outer-top → right eye inner-bottom (short connector along bottom)
  if (t < 0.23) {
    // small arc along bottom of right eye from outer to inner
    const aStart = reOuterA - PI * 2; // same as reOuterA but after full circle
    const aEnd = reInnerA;
    // go the short way: outer-top → bottom → inner-bottom
    const a = reOuterA + ((t - 0.22) / 0.01) * (reInnerA - reOuterA);
    return { x: eyeRX + Math.cos(a) * eyeR, y: eyeY + Math.sin(a) * eyeR };
  }
  // 0.23–0.27 : nose V (inner-bottom of right eye → nose tip → inner-bottom of left eye)
  if (t < 0.27) {
    const s = (t - 0.23) / 0.04;
    if (s < 0.5) return mix(reInnerX, reInnerY, 0, noseY, s / 0.5);
    return mix(0, noseY, leInnerX, leInnerY, (s - 0.5) / 0.5);
  }
  // 0.27–0.28 : left eye inner-bottom → left eye outer-top (short connector along bottom)
  if (t < 0.28) {
    const a = leInnerA + ((t - 0.27) / 0.01) * (leOuterA - leInnerA);
    return { x: eyeLX + Math.cos(a) * eyeR, y: eyeY + Math.sin(a) * eyeR };
  }
  // 0.28–0.34 : left eye socket (from outer-top, counter-clockwise full circle)
  if (t < 0.34) {
    const a = leOuterA + ((t - 0.28) / 0.06) * PI * 2;
    return { x: eyeLX + Math.cos(a) * eyeR, y: eyeY + Math.sin(a) * eyeR };
  }
  // 0.34–0.36 : left eye outer-top → left temple (short connector)
  if (t < 0.36) {
    return mix(leOuterX, leOuterY, lTempleX, lTempleY, (t - 0.34) / 0.02);
  }
  // 0.36–0.38 : left temple → mouth start (travel down along left cheek to mouth)
  if (t < 0.38) {
    return mix(lTempleX, lTempleY, -mouthW, mouthY, (t - 0.36) / 0.02);
  }
  // 0.38–0.44 : mouth with teeth (zigzag line from left to right)
  if (t < 0.44) {
    const s = (t - 0.38) / 0.06; // 0..1 across mouth
    const x = -mouthW + s * mouthW * 2;
    // zigzag teeth: go up/down based on segment
    const toothPhase = s * teethN * 2; // each tooth = up + down
    const inTooth = toothPhase % 2;
    const toothAmp = 0.05;
    const y = mouthY + (inTooth < 1 ? -toothAmp * inTooth : -toothAmp * (2 - inTooth));
    return { x, y };
  }
  // 0.44–0.49 : goatee / chin tuft (down to point and back)
  if (t < 0.49) {
    const s = (t - 0.44) / 0.05;
    if (s < 0.33) {
      // from mouth right end → goatee left start → down to tip
      return mix(0, mouthY + 0.04, 0, goateeY, s / 0.33);
    }
    if (s < 0.66) {
      // goatee tip → back up, widening
      return mix(0, goateeY, goateeW, mouthY + 0.06, (s - 0.33) / 0.33);
    }
    // close back to center bottom
    return mix(goateeW, mouthY + 0.06, 0, jawY, (s - 0.66) / 0.34);
  }
  // 0.49–0.51 : center jaw → left jaw corner
  if (t < 0.51) {
    return mix(0, jawY, -jawW, jawY, (t - 0.49) / 0.02);
  }
  // 0.51–0.53 : left jaw corner → center below jaw (bone start)
  if (t < 0.53) {
    const s = (t - 0.51) / 0.02;
    return mix(-jawW, jawY, 0, boneStartY, s);
  }
  // 0.53–0.565 : left-down bone arm → left-bottom knob arc
  if (t < 0.545) {
    return mix(0, boneStartY, -boneX, endY, (t - 0.53) / 0.015);
  }
  if (t < 0.565) {
    const a = PI * 0.65 + ((t - 0.545) / 0.02) * PI * 1.7;
    return { x: -boneX + Math.cos(a) * knob, y: endY + Math.sin(a) * knob };
  }
  // 0.565–0.605 : left-bottom knob → cross center → right-bottom knob
  if (t < 0.585) {
    return mix(-boneX, endY, 0, crossY, (t - 0.565) / 0.02);
  }
  if (t < 0.605) {
    return mix(0, crossY, boneX, endY, (t - 0.585) / 0.02);
  }
  // 0.605–0.64 : right-bottom knob arc → back up to center
  if (t < 0.625) {
    const a = PI * 0.35 - ((t - 0.605) / 0.02) * PI * 1.7;
    return { x: boneX + Math.cos(a) * knob, y: endY + Math.sin(a) * knob };
  }
  if (t < 0.64) {
    return mix(boneX, endY, 0, boneStartY, (t - 0.625) / 0.015);
  }
  // --- second bone of the X (top-left to bottom-right, crossing the first) ---
  // 0.64–0.675 : center → left-top knob
  if (t < 0.655) {
    return mix(0, boneStartY, -boneX, boneStartY, (t - 0.64) / 0.015);
  }
  if (t < 0.675) {
    const a = -PI * 0.35 - ((t - 0.655) / 0.02) * PI * 1.7;
    return { x: -boneX + Math.cos(a) * knob, y: boneStartY + Math.sin(a) * knob };
  }
  // 0.675–0.715 : left-top knob → cross center → right-top knob area
  if (t < 0.695) {
    return mix(-boneX, boneStartY, 0, crossY, (t - 0.675) / 0.02);
  }
  if (t < 0.715) {
    return mix(0, crossY, boneX, boneStartY, (t - 0.695) / 0.02);
  }
  // 0.715–0.75 : right-top knob arc → back to center
  if (t < 0.735) {
    const a = -PI * 0.65 + ((t - 0.715) / 0.02) * PI * 1.7;
    return { x: boneX + Math.cos(a) * knob, y: boneStartY + Math.sin(a) * knob };
  }
  if (t < 0.75) {
    return mix(boneX, boneStartY, 0, boneStartY, (t - 0.735) / 0.015);
  }
  // 0.75–0.78 : center below jaw → right jaw corner
  if (t < 0.78) {
    return mix(0, boneStartY, jawW, jawY, (t - 0.75) / 0.03);
  }
  // 0.78–0.80 : right jaw corner → right temple
  if (t < 0.8) {
    return mix(jawW, jawY, rTempleX, rTempleY, (t - 0.78) / 0.02);
  }
  // 0.80–1.00 : closing arc around cranium bottom back to left temple
  {
    const s = (t - 0.8) / 0.2;
    const a = crA1 + s * (crA0 + PI * 2 - crA1);
    return { x: Math.cos(a) * crR, y: crCY + Math.sin(a) * crR };
  }
});

registerShape('star', (t, params) => {
  const spikes = params.spikes ?? 5;
  const outerR = params.outerR ?? 1;
  const innerR = params.innerR ?? 0.4;
  const angle = t * Math.PI * 2;
  // Alternate between outer and inner radius based on angular position
  const segAngle = Math.PI / spikes;
  const mod = ((angle % (2 * segAngle)) + 2 * segAngle) % (2 * segAngle);
  const r =
    mod < segAngle
      ? outerR + (innerR - outerR) * (mod / segAngle)
      : innerR + (outerR - innerR) * ((mod - segAngle) / segAngle);
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
});

registerShape('cactus', (t) => {
  // Organic cactus silhouette using additive sine harmonics
  const angle = t * Math.PI * 2;
  const r = 0.5 + 0.15 * Math.sin(3 * angle) + 0.1 * Math.sin(5 * angle) + 0.08 * Math.cos(7 * angle);
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
});

registerShape('pixel-art', (t, params) => {
  // Generates a blocky pixel-art shape — a rounded square with stepped edges
  const gridSize = params.gridSize ?? 8;
  const angle = t * Math.PI * 2;
  // Superellipse (Lamé curve) for rounded-square feel
  const n = params.n ?? 4;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const r = 1 / Math.pow(Math.pow(Math.abs(cosA), n) + Math.pow(Math.abs(sinA), n), 1 / n);
  let x = r * cosA;
  let y = r * sinA;
  // Snap to grid for pixel-art effect
  x = Math.round(x * gridSize) / gridSize;
  y = Math.round(y * gridSize) / gridSize;
  return { x, y };
});

registerShape('bezier-path', (t, params) => {
  // Cubic Bézier through default control points (or user-supplied)
  const p0 = params.p0 ?? { x: 0, y: 0 };
  const p1 = params.p1 ?? { x: 0.3, y: 1 };
  const p2 = params.p2 ?? { x: 0.7, y: 1 };
  const p3 = params.p3 ?? { x: 1, y: 0 };
  const u = 1 - t;
  const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
  const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
  return { x, y };
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  GEOMETRY HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Arc-length resamples a parametric curve to produce `count` evenly-spaced points.
 * @param {function(number): ShapePoint} curveFn - Function from t→{x,y}.
 * @param {number} count - Number of output points.
 * @param {boolean} closed - If true, the curve wraps so last point connects to first.
 * @returns {ShapePoint[]}
 * @memberof ShapeGenerator
 */
function arcLengthResample(curveFn, count, closed) {
  // 1. Sample at high resolution to build cumulative arc-length table
  const SAMPLES = Math.max(count * 8, 2000);
  const rawPoints = [];
  for (let i = 0; i <= SAMPLES; i++) {
    rawPoints.push(curveFn(i / SAMPLES));
  }

  const cumLen = new Float64Array(SAMPLES + 1);
  cumLen[0] = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    const dx = rawPoints[i].x - rawPoints[i - 1].x;
    const dy = rawPoints[i].y - rawPoints[i - 1].y;
    cumLen[i] = cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }

  const totalLen = cumLen[SAMPLES];
  if (totalLen === 0) {
    // Degenerate — all points overlap
    const p = rawPoints[0];
    return Array.from({ length: count }, () => ({ x: p.x, y: p.y }));
  }

  // 2. Walk the arc-length table to pick `count` evenly-spaced distances
  const numSegments = closed ? count : count - 1;
  const step = totalLen / (numSegments || 1);
  const result = [];
  let idx = 0;

  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (idx < SAMPLES - 1 && cumLen[idx + 1] < target) idx++;
    // Clamp so we never read past rawPoints[SAMPLES]
    const safeIdx = Math.min(idx, SAMPLES - 1);
    // Linear interpolation between safeIdx and safeIdx+1
    const segLen = cumLen[safeIdx + 1] - cumLen[safeIdx];
    const frac = segLen > 0 ? (target - cumLen[safeIdx]) / segLen : 0;
    const x = rawPoints[safeIdx].x + frac * (rawPoints[safeIdx + 1].x - rawPoints[safeIdx].x);
    const y = rawPoints[safeIdx].y + frac * (rawPoints[safeIdx + 1].y - rawPoints[safeIdx].y);
    result.push({ x, y });
  }

  return result;
}

/**
 * Applies 2D rotation (in radians) to a set of points around their centroid.
 * @param {ShapePoint[]} points
 * @param {number} radians
 * @returns {ShapePoint[]}
 * @memberof ShapeGenerator
 */
function rotatePoints(points, radians) {
  if (radians === 0) return points;
  // Compute centroid
  let cx = 0,
    cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  const cosR = Math.cos(radians);
  const sinR = Math.sin(radians);
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: cx + dx * cosR - dy * sinR,
      y: cy + dx * sinR + dy * cosR,
    };
  });
}

/**
 * Scales points from their centroid.
 * @param {ShapePoint[]} points
 * @param {number} sx - X scale factor.
 * @param {number} sy - Y scale factor.
 * @returns {ShapePoint[]}
 * @memberof ShapeGenerator
 */
function scalePoints(points, sx, sy) {
  if (sx === 1 && sy === 1) return points;
  let cx = 0,
    cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  return points.map((p) => ({
    x: cx + (p.x - cx) * sx,
    y: cy + (p.y - cy) * sy,
  }));
}

/**
 * Normalizes points into the 0..1 bounding box.
 * @param {ShapePoint[]} points
 * @returns {ShapePoint[]}
 * @memberof ShapeGenerator
 */
function normalizePoints(points) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  // Uniform scale to fit inside [0..1] while preserving aspect ratio
  const range = Math.max(rangeX, rangeY);
  const offsetX = (range - rangeX) / 2;
  const offsetY = (range - rangeY) / 2;
  return points.map((p) => ({
    x: (p.x - minX + offsetX) / range,
    y: (p.y - minY + offsetY) / range,
  }));
}

/**
 * Computes the axis-aligned bounding box for a set of points.
 * @param {ShapePoint[]} points
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 * @memberof ShapeGenerator
 */
function computeBbox(points) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Converts normalized (0..1) points to pixel coordinates.
 * @param {ShapePoint[]} points - Normalized points.
 * @param {number} width - Target pixel width.
 * @param {number} height - Target pixel height.
 * @returns {ShapePoint[]}
 * @memberof ShapeGenerator
 */
export function toPixelCoords(points, width, height) {
  return points.map((p) => ({
    x: p.x * width,
    y: p.y * height,
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  BRESENHAM RASTERIZATION  –  connected integer-grid contour
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Bresenham line algorithm — returns all integer grid cells between two points.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {ShapePoint[]}
 * @memberof ShapeGenerator
 */
function bresenhamLine(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    pts.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
}

/**
 * Rasterizes a contour of normalized (0..1) points onto an integer grid,
 * using Bresenham lines between consecutive points so the outline is fully
 * connected — even on grids as small as 16×16.
 *
 * @param {ShapePoint[]} normalizedPoints - Points in 0..1.
 * @param {number} gridW - Grid width in cells.
 * @param {number} gridH - Grid height in cells.
 * @param {boolean} closed - Whether to connect last point back to first.
 * @returns {ShapePoint[]} Unique integer {x,y} cells ordered along the contour.
 * @memberof ShapeGenerator
 */
function rasterizeContour(normalizedPoints, gridW, gridH, closed) {
  const maxX = gridW - 1;
  const maxY = gridH - 1;

  // Map normalized → grid integers
  const gridPts = normalizedPoints.map((p) => ({
    x: Math.round(Math.min(Math.max(p.x, 0), 1) * maxX),
    y: Math.round(Math.min(Math.max(p.y, 0), 1) * maxY),
  }));

  // Bresenham between every consecutive pair (+ wrap if closed)
  const allCells = [];
  const len = gridPts.length;
  const segments = closed ? len : len - 1;

  for (let i = 0; i < segments; i++) {
    const a = gridPts[i];
    const b = gridPts[(i + 1) % len];
    const lineCells = bresenhamLine(a.x, a.y, b.x, b.y);
    // Append all except the last cell (it will be the first of the next segment)
    // to avoid trivial duplicates at joints.
    for (let j = 0; j < lineCells.length - 1; j++) {
      allCells.push(lineCells[j]);
    }
    // For the very last segment, include its endpoint too
    if (i === segments - 1) {
      allCells.push(lineCells[lineCells.length - 1]);
    }
  }

  // Deduplicate while preserving contour order
  const seen = new Set();
  const unique = [];
  for (const p of allCells) {
    const k = p.x * 100000 + p.y;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(p);
    }
  }

  return unique;
}

/**
 * Renders an integer-coordinate ShapeResult as an ASCII grid string.
 * Useful for quick visual verification of pixel-art shapes.
 *
 * @param {ShapeResult} shapeResult - Result from generateShape with intCoords enabled.
 * @param {object} [opts] - Render options.
 * @param {string} [opts.filled='█'] - Character for filled cells.
 * @param {string} [opts.empty='·']  - Character for empty cells.
 * @returns {string} Multi-line ASCII grid.
 * @memberof ShapeGenerator
 */
export function renderGrid(shapeResult, opts = {}) {
  const { filled = '█', empty = '·' } = opts;
  const { points, metadata } = shapeResult;
  const w = metadata.gridWidth;
  const h = metadata.gridHeight;

  if (w == null || h == null) {
    throw new Error('renderGrid requires a ShapeResult generated with intCoords enabled.');
  }

  // Build set of occupied cells
  const occupied = new Set();
  for (const p of points) {
    occupied.add(p.y * w + p.x);
  }

  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      row += occupied.has(y * w + x) ? filled : empty;
    }
    rows.push(row);
  }
  return rows.join('\n');
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN PUBLIC API
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} ShapeOptions
 * @property {number}  [count=200]      - Number of XY points to generate.
 * @property {number|number[]} [scale=1] - Uniform number or [sx, sy] scale factors.
 * @property {number}  [rotation=0]     - Rotation in degrees.
 * @property {number}  [jitter=0]       - Max random offset in normalized units (0..1).
 * @property {number}  [noise=0]        - 0..1 strength of procedural noise displacement.
 * @property {number|string} [seed]     - Seed for deterministic randomness.
 * @property {boolean} [closed=true]    - Whether last point connects to the first.
 * @property {boolean} [normalize=true] - Return points in 0..1 coordinate box.
 * @property {string}  [color]          - RGBA or hex color metadata.
 * @property {boolean|number|number[]} [intCoords=false] - Integer pixel-art grid mode.
 *   - `true`  → use a grid of size `count × count` (or `count` as single dim).
 *   - `number` (e.g. 16) → square grid of that size (`16×16`).
 *   - `[width, height]` → rectangular grid.
 *   When enabled, output points are unique integer {x,y} pairs in `0..gridW-1`
 *   with Bresenham rasterization so that even on a 16×16 grid the full contour
 *   is visible as a connected set of cells. `count` is ignored in this mode;
 *   the number of output points equals the number of unique rasterized cells.
 * @memberof ShapeGenerator
 */

/**
 * @typedef {Object} ShapeBbox
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 * @memberof ShapeGenerator
 */

/**
 * @typedef {Object} ShapeMetadata
 * @property {string}     key   - The shape key used.
 * @property {number}     count - Number of points generated.
 * @property {number}     seed  - Effective integer seed used.
 * @property {string}     [color] - Color metadata if provided.
 * @property {ShapeBbox}  [bbox]  - Bounding box of the output points.
 * @property {number}     [gridWidth]  - Grid width when intCoords is used.
 * @property {number}     [gridHeight] - Grid height when intCoords is used.
 * @memberof ShapeGenerator
 */

/**
 * @typedef {Object} ShapeResult
 * @property {ShapePoint[]}  points   - Ordered contour points.
 * @property {ShapeMetadata} metadata - Descriptive metadata about the generation.
 * @memberof ShapeGenerator
 */

/**
 * Generates a parametric shape as an array of ordered contour points.
 *
 * @param {string} key - Shape identifier (e.g. "circle", "heart", "star").
 * @param {ShapeOptions} [options={}] - Generation options.
 * @returns {ShapeResult} The generated shape data.
 * @throws {Error} If the requested shape key is not registered.
 * @memberof ShapeGenerator
 *
 * @example
 * import { generateShape } from './shape-generator.js';
 *
 * const result = generateShape('heart', {
 *   count: 300,
 *   scale: 0.9,
 *   rotation: 10,
 *   jitter: 0.002,
 *   noise: 0.15,
 *   seed: 'fx-42',
 *   color: 'rgba(220,20,60,1)',
 * });
 * // result.points -> [{x: 0.51, y: 0.86}, ...]
 */
export function generateShape(key, options = {}) {
  const shapeFn = shapeRegistry[key];
  if (!shapeFn) {
    const available = Object.keys(shapeRegistry).join(', ');
    throw new Error(`Unknown shape key "${key}". Available shapes: ${available}`);
  }

  // ---- Destructure options with defaults ------------------------------------
  const {
    count = 200,
    scale = 1,
    rotation = 0,
    jitter = 0,
    noise = 0,
    seed: rawSeed,
    closed = true,
    normalize = true,
    intCoords = false,
    color,
    ...extraParams
  } = options;

  // ---- Parse intCoords into grid dimensions ---------------------------------
  let gridW = 0;
  let gridH = 0;
  const useIntCoords = intCoords !== false && intCoords !== 0;

  if (useIntCoords) {
    if (Array.isArray(intCoords)) {
      gridW = intCoords[0] | 0;
      gridH = intCoords[1] | 0;
    } else if (typeof intCoords === 'number') {
      gridW = intCoords | 0;
      gridH = intCoords | 0;
    } else {
      // true → derive from count, minimum 8 to be useful
      gridW = Math.max(count, 8) | 0;
      gridH = gridW;
    }
    if (gridW < 2 || gridH < 2) {
      throw new Error(`intCoords grid must be at least 2×2, got ${gridW}×${gridH}`);
    }
  }

  // When rasterizing, oversample the parametric curve so small grids get
  // enough raw points for Bresenham to trace the full contour.
  const sampleCount = useIntCoords ? Math.max(count, (gridW + gridH) * 4) : count;

  // ---- Seeded RNG -----------------------------------------------------------
  const intSeed = rawSeed != null ? seedToInt(rawSeed) : (Math.random() * 0x7fffffff) | 0;
  const rng = createRng(intSeed);

  // ---- Noise function -------------------------------------------------------
  let noise2D = null;
  if (noise > 0) {
    noise2D = createNoise2D(rng);
  }

  // ---- Scale factors --------------------------------------------------------
  const sx = Array.isArray(scale) ? scale[0] : scale;
  const sy = Array.isArray(scale) ? scale[1] : scale;

  // ---- Build raw parametric curve function -----------------------------------
  const curveFn = (t) => shapeFn(t, extraParams);

  // ---- Arc-length resample to evenly-spaced points --------------------------
  let points = arcLengthResample(curveFn, sampleCount, closed);

  // ---- Apply scale ----------------------------------------------------------
  points = scalePoints(points, sx, sy);

  // ---- Apply rotation (degrees → radians) -----------------------------------
  if (rotation !== 0) {
    points = rotatePoints(points, (rotation * Math.PI) / 180);
  }

  // ---- Apply procedural noise displacement ----------------------------------
  if (noise > 0 && noise2D) {
    const noiseScale = 3; // frequency multiplier
    points = points.map((p, i) => {
      const t = i / sampleCount;
      const nx = noise2D(t * noiseScale * 10, 0.0) * noise * 0.1;
      const ny = noise2D(0.0, t * noiseScale * 10) * noise * 0.1;
      return { x: p.x + nx, y: p.y + ny };
    });
  }

  // ---- Apply jitter ---------------------------------------------------------
  if (jitter > 0) {
    points = points.map((p) => ({
      x: p.x + (rng() * 2 - 1) * jitter,
      y: p.y + (rng() * 2 - 1) * jitter,
    }));
  }

  // ---- Normalize to 0..1 (always needed before intCoords rasterization) -----
  if (normalize || useIntCoords) {
    points = normalizePoints(points);
  }

  // ---- Integer grid rasterization (Bresenham) -------------------------------
  if (useIntCoords) {
    points = rasterizeContour(points, gridW, gridH, closed);

    // Build metadata for integer grid mode
    const bbox = computeBbox(points);
    /** @type {ShapeMetadata} */
    const metadata = {
      key,
      count: points.length,
      seed: intSeed,
      gridWidth: gridW,
      gridHeight: gridH,
      bbox: {
        minX: bbox.minX,
        minY: bbox.minY,
        maxX: bbox.maxX,
        maxY: bbox.maxY,
      },
    };
    if (color != null) metadata.color = color;

    return { points, metadata };
  }

  // ---- Round for cleanliness (6 decimal places) -----------------------------
  points = points.map((p) => ({
    x: Math.round(p.x * 1e6) / 1e6,
    y: Math.round(p.y * 1e6) / 1e6,
  }));

  // ---- Build metadata -------------------------------------------------------
  const bbox = computeBbox(points);
  /** @type {ShapeMetadata} */
  const metadata = {
    key,
    count: points.length,
    seed: intSeed,
    bbox: {
      minX: Math.round(bbox.minX * 1e6) / 1e6,
      minY: Math.round(bbox.minY * 1e6) / 1e6,
      maxX: Math.round(bbox.maxX * 1e6) / 1e6,
      maxY: Math.round(bbox.maxY * 1e6) / 1e6,
    },
  };
  if (color != null) metadata.color = color;

  return { points, metadata };
}

/**
 * Returns the list of currently registered shape keys.
 * @returns {string[]}
 * @memberof ShapeGenerator
 */
export function listShapes() {
  return Object.keys(shapeRegistry);
}
