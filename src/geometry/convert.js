import { normalizeGeoJSON } from '../normalize.js';
import { Point } from './Point.js';
import { Line } from './Line.js';
import { Polygon } from './Polygon.js';

/**
 * Turn GeoJSON into editable {@link Point}, {@link Line} and {@link Polygon} objects.
 *
 * Multi-part geometries and GeometryCollections are split into one object per part. Each part gets a
 * copy of the feature's properties, and its id becomes `"<id>#<n>"` when the source feature had an id
 * and more than one part. Features without geometry are skipped. Use this for editing. To render and
 * round-trip a document unchanged, pass it to {@link GeoJSONGroup} directly.
 *
 * @example
 * const geometries = geometriesFromGeoJSON(await (await fetch('survey.geojson')).json());
 * group.addGeometries(geometries);
 *
 * @param {any} geojson  A FeatureCollection, a Feature or a bare Geometry.
 * @param {import('../normalize.js').NormalizeOptions} [options]  `defaultZ`, `transform`, `onWarning`.
 * @returns {Array<Point|Line|Polygon>}
 */
export function geometriesFromGeoJSON(geojson, options = {}) {
    /** @type {Array<Point|Line|Polygon>} */
    const out = [];
    for (const r of normalizeGeoJSON(geojson, options)) {
        const parts = r.points.length + r.lines.length + r.polygons.length;
        let n = 0;
        const config = () => {
            const id = r.id == null ? undefined : parts > 1 ? `${r.id}#${n}` : r.id;
            n++;
            return { id, properties: { ...(r.properties ?? {}) } };
        };
        for (const p of r.points) out.push(new Point(p, config()));
        for (const l of r.lines) out.push(new Line(l, config()));
        for (const poly of r.polygons) out.push(new Polygon(poly, config()));
    }
    return out;
}

/**
 * Write geometry objects out as a GeoJSON FeatureCollection.
 * @param {Iterable<import('./Geometry.js').Geometry>} geometries
 * @returns {{ type: 'FeatureCollection', features: any[] }}
 */
export function geometriesToGeoJSON(geometries) {
    return { type: 'FeatureCollection', features: [...geometries].map((g) => g.toGeoJSON()) };
}

/**
 * Save a GeoJSON object as a `.geojson` file in the browser.
 * @param {any} geojson
 * @param {string} [filename='export']  Name without extension.
 */
export function downloadGeoJSON(geojson, filename = 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
}
