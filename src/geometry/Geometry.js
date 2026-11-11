import { pathLength, segmentLengths, midpoint, vertexCentroid } from '../measure.js';

let nextId = 1;

/**
 * Options shared by the geometry constructors.
 *
 * @typedef {object} GeometryConfig
 * @property {string|number} [id]  Feature id. A unique id is generated when omitted.
 * @property {Record<string, any>} [properties]  Feature properties.
 * @property {import('../materials.js').Style} [style]  Per-geometry style, merged over the group's style.
 */

/**
 * Base class of the editable geometry objects ({@link Point}, {@link Line}, {@link Polygon}).
 *
 * A geometry is a mutable feature: change `vectors` (and `holes` on polygons), then call `update()`
 * to re-render it in the {@link GeoJSONGroup} it belongs to. Coordinates are plain float64 arrays in
 * the group's CRS.
 *
 * @example
 * const line = new Line([[512300, 5102400, 295], [512340, 5102410, 296]], { properties: { name: 'axis' } });
 * group.addGeometry(line);
 *
 * line.vectors.push([512360, 5102450, 297]);
 * line.update();
 * line.calculateLength(); // metres
 */
export class Geometry {
    /**
     * Geometry type: `'Point'`, `'Line'` or `'Polygon'`.
     * @type {string}
     */
    type = 'Geometry';

    /** @type {any} */
    vectors = [];

    /**
     * Whether measurement labels are shown for this geometry. Change it with {@link Geometry#setShowMeasurements}.
     * @type {boolean}
     */
    showMeasurements = false;

    /**
     * The group this geometry is rendered in, or `null`.
     * @type {import('../GeoJSONGroup.js').GeoJSONGroup | null}
     */
    group = null;

    /** @param {GeometryConfig} [config] */
    constructor(config = {}) {
        /** Feature id. It is also the geometry's key in its group. @type {string|number} */
        this.id = config.id ?? `geometry-${nextId++}`;
        /** Feature properties. @type {Record<string, any>} */
        this.properties = config.properties ?? {};
        /** Optional per-geometry style. @type {import('../materials.js').Style | null} */
        this.style = config.style ?? null;
    }

    /**
     * Re-render the geometry after its `vectors`, `holes`, `properties` or `style` changed.
     * Does nothing if the geometry is not in a group.
     * @returns {this}
     */
    update() {
        this.group?.updateGeometry(this);
        return this;
    }

    /**
     * Show or hide measurement labels: segment lengths for lines and polygons, plus area for polygons.
     * Labels are `CSS2DObject`s, so the scene must also be rendered with a `CSS2DRenderer`.
     * @param {boolean} show
     * @returns {this}
     */
    setShowMeasurements(show) {
        this.showMeasurements = show;
        this.group?.setShowMeasurements(show, this.id);
        return this;
    }

    /**
     * Total 3D length along the vertices.
     * @returns {number}
     */
    calculateLength() {
        return Array.isArray(this.vectors[0]) ? pathLength(this.vectors) : 0;
    }

    /**
     * 3D length of each segment.
     * @returns {number[]}
     */
    calculateSegmentLengths() {
        return Array.isArray(this.vectors[0]) ? segmentLengths(this.vectors) : [];
    }

    /**
     * Midpoint of two positions.
     * @param {number[]} v1
     * @param {number[]} v2
     * @returns {number[]}
     */
    calculateMidpoint(v1, v2) {
        return midpoint(v1, v2);
    }

    /**
     * Average of the vertices (the position itself for a point).
     * @returns {number[]}
     */
    calculateCentroid() {
        return Array.isArray(this.vectors[0]) ? vertexCentroid(this.vectors) : [...this.vectors];
    }

    /**
     * Area. `0` except for polygons.
     * @returns {number}
     */
    calculateArea() {
        return 0;
    }

    /**
     * The geometry as a GeoJSON Feature (polygon rings closed).
     * @returns {{ type: 'Feature', id: string|number, properties: Record<string, any>, geometry: any }}
     */
    toGeoJSON() {
        return { type: 'Feature', id: this.id, properties: this.properties, geometry: this.geoJSONGeometry() };
    }

    /**
     * GeoJSON geometry object. Implemented by subclasses.
     * @protected
     * @returns {any}
     */
    geoJSONGeometry() {
        throw new Error('geoJSONGeometry() must be implemented by subclasses');
    }
}
