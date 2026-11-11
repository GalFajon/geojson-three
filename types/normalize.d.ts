/**
 * Flatten a GeoJSON object into one {@link FeatureRecord} per feature. Useful for analysis or
 * custom renderers. {@link GeoJSONGroup} uses it internally.
 *
 * @example
 * const [record] = normalizeGeoJSON({ type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] }, { defaultZ: 300 });
 * record.points; // [[1, 2, 300], [3, 4, 300]]
 *
 * @param {any} geojson  A FeatureCollection, a Feature or a bare Geometry.
 * @param {NormalizeOptions} [options]
 * @returns {FeatureRecord[]}
 * @throws {TypeError} If the input is not a GeoJSON object.
 */
export function normalizeGeoJSON(geojson: any, options?: NormalizeOptions): FeatureRecord[];
/**
 * Normalise a single Feature. Invalid parts are reported through `ctx.warn` and skipped.
 *
 * @param {any} feature  A GeoJSON Feature.
 * @param {number} index  Index stored on the record.
 * @param {{ defaultZ?: number, transform?: ((p: number[]) => number[]) | null, warn?: (message: string, context?: object) => void }} ctx
 * @returns {FeatureRecord}
 */
export function normalizeFeature(feature: any, index: number, ctx: {
    defaultZ?: number;
    transform?: ((p: number[]) => number[]) | null;
    warn?: (message: string, context?: object) => void;
}): FeatureRecord;
/**
 * Remove the closing position of a ring in place. GeoJSON rings repeat the first position at the end.
 * @param {Position[]} ring
 * @returns {Position[]}  The same array.
 */
export function stripClosingVertex(ring: Position[]): Position[];
/**
 * Return a closed copy of a ring, as RFC 7946 §3.1.6 requires.
 * @param {number[][]} ring
 * @returns {number[][]}
 */
export function closeRing(ring: number[][]): number[][];
/**
 * A position as `[x, y, z]`, always 3D after normalisation.
 */
export type Position = number[];
/**
 * A feature flattened into renderable parts.
 */
export type FeatureRecord = {
    /**
     * Position in the input.
     */
    index: number;
    /**
     * `feature.id`.
     */
    id: string | number | undefined;
    /**
     * `feature.properties`.
     */
    properties: object | null;
    /**
     * The original Feature object, kept for lossless export.
     */
    source: any;
    /**
     * Every Point / MultiPoint position.
     */
    points: Position[];
    /**
     * Every LineString, as a list of positions.
     */
    lines: Position[][];
    /**
     * Every Polygon as `[outerRing, ...holes]`. Rings have no closing vertex.
     */
    polygons: Position[][][];
};
/**
 * Options shared by {@link normalizeGeoJSON} and {@link normalizeFeature}.
 */
export type NormalizeOptions = {
    /**
     * z used for 2D positions.
     */
    defaultZ?: number;
    /**
     * Coordinate transform applied to every
     * position (for example proj4 lon/lat to projected metres). Receives and returns `[x, y, z]`.
     */
    transform?: ((position: number[]) => number[]) | null;
    /**
     * Called for invalid parts, which are skipped.
     */
    onWarning?: (message: string, context?: object) => void;
};
