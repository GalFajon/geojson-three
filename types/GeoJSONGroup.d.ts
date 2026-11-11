/**
 * Options for {@link GeoJSONGroup}.
 *
 * @typedef {object} GeoJSONGroupOptions
 * @property {import('./materials.js').Style | ((feature: object) => import('./materials.js').Style)} [style]
 *   A partial style, or a function that returns one per feature. It is merged over `DEFAULT_STYLE`.
 * @property {import('./materials.js').Style} [highlightStyle]  Merged over a feature's style while
 *   it is highlighted. Defaults to `DEFAULT_HIGHLIGHT_STYLE`.
 * @property {number} [defaultZ=0]  z value used for 2D positions.
 * @property {(position: number[]) => number[]} [transform]  Applied to every position in float64 before
 *   anchoring, for example a proj4 reprojection. Receives and returns `[x, y, z]`.
 * @property {number} [pointCellSize=10000]  Grid cell size in CRS units used to bucket points into
 *   separately anchored draw batches. Smaller cells mean more precision and more draw calls.
 * @property {(message: string, context?: object) => void} [onWarning]  Called for skipped or invalid
 *   geometry. Defaults to `console.warn`.
 * @property {MeasurementOptions} [measurements]  Look and units of measurement labels.
 */
/**
 * Options for measurement labels (see {@link GeoJSONGroup#setShowMeasurements}).
 *
 * @typedef {object} MeasurementOptions
 * @property {string} [unit='m']  Unit suffix. Areas get a `²`.
 * @property {(value: number, kind: 'length'|'area') => string} [format]  Custom label text.
 * @property {(text: string, kind: 'length'|'area') => HTMLElement} [element]  Custom label element.
 *   Defaults to a small dark `div` with the class `geojson-three-measurement`.
 */
/**
 * Result of {@link GeoJSONGroup#featureFromIntersection}.
 *
 * @typedef {object} PickResult
 * @property {string|number} key  Key of the feature in the group (its `id`, or an internal key).
 * @property {any} feature  The source GeoJSON Feature.
 * @property {import('./geometry/Geometry.js').Geometry} [geometry]  The geometry object, for features
 *   added with {@link GeoJSONGroup#addGeometry}.
 */
/**
 * Payload of the `featureadded`, `featureupdated` and `featureremoved` events.
 *
 * @typedef {object} FeatureEvent
 * @property {'featureadded'|'featureupdated'|'featureremoved'} type
 * @property {string|number} key
 * @property {any} feature
 * @property {import('./geometry/Geometry.js').Geometry} [geometry]
 */
/**
 * @typedef {object} FeatureEntry
 * @property {string|number} key
 * @property {import('./normalize.js').FeatureRecord} record
 * @property {Required<import('./materials.js').Style>} style
 * @property {Group|null} object
 * @property {boolean} highlighted
 * @property {boolean} showMeasurements
 * @property {import('./geometry/Geometry.js').Geometry} [geometry]
 * @property {{ points: Points, index: number }[]} [pointSlots]
 */
/**
 * A `THREE.Group` that renders GeoJSON.
 *
 * Content can be added as GeoJSON (`load`, `addFeature`) or as editable geometry objects
 * (`addGeometry` with {@link Point}, {@link Line} and {@link Polygon}). Both end up as features
 * addressed by a key.
 *
 * Each feature with lines or polygons becomes a child `Group` positioned at a float64 anchor (the bounds
 * centre of the feature). Its buffers hold only float32 offsets from that anchor. Points from all
 * features are bucketed into batches per style and grid cell, each with its own anchor. three.js builds
 * `modelViewMatrix` in float64, so large coordinates (national grids, UTM, ECEF) render without
 * float32 jitter.
 *
 * The group itself must stay at the identity transform. Inherited `Group` / `Object3D` members are
 * documented in the [three.js docs](https://threejs.org/docs/#api/en/objects/Group).
 *
 * Events: `featureadded`, `featureupdated` and `featureremoved` (see {@link FeatureEvent}).
 *
 * @noInheritDoc
 *
 * @example
 * const geo = new GeoJSONGroup(featureCollection, {
 *     style: (f) => ({ lineColor: f.properties.color ?? '#2563c9', fillOpacity: 0.4 }),
 * });
 * scene.add(geo);
 *
 * const hit = raycaster.intersectObject(geo, true)[0];
 * const picked = geo.featureFromIntersection(hit);
 * if (picked) geo.setHighlighted(picked.key, true);
 *
 * @example
 * // editable geometry objects
 * const parcel = geo.addGeometry(new Polygon([[[0, 0, 0], [60, 0, 0], [60, 40, 0], [0, 40, 0]]]));
 * parcel.vectors[2] = [64, 42, 0];
 * parcel.update();
 * parcel.setShowMeasurements(true);  // needs a CSS2DRenderer
 */
export class GeoJSONGroup extends Group<import("three").Object3DEventMap> {
    /**
     * @param {object} [geojson]  A FeatureCollection, a Feature or a bare Geometry.
     * @param {GeoJSONGroupOptions} [options]
     */
    constructor(geojson?: object, options?: GeoJSONGroupOptions);
    type: string;
    /** @readonly */
    readonly isGeoJSONGroup: boolean;
    /** Resolved options. */
    options: {
        style: import("./materials.js").Style | ((feature: object) => import("./materials.js").Style);
        highlightStyle: {
            /**
             * Fill colour of points.
             */
            pointColor?: import("three").ColorRepresentation;
            /**
             * Point diameter. Pixels when `pointSizeUnits` is `'pixels'`, CRS units
             * (for example metres) when it is `'world'`.
             */
            pointSize?: number;
            /**
             * `'pixels'` keeps a constant on-screen size.
             * `'world'` gives points a real-world diameter, so they grow and shrink with camera zoom.
             */
            pointSizeUnits?: "pixels" | "world";
            /**
             * Lower clamp in pixels for `'world'` sized points.
             */
            pointMinSize?: number;
            /**
             * Upper clamp in pixels for `'world'` sized points.
             */
            pointMaxSize?: number;
            /**
             * Outline colour.
             * Use `null` for plain discs. Points that share size settings, outline and texture share one draw batch,
             * whatever their fill colour.
             */
            pointOutlineColor?: import("three").ColorRepresentation | null;
            /**
             * Outline width in pixels.
             */
            pointOutlineWidth?: number;
            /**
             * Image drawn for each point instead of a disc
             * (for example an icon from `TextureLoader`, or a canvas). The image is multiplied by `pointColor`, so use
             * white for an untinted image. Transparent pixels are discarded.
             */
            pointTexture?: import("three").Texture | null;
            /**
             * Colour of LineString parts.
             */
            lineColor?: import("three").ColorRepresentation;
            /**
             * Line width in pixels, or CRS units when `worldUnits` is true.
             */
            lineWidth?: number;
            /**
             * Line opacity, 0–1.
             */
            lineOpacity?: number;
            /**
             * Draw lines dashed.
             */
            dashed?: boolean;
            /**
             * Dash length in CRS units.
             */
            dashSize?: number;
            /**
             * Gap length in CRS units.
             */
            gapSize?: number;
            /**
             * Interpret `lineWidth` in CRS units.
             */
            worldUnits?: boolean;
            /**
             * Polygon fill colour.
             */
            fillColor?: import("three").ColorRepresentation;
            /**
             * Polygon fill opacity, 0–1.
             */
            fillOpacity?: number;
            /**
             * Polygon outline colour.
             */
            strokeColor?: import("three").ColorRepresentation;
            /**
             * Polygon outline width in pixels. `0` disables outlines.
             */
            strokeWidth?: number;
            /**
             * Depth-test against the rest of the scene.
             */
            depthTest?: boolean;
        };
        defaultZ: number;
        transform: (position: number[]) => number[];
        pointCellSize: number;
        onWarning: (message: string, context?: object) => void;
        measurements: {
            /**
             * Unit suffix. Areas get a `²`.
             */
            unit: string;
            /**
             * Custom label text.
             */
            format?: (value: number, kind: "length" | "area") => string;
            /**
             * Custom label element.
             * Defaults to a small dark `div` with the class `geojson-three-measurement`.
             */
            element?: (text: string, kind: "length" | "area") => HTMLElement;
        };
    };
    /** Shared, style-keyed material cache. */
    materials: MaterialCache;
    /**
     * Features in insertion order, by key.
     * @type {Map<string|number, FeatureEntry>}
     */
    entries: Map<string | number, FeatureEntry>;
    /**
     * Current point draw batches. They are rebuilt whenever points change.
     * @type {Points[]}
     */
    pointBatches: Points[];
    /**
     * Foreign members of the loaded FeatureCollection (for example `crs` or `name`), kept for export.
     * @type {Record<string, unknown>}
     */
    foreignMembers: Record<string, unknown>;
    /**
     * Whether measurement labels are shown for every feature. Change it with {@link GeoJSONGroup#setShowMeasurements}.
     * @type {boolean}
     */
    showMeasurements: boolean;
    /**
     * `false` while {@link GeoJSONGroup#setDepthTest} has disabled depth testing.
     * @type {boolean}
     */
    depthTest: boolean;
    /**
     * Add every feature in a GeoJSON object to the group.
     * @param {any} geojson  A FeatureCollection, a Feature or a bare Geometry.
     * @returns {this}
     */
    load(geojson: any): this;
    /**
     * Add a single GeoJSON feature.
     * @param {any} feature  A GeoJSON Feature.
     * @returns {string|number}  The key used to address the feature.
     */
    addFeature(feature: any): string | number;
    /**
     * Replace a feature's geometry, properties and style, and rebuild only that feature
     * (plus the point batches). Highlight and measurement state are kept. This is cheap enough to call
     * every frame for a few moving features.
     * @param {string|number} key
     * @param {any} feature  The new GeoJSON Feature.
     */
    updateFeature(key: string | number, feature: any): void;
    /**
     * Remove a feature (or geometry object, by key).
     * @param {string|number} key
     * @returns {boolean}  `false` if no feature has that key.
     */
    removeFeature(key: string | number): boolean;
    /**
     * The GeoJSON Feature for a key. For geometry objects this is the feature as of their last `update()`.
     * @param {string|number} key
     * @returns {any}
     */
    getFeature(key: string | number): any;
    /**
     * Add an editable geometry object. Its `id` becomes its key. A geometry can only be in one group;
     * adding it here removes it from its previous group.
     * @template {import('./geometry/Geometry.js').Geometry} T
     * @param {T} geometry
     * @returns {T}  The same geometry, for chaining.
     */
    addGeometry<T extends import("./geometry/Geometry.js").Geometry>(geometry: T): T;
    /**
     * Add several geometry objects, rebuilding the point batches once.
     * @param {Iterable<import('./geometry/Geometry.js').Geometry>} geometries
     * @returns {this}
     */
    addGeometries(geometries: Iterable<import("./geometry/Geometry.js").Geometry>): this;
    /**
     * Remove a geometry object from the group.
     * @param {import('./geometry/Geometry.js').Geometry} geometry
     * @returns {boolean}
     */
    removeGeometry(geometry: import("./geometry/Geometry.js").Geometry): boolean;
    /**
     * Re-render a geometry object after its vectors, properties or style changed. `geometry.update()`
     * calls this.
     * @param {import('./geometry/Geometry.js').Geometry} geometry
     */
    updateGeometry(geometry: import("./geometry/Geometry.js").Geometry): void;
    /**
     * The geometry object for a key, if the feature was added with {@link GeoJSONGroup#addGeometry}.
     * @param {string|number} key
     * @returns {import('./geometry/Geometry.js').Geometry | undefined}
     */
    getGeometry(key: string | number): import("./geometry/Geometry.js").Geometry | undefined;
    /**
     * All geometry objects in the group, in insertion order.
     * @type {import('./geometry/Geometry.js').Geometry[]}
     */
    get geometries(): import("./geometry/Geometry.js").Geometry[];
    /**
     * Switch a feature to or from the highlight style.
     * @param {string|number|import('./geometry/Geometry.js').Geometry} keyOrGeometry
     * @param {boolean} [highlighted=true]
     */
    setHighlighted(keyOrGeometry: string | number | import("./geometry/Geometry.js").Geometry, highlighted?: boolean): void;
    /**
     * Show or hide measurement labels: segment lengths on lines and polygon edges, plus polygon areas.
     * Without `key` this applies to every feature in the group. With `key` it applies to one feature.
     *
     * Labels are `CSS2DObject`s placed at float64-accurate positions. Render the scene with a
     * `CSS2DRenderer` as well (see `three/addons/renderers/CSS2DRenderer.js`) to see them.
     *
     * @param {boolean} show
     * @param {string|number|import('./geometry/Geometry.js').Geometry} [keyOrGeometry]
     */
    setShowMeasurements(show: boolean, keyOrGeometry?: string | number | import("./geometry/Geometry.js").Geometry): void;
    /**
     * Turn depth testing on or off for the whole group. With it off, features draw on top of the rest of
     * the scene (point clouds, meshes), which is useful for editing and measuring.
     * @param {boolean} enabled
     */
    setDepthTest(enabled: boolean): void;
    /**
     * Find the feature that a `Raycaster` intersection belongs to. Works for hits on
     * lines, polygon fills and outlines, and individual points inside a batch.
     *
     * Raycasting fat lines needs `raycaster.camera` to be set (`setFromCamera` does this).
     * @param {import('three').Intersection | null | undefined} hit
     * @returns {PickResult|null}
     */
    featureFromIntersection(hit: import("three").Intersection | null | undefined): PickResult | null;
    /**
     * World-space bounds of all features, computed from the float64 source coordinates.
     * @param {Box3} [target]
     * @returns {Box3}
     */
    getBoundingBox(target?: Box3): Box3;
    /**
     * Export the group as an RFC 7946 FeatureCollection. GeoJSON features are returned unchanged:
     * float64 coordinates, original types such as `MultiPolygon` or `GeometryCollection`, ids,
     * properties and foreign members are all kept. Geometry objects are exported as they are now.
     * Polygon rings are closed if the source left them open.
     * @param {{ bbox?: boolean }} [options]  `bbox: true` adds a 3D `bbox` member.
     * @returns {any}  A FeatureCollection.
     */
    toGeoJSON({ bbox }?: {
        bbox?: boolean;
    }): any;
    #private;
}
/**
 * Options for {@link GeoJSONGroup}.
 */
export type GeoJSONGroupOptions = {
    /**
     * A partial style, or a function that returns one per feature. It is merged over `DEFAULT_STYLE`.
     */
    style?: import("./materials.js").Style | ((feature: object) => import("./materials.js").Style);
    /**
     * Merged over a feature's style while
     * it is highlighted. Defaults to `DEFAULT_HIGHLIGHT_STYLE`.
     */
    highlightStyle?: import("./materials.js").Style;
    /**
     * z value used for 2D positions.
     */
    defaultZ?: number;
    /**
     * Applied to every position in float64 before
     * anchoring, for example a proj4 reprojection. Receives and returns `[x, y, z]`.
     */
    transform?: (position: number[]) => number[];
    /**
     * Grid cell size in CRS units used to bucket points into
     * separately anchored draw batches. Smaller cells mean more precision and more draw calls.
     */
    pointCellSize?: number;
    /**
     * Called for skipped or invalid
     * geometry. Defaults to `console.warn`.
     */
    onWarning?: (message: string, context?: object) => void;
    /**
     * Look and units of measurement labels.
     */
    measurements?: MeasurementOptions;
};
/**
 * Options for measurement labels (see {@link GeoJSONGroup#setShowMeasurements}).
 */
export type MeasurementOptions = {
    /**
     * Unit suffix. Areas get a `²`.
     */
    unit?: string;
    /**
     * Custom label text.
     */
    format?: (value: number, kind: "length" | "area") => string;
    /**
     * Custom label element.
     * Defaults to a small dark `div` with the class `geojson-three-measurement`.
     */
    element?: (text: string, kind: "length" | "area") => HTMLElement;
};
/**
 * Result of {@link GeoJSONGroup#featureFromIntersection}.
 */
export type PickResult = {
    /**
     * Key of the feature in the group (its `id`, or an internal key).
     */
    key: string | number;
    /**
     * The source GeoJSON Feature.
     */
    feature: any;
    /**
     * The geometry object, for features
     * added with {@link GeoJSONGroup#addGeometry}.
     */
    geometry?: import("./geometry/Geometry.js").Geometry;
};
/**
 * Payload of the `featureadded`, `featureupdated` and `featureremoved` events.
 */
export type FeatureEvent = {
    type: "featureadded" | "featureupdated" | "featureremoved";
    key: string | number;
    feature: any;
    geometry?: import("./geometry/Geometry.js").Geometry;
};
export type FeatureEntry = {
    key: string | number;
    record: import("./normalize.js").FeatureRecord;
    style: Required<import("./materials.js").Style>;
    object: Group | null;
    highlighted: boolean;
    showMeasurements: boolean;
    geometry?: import("./geometry/Geometry.js").Geometry;
    pointSlots?: {
        points: Points;
        index: number;
    }[];
};
import { Group } from 'three';
import { MaterialCache } from './materials.js';
import { Points } from 'three';
import { Box3 } from 'three';
