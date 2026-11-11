import earcut from 'earcut';

/**
 * Triangulate a 3D polygon (outer ring + holes, rings NOT closed).
 *
 * Passing 3D vertices straight to earcut (`dimensions = 3`) makes it look only at x/y, so vertical
 * or steep polygons (walls, facades, cross-sections) collapse into slivers. Here the polygon is projected onto its own best-fit plane (Newell normal) first, so any planar
 * orientation triangulates correctly. Mildly non-planar rings (draped polygons) also work as long as
 * the projection doesn't self-intersect.
 *
 * Positions must already be local (small) numbers, e.g. anchor-relative.
 *
 * @example
 * // a vertical 10 × 5 m wall
 * const tri = triangulatePolygon([[[0, 0, 0], [10, 0, 0], [10, 0, 5], [0, 0, 5]]]);
 * tri.indices.length; // 6 (two triangles)
 *
 * @param {number[][][]} rings  `[outerRing, ...holes]`, each ring a list of `[x, y, z]` positions (not closed).
 * @returns {{ vertices: number[][], indices: number[], normal: number[] } | null}  `null` for degenerate input.
 */
export function triangulatePolygon(rings) {
    const outer = rings[0];
    const normal = newellNormal(outer);
    if (!normal) return null; // degenerate (collinear / zero area)

    const [u, v] = planeBasis(normal);

    const flat = [];
    const holeIndices = [];
    const vertices = [];

    for (let r = 0; r < rings.length; r++) {
        if (r > 0) holeIndices.push(vertices.length);
        for (const p of rings[r]) {
            vertices.push(p);
            flat.push(dot(p, u), dot(p, v));
        }
    }

    const indices = earcut(flat, holeIndices.length ? holeIndices : undefined, 2);
    if (indices.length === 0) return null;

    return { vertices, indices, normal };
}

/**
 * Unit normal of a ring by Newell's method. Robust for concave and slightly non-planar rings.
 * @param {number[][]} ring  `[x, y, z]` positions.
 * @returns {number[]|null}  `null` if the ring has zero area.
 */
export function newellNormal(ring) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        nx += (a[1] - b[1]) * (a[2] + b[2]);
        ny += (a[2] - b[2]) * (a[0] + b[0]);
        nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return null;
    return [nx / len, ny / len, nz / len];
}

/**
 * @param {number[]} n
 * @returns {number[][]}
 */
function planeBasis(n) {
    // pick the world axis least aligned with n to build a stable tangent
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const ref = az < ax && az < ay ? [0, 0, 1] : ax < ay ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(cross(ref, n));
    const v = cross(n, u);
    return [u, v];
}

/** @type {(a: number[], b: number[]) => number} */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @type {(a: number[], b: number[]) => number[]} */
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @type {(a: number[]) => number[]} */
const normalize = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
