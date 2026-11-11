/**
 * Normalisation of GeoJSON (RFC 7946) into render-ready feature records.
 *
 * Every input shape (FeatureCollection, Feature, bare Geometry, GeometryCollection, Multi*) reduces to
 * {@link FeatureRecord}. Coordinates stay float64 JS numbers. Precision is only reduced when
 * anchor-relative offsets are written into Float32 GPU buffers.
 * @module normalize
 */

/**
 * A position as `[x, y, z]`, always 3D after normalisation.
 * @typedef {number[]} Position
 */

/**
 * A feature flattened into renderable parts.
 *
 * @typedef {object} FeatureRecord
 * @property {number} index  Position in the input.
 * @property {string|number|undefined} id  `feature.id`.
 * @property {object|null} properties  `feature.properties`.
 * @property {any} source  The original Feature object, kept for lossless export.
 * @property {Position[]} points  Every Point / MultiPoint position.
 * @property {Position[][]} lines  Every LineString, as a list of positions.
 * @property {Position[][][]} polygons  Every Polygon as `[outerRing, ...holes]`. Rings have no closing vertex.
 */

/**
 * Options shared by {@link normalizeGeoJSON} and {@link normalizeFeature}.
 *
 * @typedef {object} NormalizeOptions
 * @property {number} [defaultZ=0]  z used for 2D positions.
 * @property {((position: number[]) => number[]) | null} [transform]  Coordinate transform applied to every
 *   position (for example proj4 lon/lat to projected metres). Receives and returns `[x, y, z]`.
 * @property {(message: string, context?: object) => void} [onWarning]  Called for invalid parts, which are skipped.
 */

const GEOMETRY_TYPES = new Set([
    'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'
]);

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
export function normalizeGeoJSON(geojson, options = {}) {
    if (!geojson || typeof geojson !== 'object') throw new TypeError('GeoJSON input must be an object');

    const ctx = {
        defaultZ: options.defaultZ ?? 0,
        transform: options.transform ?? null,
        warn: options.onWarning ?? (() => {}),
    };

    let features;
    if (geojson.type === 'FeatureCollection') {
        if (!Array.isArray(geojson.features)) throw new TypeError('FeatureCollection.features must be an array');
        features = geojson.features;
    }
    else if (geojson.type === 'Feature') features = [geojson];
    else if (GEOMETRY_TYPES.has(geojson.type)) features = [{ type: 'Feature', properties: null, geometry: geojson }];
    else throw new TypeError(`Unsupported GeoJSON type "${geojson.type}"`);

    return features.map((feature, index) => normalizeFeature(feature, index, ctx));
}

/**
 * Normalise a single Feature. Invalid parts are reported through `ctx.warn` and skipped.
 *
 * @param {any} feature  A GeoJSON Feature.
 * @param {number} index  Index stored on the record.
 * @param {{ defaultZ?: number, transform?: ((p: number[]) => number[]) | null, warn?: (message: string, context?: object) => void }} ctx
 * @returns {FeatureRecord}
 */
export function normalizeFeature(feature, index, ctx) {
    /** @type {Required<typeof ctx>} */
    const c = { defaultZ: 0, transform: null, warn: () => {}, ...ctx };
    ctx = c;

    /** @type {FeatureRecord} */
    const record = {
        index,
        id: feature?.id,
        properties: feature?.properties ?? null,
        source: feature,
        points: [],
        lines: [],
        polygons: [],
    };

    if (!feature || feature.type !== 'Feature') {
        ctx.warn(`Item ${index} is not a Feature – skipped`, { index });
        return record;
    }

    // RFC 7946 §3.2: geometry may be null (an "unlocated" feature). Keep it for export.
    if (feature.geometry == null) return record;

    collectGeometry(feature.geometry, record, ctx, 0);
    return record;
}

/**
 * @param {any} geometry
 * @param {FeatureRecord} out
 * @param {any} ctx
 * @param {number} depth
 */
function collectGeometry(geometry, out, ctx, depth) {
    const c = geometry.coordinates;

    try {
        switch (geometry.type) {
            case 'Point':
                if (Array.isArray(c) && c.length === 0) return; // empty point
                out.points.push(position(c, ctx));
                break;
            case 'MultiPoint':
                for (const p of c) out.points.push(position(p, ctx));
                break;
            case 'LineString':
                pushLine(c, out, ctx);
                break;
            case 'MultiLineString':
                for (const l of c) pushLine(l, out, ctx);
                break;
            case 'Polygon':
                pushPolygon(c, out, ctx);
                break;
            case 'MultiPolygon':
                for (const p of c) pushPolygon(p, out, ctx);
                break;
            case 'GeometryCollection':
                if (depth > 0) ctx.warn('Nested GeometryCollection (discouraged by RFC 7946 §3.1.8)', { index: out.index });
                for (const g of geometry.geometries ?? []) collectGeometry(g, out, ctx, depth + 1);
                break;
            default:
                ctx.warn(`Unsupported geometry type "${geometry.type}"`, { index: out.index });
        }
    }
    catch (e) {
        ctx.warn(`Invalid ${geometry.type} geometry in feature ${out.index}: ${e.message}`, { index: out.index });
    }
}

/**
 * @param {any} p
 * @param {any} ctx
 * @returns {Position}
 */
function position(p, ctx) {
    if (!Array.isArray(p) || p.length < 2) throw new Error('position must have at least 2 elements');
    // 4th+ ordinates (e.g. M values) are not part of RFC 7946 rendering semantics and are dropped here
    // (they remain in `source` for export).
    let v = [Number(p[0]), Number(p[1]), p.length > 2 && p[2] != null ? Number(p[2]) : ctx.defaultZ];
    if (ctx.transform) v = ctx.transform(v);
    if (!Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) throw new Error('non-finite coordinate');
    return v;
}

/**
 * @param {any[]} coords
 * @param {FeatureRecord} out
 * @param {any} ctx
 */
function pushLine(coords, out, ctx) {
    const line = coords.map((p) => position(p, ctx));
    if (line.length < 2) {
        ctx.warn(`LineString with ${line.length} position(s) skipped`, { index: out.index });
        return;
    }
    out.lines.push(line);
}

/**
 * @param {any[][]} rings
 * @param {FeatureRecord} out
 * @param {any} ctx
 */
function pushPolygon(rings, out, ctx) {
    /** @type {Position[][]} */
    const result = [];
    for (let r = 0; r < rings.length; r++) {
        const ring = rings[r].map((p) => position(p, ctx));
        stripClosingVertex(ring);
        if (ring.length < 3) {
            ctx.warn(`Polygon ring with < 3 distinct positions skipped`, { index: out.index });
            if (r === 0) return; // no exterior ring -> nothing to draw
            continue;
        }
        result.push(ring);
    }
    if (result.length) out.polygons.push(result);
}

/**
 * Remove the closing position of a ring in place. GeoJSON rings repeat the first position at the end.
 * @param {Position[]} ring
 * @returns {Position[]}  The same array.
 */
export function stripClosingVertex(ring) {
    if (ring.length > 1) {
        const a = ring[0], b = ring[ring.length - 1];
        if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) ring.pop();
    }
    return ring;
}

/**
 * Return a closed copy of a ring, as RFC 7946 §3.1.6 requires.
 * @param {number[][]} ring
 * @returns {number[][]}
 */
export function closeRing(ring) {
    if (ring.length === 0) return ring;
    const a = ring[0], b = ring[ring.length - 1];
    const closed = a.length === b.length && a.every((v, i) => v === b[i]);
    return closed ? ring.slice() : [...ring, a.slice()];
}
