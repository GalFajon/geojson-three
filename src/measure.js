/**
 * Measurement helpers on `[x, y, z]` positions. Everything is computed in float64, relative to the
 * first vertex where it matters, so results stay exact at large coordinate magnitudes.
 * @module measure
 */

/**
 * 3D distance between two positions.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function distance(a, b) {
    return Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0));
}

/**
 * Midpoint of two positions.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
export function midpoint(a, b) {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ((a[2] ?? 0) + (b[2] ?? 0)) / 2];
}

/**
 * Length of every segment of a path.
 * @param {number[][]} positions
 * @param {boolean} [closed=false]  Include the segment from the last position back to the first (for rings).
 * @returns {number[]}
 */
export function segmentLengths(positions, closed = false) {
    const out = [];
    for (let i = 0; i < positions.length - 1; i++) out.push(distance(positions[i], positions[i + 1]));
    if (closed && positions.length > 2) out.push(distance(positions[positions.length - 1], positions[0]));
    return out;
}

/**
 * Total 3D length of a path.
 * @param {number[][]} positions
 * @param {boolean} [closed=false]
 * @returns {number}
 */
export function pathLength(positions, closed = false) {
    return segmentLengths(positions, closed).reduce((s, l) => s + l, 0);
}

/**
 * Average of the vertices. This is a simple label anchor, not the area centroid.
 * @param {number[][]} positions
 * @returns {number[]}
 */
export function vertexCentroid(positions) {
    if (!positions.length) return [0, 0, 0];
    let x = 0, y = 0, z = 0;
    for (const p of positions) { x += p[0]; y += p[1]; z += p[2] ?? 0; }
    return [x / positions.length, y / positions.length, z / positions.length];
}

/**
 * Area of a planar ring in its own plane. Works for horizontal, tilted and vertical rings, unlike the
 * 2D shoelace formula, which only measures the footprint.
 * @param {number[][]} ring  Not closed.
 * @returns {number}
 */
export function ringArea(ring) {
    if (ring.length < 3) return 0;
    const o = ring[0];
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const ax = a[0] - o[0], ay = a[1] - o[1], az = (a[2] ?? 0) - (o[2] ?? 0);
        const bx = b[0] - o[0], by = b[1] - o[1], bz = (b[2] ?? 0) - (o[2] ?? 0);
        nx += (ay - by) * (az + bz);
        ny += (az - bz) * (ax + bx);
        nz += (ax - bx) * (ay + by);
    }
    return Math.hypot(nx, ny, nz) / 2;
}

/**
 * Area of a polygon: the outer ring minus its holes.
 * @param {number[][][]} rings  `[outer, ...holes]`, not closed.
 * @returns {number}
 */
export function polygonArea(rings) {
    if (!rings.length) return 0;
    return Math.max(0, ringArea(rings[0]) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0));
}

/**
 * Point-in-ring test on x/y (the plan view).
 * @param {number[]} p
 * @param {number[][]} ring  Not closed.
 * @returns {boolean}
 */
export function pointInRing2D(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/**
 * Whether two x/y segments properly intersect.
 * @param {number[]} a @param {number[]} b @param {number[]} c @param {number[]} d
 * @returns {boolean}
 */
function segmentsCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/**
 * Whether ring `inner` lies completely inside ring `outer` in plan view: every vertex is inside and
 * no edges cross.
 * @param {number[][]} inner
 * @param {number[][]} outer
 * @returns {boolean}
 */
export function ringInsideRing2D(inner, outer) {
    if (!inner.every((p) => pointInRing2D(p, outer))) return false;
    for (let i = 0; i < inner.length; i++) {
        const a = inner[i], b = inner[(i + 1) % inner.length];
        for (let j = 0; j < outer.length; j++) {
            if (segmentsCross(a, b, outer[j], outer[(j + 1) % outer.length])) return false;
        }
    }
    return true;
}

/**
 * Default measurement label text.
 * @param {number} value
 * @param {'length'|'area'} kind
 * @param {string} [unit='m']
 * @returns {string}
 */
export function formatMeasurement(value, kind, unit = 'm') {
    const v = value < 0.01 ? value.toExponential(2) : value < 1 ? value.toFixed(3) : value < 100 ? value.toFixed(2) : value.toFixed(1);
    return kind === 'area' ? `${v} ${unit}²` : `${v} ${unit}`;
}
