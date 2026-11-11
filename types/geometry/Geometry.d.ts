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
    /** @param {GeometryConfig} [config] */
    constructor(config?: GeometryConfig);
    /**
     * Geometry type: `'Point'`, `'Line'` or `'Polygon'`.
     * @type {string}
     */
    type: string;
    /** @type {any} */
    vectors: any;
    /**
     * Whether measurement labels are shown for this geometry. Change it with {@link Geometry#setShowMeasurements}.
     * @type {boolean}
     */
    showMeasurements: boolean;
    /**
     * The group this geometry is rendered in, or `null`.
     * @type {import('../GeoJSONGroup.js').GeoJSONGroup | null}
     */
    group: import("../GeoJSONGroup.js").GeoJSONGroup | null;
    /** Feature id. It is also the geometry's key in its group. @type {string|number} */
    id: string | number;
    /** Feature properties. @type {Record<string, any>} */
    properties: Record<string, any>;
    /** Optional per-geometry style. @type {import('../materials.js').Style | null} */
    style: import("../materials.js").Style | null;
    /**
     * Re-render the geometry after its `vectors`, `holes`, `properties` or `style` changed.
     * Does nothing if the geometry is not in a group.
     * @returns {this}
     */
    update(): this;
    /**
     * Show or hide measurement labels: segment lengths for lines and polygons, plus area for polygons.
     * Labels are `CSS2DObject`s, so the scene must also be rendered with a `CSS2DRenderer`.
     * @param {boolean} show
     * @returns {this}
     */
    setShowMeasurements(show: boolean): this;
    /**
     * Total 3D length along the vertices.
     * @returns {number}
     */
    calculateLength(): number;
    /**
     * 3D length of each segment.
     * @returns {number[]}
     */
    calculateSegmentLengths(): number[];
    /**
     * Midpoint of two positions.
     * @param {number[]} v1
     * @param {number[]} v2
     * @returns {number[]}
     */
    calculateMidpoint(v1: number[], v2: number[]): number[];
    /**
     * Average of the vertices (the position itself for a point).
     * @returns {number[]}
     */
    calculateCentroid(): number[];
    /**
     * Area. `0` except for polygons.
     * @returns {number}
     */
    calculateArea(): number;
    /**
     * The geometry as a GeoJSON Feature (polygon rings closed).
     * @returns {{ type: 'Feature', id: string|number, properties: Record<string, any>, geometry: any }}
     */
    toGeoJSON(): {
        type: "Feature";
        id: string | number;
        properties: Record<string, any>;
        geometry: any;
    };
    /**
     * GeoJSON geometry object. Implemented by subclasses.
     * @protected
     * @returns {any}
     */
    protected geoJSONGeometry(): any;
}
/**
 * Options shared by the geometry constructors.
 */
export type GeometryConfig = {
    /**
     * Feature id. A unique id is generated when omitted.
     */
    id?: string | number;
    /**
     * Feature properties.
     */
    properties?: Record<string, any>;
    /**
     * Per-geometry style, merged over the group's style.
     */
    style?: import("../materials.js").Style;
};
