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
export function triangulatePolygon(rings: number[][][]): {
    vertices: number[][];
    indices: number[];
    normal: number[];
} | null;
/**
 * Unit normal of a ring by Newell's method. Robust for concave and slightly non-planar rings.
 * @param {number[][]} ring  `[x, y, z]` positions.
 * @returns {number[]|null}  `null` if the ring has zero area.
 */
export function newellNormal(ring: number[][]): number[] | null;
