/**
 * Style function for the de-facto [simplestyle-spec](https://github.com/mapbox/simplestyle-spec),
 * as written by geojson.io, Mapbox tools and many QGIS exports. It maps `stroke`, `stroke-width`,
 * `stroke-opacity`, `fill`, `fill-opacity`, `marker-color` and `marker-size` (`small`, `medium`, `large`
 * or a number of pixels) onto {@link Style} keys.
 *
 * @example
 * new GeoJSONGroup(data, { style: simplestyle });
 * new GeoJSONGroup(data, { style: (f) => ({ ...simplestyle(f), dashed: f.properties.planned }) });
 *
 * @param {any} feature  A GeoJSON Feature.
 * @returns {import('./materials.js').Style}  A partial style containing only the keys the feature sets.
 */
export function simplestyle(feature: any): import("./materials.js").Style;
