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
export function boundsCenter(positions) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
    }
    if (minX === Infinity) return [0, 0, 0];
    return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

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
export function toLocalFloat32(positions, anchor, target, offset = 0) {
    const out = target ?? new Float32Array(positions.length * 3);
    let i = offset;
    for (const p of positions) {
        out[i++] = p[0] - anchor[0];
        out[i++] = p[1] - anchor[1];
        out[i++] = p[2] - anchor[2];
    }
    return out;
}

/**
 * Compute the anchor for a feature record, covering all of its parts.
 * Uses the bounds center, which minimises the largest local offset (the first vertex, a common
 * alternative, is up to 2x worse for the same feature).
 */
/**
 * @param {Pick<import('./normalize.js').FeatureRecord, 'points'|'lines'|'polygons'>} record
 * @returns {number[]}
 */
export function featureAnchor(record) {
    const all = [...record.points];
    for (const l of record.lines) all.push(...l);
    for (const p of record.polygons) for (const r of p) all.push(...r);
    return boundsCenter(all);
}

/**
 * Key of the grid cell a position falls in. Used to bucket point batches.
 * @param {number[]} p  `[x, y, z]` position.
 * @param {number} cellSize  Cell size in CRS units.
 * @returns {string}
 */
export function cellKey(p, cellSize) {
    return `${Math.floor(p[0] / cellSize)},${Math.floor(p[1] / cellSize)},${Math.floor(p[2] / cellSize)}`;
}
