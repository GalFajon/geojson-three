/** @type {Record<string, number>} */
const MARKER_SIZES = { small: 7, medium: 11, large: 16 };

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
export function simplestyle(feature) {
    const p = feature?.properties ?? {};
    /** @type {import('./materials.js').Style} */
    const s = {};

    if (p.stroke != null) s.lineColor = s.strokeColor = p.stroke;
    if (p['stroke-width'] != null) s.lineWidth = s.strokeWidth = Number(p['stroke-width']);
    if (p['stroke-opacity'] != null) s.lineOpacity = Number(p['stroke-opacity']);
    if (p.fill != null) s.fillColor = p.fill;
    if (p['fill-opacity'] != null) s.fillOpacity = Number(p['fill-opacity']);
    if (p['marker-color'] != null) s.pointColor = p['marker-color'];
    if (p['marker-size'] != null) s.pointSize = MARKER_SIZES[p['marker-size']] ?? Number(p['marker-size']);

    return s;
}
