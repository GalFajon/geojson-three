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
export function geometriesFromGeoJSON(geojson: any, options?: import("../normalize.js").NormalizeOptions): Array<Point | Line | Polygon>;
/**
 * Write geometry objects out as a GeoJSON FeatureCollection.
 * @param {Iterable<import('./Geometry.js').Geometry>} geometries
 * @returns {{ type: 'FeatureCollection', features: any[] }}
 */
export function geometriesToGeoJSON(geometries: Iterable<import("./Geometry.js").Geometry>): {
    type: "FeatureCollection";
    features: any[];
};
/**
 * Save a GeoJSON object as a `.geojson` file in the browser.
 * @param {any} geojson
 * @param {string} [filename='export']  Name without extension.
 */
export function downloadGeoJSON(geojson: any, filename?: string): void;
import { Point } from './Point.js';
import { Line } from './Line.js';
import { Polygon } from './Polygon.js';
