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
export function distance(a: number[], b: number[]): number;
/**
 * Midpoint of two positions.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
export function midpoint(a: number[], b: number[]): number[];
/**
 * Length of every segment of a path.
 * @param {number[][]} positions
 * @param {boolean} [closed=false]  Include the segment from the last position back to the first (for rings).
 * @returns {number[]}
 */
export function segmentLengths(positions: number[][], closed?: boolean): number[];
/**
 * Total 3D length of a path.
 * @param {number[][]} positions
 * @param {boolean} [closed=false]
 * @returns {number}
 */
export function pathLength(positions: number[][], closed?: boolean): number;
/**
 * Average of the vertices. This is a simple label anchor, not the area centroid.
 * @param {number[][]} positions
 * @returns {number[]}
 */
export function vertexCentroid(positions: number[][]): number[];
/**
 * Area of a planar ring in its own plane. Works for horizontal, tilted and vertical rings, unlike the
 * 2D shoelace formula, which only measures the footprint.
 * @param {number[][]} ring  Not closed.
 * @returns {number}
 */
export function ringArea(ring: number[][]): number;
/**
 * Area of a polygon: the outer ring minus its holes.
 * @param {number[][][]} rings  `[outer, ...holes]`, not closed.
 * @returns {number}
 */
export function polygonArea(rings: number[][][]): number;
/**
 * Point-in-ring test on x/y (the plan view).
 * @param {number[]} p
 * @param {number[][]} ring  Not closed.
 * @returns {boolean}
 */
export function pointInRing2D(p: number[], ring: number[][]): boolean;
/**
 * Whether ring `inner` lies completely inside ring `outer` in plan view: every vertex is inside and
 * no edges cross.
 * @param {number[][]} inner
 * @param {number[][]} outer
 * @returns {boolean}
 */
export function ringInsideRing2D(inner: number[][], outer: number[][]): boolean;
/**
 * Default measurement label text.
 * @param {number} value
 * @param {'length'|'area'} kind
 * @param {string} [unit='m']
 * @returns {string}
 */
export function formatMeasurement(value: number, kind: "length" | "area", unit?: string): string;
