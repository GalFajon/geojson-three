/**
 * Large-coordinate handling ("relative to anchor").
 * @module anchor
 *
 * Projected / georeferenced coordinates (national grid eastings ~ 5e5, UTM northings ~ 5e6, ECEF ~ 6.4e6) cannot be
 * stored in Float32 vertex buffers without losing centimetres to decimetres: the float32 spacing at
 * 5e6 is 0.5 m. The approach is:
 *
 *   1. pick an anchor (a float64 point near the geometry),
 *   2. subtract it in float64 and store only the small local offsets in Float32 buffers,
 *   3. put the anchor into `object.position` (float64 in JS).
 *
 * three.js multiplies `camera.matrixWorldInverse * object.matrixWorld` on the CPU in float64 when it
 * builds `modelViewMatrix`, so the two huge translations cancel *before* the matrix is uploaded as
 * float32. The GPU therefore only ever sees small numbers. This is the classic "relative to center"
 * (RTC) technique, and it works with any stock material that transforms by `modelViewMatrix`.
 *
 * Requirements for it to keep working:
 *   - Don't bake large translations into a parent that is uploaded separately as a uniform
 *     (stock three never does this; custom shaders using `modelMatrix` + `viewMatrix` separately do).
 *   - Keep each anchored object spatially compact (local extents ≲ 10 km keeps float32 error < 1 mm).
 */
/**
 * Centre of the axis-aligned bounds of a list of positions, in float64.
 * @param {Iterable<number[]>} positions  `[x, y, z]` positions.
 * @returns {number[]}  `[x, y, z]`, or `[0, 0, 0]` for an empty list.
 */
export function boundsCenter(positions: Iterable<number[]>): number[];
/**
 * Write positions relative to an anchor into a Float32Array. The subtraction happens in float64,
 * so only the small result is rounded to float32.
 *
 * @example
 * const local = toLocalFloat32([[461234.567, 101234.891, 295.1]], [461230, 101230, 295]);
 * // Float32Array [4.567, 4.891, 0.1] (approximately)
 *
 * @param {number[][]} positions  `[x, y, z]` positions.
 * @param {number[]} anchor  `[x, y, z]` anchor.
 * @param {Float32Array} [target]  Array to write into. A new one is allocated if omitted.
 * @param {number} [offset=0]  Start index, in floats, in `target`.
 * @returns {Float32Array}
 */
export function toLocalFloat32(positions: number[][], anchor: number[], target?: Float32Array, offset?: number): Float32Array;
/**
 * Compute the anchor for a feature record, covering all of its parts.
 * Uses the bounds center, which minimises the largest local offset (the first vertex, a common
 * alternative, is up to 2x worse for the same feature).
 */
/**
 * @param {Pick<import('./normalize.js').FeatureRecord, 'points'|'lines'|'polygons'>} record
 * @returns {number[]}
 */
export function featureAnchor(record: Pick<import("./normalize.js").FeatureRecord, "points" | "lines" | "polygons">): number[];
/**
 * Key of the grid cell a position falls in. Used to bucket point batches.
 * @param {number[]} p  `[x, y, z]` position.
 * @param {number} cellSize  Cell size in CRS units.
 * @returns {string}
 */
export function cellKey(p: number[], cellSize: number): string;
