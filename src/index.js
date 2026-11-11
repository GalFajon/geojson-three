/**
 * GeoJSON rendering and editing for three.js, with float64 anchoring for large coordinates.
 * @module geojson-three
 */
export { GeoJSONGroup } from './GeoJSONGroup.js';
export { Geometry } from './geometry/Geometry.js';
export { Point } from './geometry/Point.js';
export { Line } from './geometry/Line.js';
export { Polygon } from './geometry/Polygon.js';
export { geometriesFromGeoJSON, geometriesToGeoJSON, downloadGeoJSON } from './geometry/convert.js';
export { simplestyle } from './simplestyle.js';
export {
    distance, midpoint, segmentLengths, pathLength, vertexCentroid, ringArea, polygonArea,
    pointInRing2D, ringInsideRing2D, formatMeasurement,
} from './measure.js';
export { normalizeGeoJSON, normalizeFeature, closeRing, stripClosingVertex } from './normalize.js';
export { boundsCenter, featureAnchor, toLocalFloat32 } from './anchor.js';
export { triangulatePolygon, newellNormal } from './triangulate.js';
export {
    MaterialCache, DEFAULT_STYLE, DEFAULT_HIGHLIGHT_STYLE, createPointMaterial, pointMaterialKey, syncPointUniforms,
} from './materials.js';

/** @typedef {import('./materials.js').Style} Style */
/** @typedef {import('./GeoJSONGroup.js').GeoJSONGroupOptions} GeoJSONGroupOptions */
/** @typedef {import('./GeoJSONGroup.js').MeasurementOptions} MeasurementOptions */
/** @typedef {import('./GeoJSONGroup.js').PickResult} PickResult */
/** @typedef {import('./GeoJSONGroup.js').FeatureEvent} FeatureEvent */
/** @typedef {import('./GeoJSONGroup.js').FeatureEntry} FeatureEntry */
/** @typedef {import('./geometry/Geometry.js').GeometryConfig} GeometryConfig */
/** @typedef {import('./normalize.js').FeatureRecord} FeatureRecord */
/** @typedef {import('./normalize.js').NormalizeOptions} NormalizeOptions */
/** @typedef {import('./normalize.js').Position} Position */
