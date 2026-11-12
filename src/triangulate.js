import earcut from 'earcut';
import Delaunator from 'delaunator';
import Constrainautor from '@kninnug/constrainautor';

/**
 * Result of {@link triangulatePolygon}.
 *
 * @typedef {object} Triangulation
 * @property {number[][]} vertices  `[x, y, z]` positions. Repaired polygons gain vertices where edges crossed.
 * @property {number[]} indices  Three indices per triangle.
 * @property {number[]} normal  Unit normal of the polygon's plane.
 * @property {boolean} repaired  `true` if the polygon was invalid and was triangulated by the repair path.
 */

/**
 * Triangulate a 3D polygon (outer ring plus holes, rings not closed).
 *
 * The polygon is projected onto its own best-fit plane first, so horizontal, vertical and tilted polygons all
 * triangulate correctly.
 *
 * Valid polygons are triangulated with earcut. Invalid ones are repaired: every edge is split where it crosses or
 * touches another edge, a constrained Delaunay triangulation is built over the result, and the triangles that are
 * inside the outer ring and outside every hole are kept. This covers self-intersecting rings ("bow ties"), holes
 * that cross the outer ring or each other, holes outside the shell and vertices lying on other edges.
 *
 * Positions should be local (small) numbers, for example anchor-relative.
 *
 * @example
 * // a vertical 10 × 5 m wall
 * const tri = triangulatePolygon([[[0, 0, 0], [10, 0, 0], [10, 0, 5], [0, 0, 5]]]);
 * tri.indices.length; // 6 (two triangles)
 *
 * @param {number[][][]} rings  `[outerRing, ...holes]`, each a list of `[x, y, z]` positions (not closed).
 * @param {{ mode?: 'auto'|'earcut'|'repair' }} [options]  `'auto'` (default) checks validity and repairs only
 *   when needed. `'earcut'` skips the check. `'repair'` always uses the constrained triangulation.
 * @returns {Triangulation | null}  `null` for degenerate input.
 */
export function triangulatePolygon(rings, { mode = 'auto' } = {}) {
    const outer = rings[0];
    if (!outer || outer.length < 3) return null;
    const normal = newellNormal(outer) ?? fitNormal(outer);
    if (!normal) return null; // all points collinear

    const [u, v] = planeBasis(normal);
    const rings2 = rings.map((r) => r.map((p) => [dot(p, u), dot(p, v)]));

    if (mode === 'repair' || (mode === 'auto' && !isValid(rings2))) {
        const repaired = constrainedTriangulation(rings, rings2);
        if (repaired) return { ...repaired, normal, repaired: true };
        // fall through to earcut if the repair could not be built
    }

    const flat = [];
    const holeIndices = [];
    const vertices = [];
    for (let r = 0; r < rings.length; r++) {
        if (r > 0) holeIndices.push(vertices.length);
        for (let i = 0; i < rings[r].length; i++) {
            vertices.push(rings[r][i]);
            flat.push(rings2[r][i][0], rings2[r][i][1]);
        }
    }
    const indices = earcut(flat, holeIndices.length ? holeIndices : undefined, 2);
    if (indices.length === 0) return null;
    return { vertices, indices, normal, repaired: false };
}

/**
 * Unit normal of a ring by Newell's method. Robust for concave and slightly non-planar rings.
 * @param {number[][]} ring  `[x, y, z]` positions.
 * @returns {number[]|null}  `null` if the ring has zero (net) area.
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

// ------------------------------------------------------------------------------------------ validity

/**
 * Whether rings (in 2D) form a simple polygon that earcut can triangulate: no edge crosses or touches
 * another (except neighbours sharing a vertex) and every hole starts inside the outer ring.
 * @param {number[][][]} rings2
 */
function isValid(rings2) {
    for (let r = 1; r < rings2.length; r++) {
        if (rings2[r].length && !pointInRing(rings2[r][0], rings2[0])) return false;
    }
    let ok = true;
    forEachCandidatePair(segmentsOf(rings2), (a, b) => {
        if (adjacent(a, b)) return true;
        if (intersects(a.p, a.q, b.p, b.q)) { ok = false; return false; }
        return true;
    });
    return ok;
}

/** Neighbouring segments of the same ring share a vertex by construction. */
function adjacent(a, b) {
    if (a.ring !== b.ring) return false;
    const n = a.ringLength;
    return Math.abs(a.i - b.i) === 1 || Math.abs(a.i - b.i) === n - 1;
}

// ------------------------------------------------------------------------------------------ repair

/**
 * @param {number[][][]} rings  3D rings.
 * @param {number[][][]} rings2  The same rings in plane coordinates.
 */
function constrainedTriangulation(rings, rings2) {
    const segs = segmentsOf(rings2, rings);
    if (segs.length < 3) return null;

    // 1. split parameters along each segment: crossings, T-junctions and collinear overlaps
    const eps = 1e-10;
    for (const s of segs) s.ts = [0, 1];
    forEachCandidatePair(segs, (a, b) => {
        if (adjacent(a, b)) return true;
        for (const [t, w] of splitParams(a.p, a.q, b.p, b.q)) {
            if (t > eps && t < 1 - eps) a.ts.push(t);
            if (w > eps && w < 1 - eps) b.ts.push(w);
        }
        return true;
    });

    // 2. unique points (merged within a small tolerance) and constraint edges between consecutive splits
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rings2) for (const [x, y] of r) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const q = Math.max(maxX - minX, maxY - minY, 1e-9) * 1e-10;
    /** @type {Map<string, number>} */
    const index = new Map();
    const pts2 = [];
    const pts3 = [];
    const pointId = (x, y, p3) => {
        const key = `${Math.round(x / q)},${Math.round(y / q)}`;
        let id = index.get(key);
        if (id === undefined) {
            id = pts2.length;
            index.set(key, id);
            pts2.push([x, y]);
            pts3.push(p3);
        }
        return id;
    };

    /** @type {Set<string>} */
    const edgeKeys = new Set();
    const edges = [];
    for (const s of segs) {
        const ts = [...new Set(s.ts)].sort((a, b) => a - b);
        let prev = -1;
        for (const t of ts) {
            const x = s.p[0] + t * (s.q[0] - s.p[0]);
            const y = s.p[1] + t * (s.q[1] - s.p[1]);
            const p3 = s.p3.map((c, k) => c + t * (s.q3[k] - c));
            const id = pointId(x, y, p3);
            if (prev >= 0 && prev !== id) {
                const key = prev < id ? `${prev},${id}` : `${id},${prev}`;
                if (!edgeKeys.has(key)) { edgeKeys.add(key); edges.push([prev, id]); }
            }
            prev = id;
        }
    }
    if (pts2.length < 3) return null;

    // 3. constrained Delaunay triangulation
    let del;
    try {
        del = Delaunator.from(pts2);
        const con = new (/** @type {any} */ (Constrainautor))(del); // bundled typings mis-declare the default export
        con.constrainAll(edges);
    }
    catch {
        return null;
    }

    // 4. keep triangles inside the shell and outside every hole (even-odd per ring, so bow-tie lobes count)
    const indices = [];
    const t = del.triangles;
    for (let i = 0; i < t.length; i += 3) {
        const a = pts2[t[i]], b = pts2[t[i + 1]], c = pts2[t[i + 2]];
        if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < q * q) continue; // sliver
        const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
        if (!pointInRing(centroid, rings2[0])) continue;
        let inHole = false;
        for (let r = 1; r < rings2.length && !inHole; r++) inHole = pointInRing(centroid, rings2[r]);
        if (!inHole) indices.push(t[i], t[i + 1], t[i + 2]);
    }
    if (!indices.length) return null;
    return { vertices: pts3, indices };
}

/**
 * Parameters (t along ab, w along cd) where two segments meet: a proper crossing, a T-junction, or the
 * endpoints of a collinear overlap.
 * @returns {number[][]}
 */
function splitParams(a, b, c, d) {
    const rx = b[0] - a[0], ry = b[1] - a[1];
    const sx = d[0] - c[0], sy = d[1] - c[1];
    const denom = rx * sy - ry * sx;
    const qx = c[0] - a[0], qy = c[1] - a[1];
    const len2r = rx * rx + ry * ry, len2s = sx * sx + sy * sy;
    const tol = 1e-12 * Math.max(len2r, len2s, 1e-30);

    if (Math.abs(denom) <= tol) {
        // parallel: only collinear overlaps matter
        if (Math.abs(qx * ry - qy * rx) > tol || !len2r || !len2s) return [];
        const out = [];
        const proj = (p) => ((p[0] - a[0]) * rx + (p[1] - a[1]) * ry) / len2r;
        const projS = (p) => ((p[0] - c[0]) * sx + (p[1] - c[1]) * sy) / len2s;
        for (const p of [c, d]) { const t = proj(p); if (t > 0 && t < 1) out.push([t, projS(p)]); }
        for (const p of [a, b]) { const w = projS(p); if (w > 0 && w < 1) out.push([proj(p), w]); }
        return out;
    }
    const t = (qx * sy - qy * sx) / denom;
    const w = (qx * ry - qy * rx) / denom;
    const e = 1e-12;
    return t >= -e && t <= 1 + e && w >= -e && w <= 1 + e ? [[t, w]] : [];
}

/** Whether two closed segments intersect or touch. */
function intersects(a, b, c, d) {
    return splitParams(a, b, c, d).length > 0;
}

// ------------------------------------------------------------------------------------------ helpers

/**
 * @param {number[][][]} rings2
 * @param {number[][][]} [rings3]
 */
function segmentsOf(rings2, rings3) {
    const segs = [];
    rings2.forEach((r, ring) => {
        const n = r.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            if (r[i][0] === r[j][0] && r[i][1] === r[j][1]) continue; // zero-length
            segs.push({
                ring, i, ringLength: n, p: r[i], q: r[j],
                p3: rings3?.[ring][i], q3: rings3?.[ring][j], ts: null,
            });
        }
    });
    return segs;
}

/**
 * Visit segment pairs whose bounding boxes share a grid cell (each pair once). The callback returns
 * `false` to stop early.
 */
function forEachCandidatePair(segs, fn) {
    if (segs.length < 2) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of segs) for (const p of [s.p, s.q]) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    const cells = Math.max(1, Math.ceil(Math.sqrt(segs.length)));
    const cw = Math.max((maxX - minX) / cells, 1e-12), ch = Math.max((maxY - minY) / cells, 1e-12);
    /** @type {Map<number, number[]>} */
    const grid = new Map();
    const cellOf = (x, y) => [Math.min(cells - 1, Math.floor((x - minX) / cw)), Math.min(cells - 1, Math.floor((y - minY) / ch))];
    segs.forEach((s, k) => {
        const [x0, y0] = cellOf(Math.min(s.p[0], s.q[0]), Math.min(s.p[1], s.q[1]));
        const [x1, y1] = cellOf(Math.max(s.p[0], s.q[0]), Math.max(s.p[1], s.q[1]));
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
            const key = x * cells + y;
            let list = grid.get(key);
            if (!list) grid.set(key, (list = []));
            list.push(k);
        }
    });
    /** @type {Set<number>} */
    const seen = new Set();
    for (const list of grid.values()) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
            const a = Math.min(list[i], list[j]), b = Math.max(list[i], list[j]);
            const key = a * segs.length + b;
            if (seen.has(key)) continue;
            seen.add(key);
            if (fn(segs[a], segs[b]) === false) return;
        }
    }
}

/** Even-odd point-in-ring test in 2D. */
function pointInRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/**
 * Plane normal from the spread of the vertices, for rings whose Newell normal cancels out
 * (for example a symmetric bow tie, whose two lobes wind in opposite directions).
 * @param {number[][]} ring
 * @returns {number[]|null}
 */
function fitNormal(ring) {
    const o = ring[0];
    let far = null, farD = 0;
    for (const p of ring) { const d = Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]); if (d > farD) { farD = d; far = p; } }
    if (!far) return null;
    const e = [far[0] - o[0], far[1] - o[1], far[2] - o[2]];
    let best = null, bestL = 0;
    for (const p of ring) {
        const c = cross(e, [p[0] - o[0], p[1] - o[1], p[2] - o[2]]);
        const l = Math.hypot(c[0], c[1], c[2]);
        if (l > bestL) { bestL = l; best = c; }
    }
    if (!best || bestL < 1e-12 * farD * farD) return null;
    const n = normalize(best);
    return n[2] < 0 ? [-n[0], -n[1], -n[2]] : n; // prefer upward-facing
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
