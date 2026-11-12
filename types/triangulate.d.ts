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
export function triangulatePolygon(rings: number[][][], { mode }?: {
    mode?: "auto" | "earcut" | "repair";
}): Triangulation | null;
/**
 * Unit normal of a ring by Newell's method. Robust for concave and slightly non-planar rings.
 * @param {number[][]} ring  `[x, y, z]` positions.
 * @returns {number[]|null}  `null` if the ring has zero (net) area.
 */
export function newellNormal(ring: number[][]): number[] | null;
/**
 * Result of {@link triangulatePolygon}.
 */
export type Triangulation = {
    /**
     * `[x, y, z]` positions. Repaired polygons gain vertices where edges crossed.
     */
    vertices: number[][];
    /**
     * Three indices per triangle.
     */
    indices: number[];
    /**
     * Unit normal of the polygon's plane.
     */
    normal: number[];
    /**
     * `true` if the polygon was invalid and was triangulated by the repair path.
     */
    repaired: boolean;
};
