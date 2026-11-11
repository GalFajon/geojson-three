import {
    Box3, BufferAttribute, BufferGeometry, Color, Group, Mesh, Points, Vector3,
} from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { normalizeFeature, closeRing } from './normalize.js';
import { boundsCenter, featureAnchor, cellKey, toLocalFloat32 } from './anchor.js';
import { triangulatePolygon } from './triangulate.js';
import {
    MaterialCache, DEFAULT_STYLE, DEFAULT_HIGHLIGHT_STYLE, pointMaterialKey, syncPointUniforms,
} from './materials.js';
import { midpoint, distance, polygonArea, vertexCentroid, formatMeasurement } from './measure.js';

let uid = 0;

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
export class GeoJSONGroup extends Group {
    /**
     * @param {object} [geojson]  A FeatureCollection, a Feature or a bare Geometry.
     * @param {GeoJSONGroupOptions} [options]
     */
    constructor(geojson, options = {}) {
        super();
        this.type = 'GeoJSONGroup';
        /** @readonly */
        this.isGeoJSONGroup = true;

        /** Resolved options. */
        this.options = {
            style: options.style ?? {},
            highlightStyle: { ...DEFAULT_HIGHLIGHT_STYLE, ...options.highlightStyle },
            defaultZ: options.defaultZ ?? 0,
            transform: options.transform ?? null,
            pointCellSize: options.pointCellSize ?? 10_000,
            onWarning: options.onWarning ?? ((/** @type {string} */ m) => console.warn(`[geojson-three] ${m}`)),
            measurements: { unit: 'm', ...options.measurements },
        };

        /** Shared, style-keyed material cache. */
        this.materials = new MaterialCache();
        /**
         * Features in insertion order, by key.
         * @type {Map<string|number, FeatureEntry>}
         */
        this.entries = new Map();
        /**
         * Current point draw batches. They are rebuilt whenever points change.
         * @type {Points[]}
         */
        this.pointBatches = [];
        /**
         * Foreign members of the loaded FeatureCollection (for example `crs` or `name`), kept for export.
         * @type {Record<string, unknown>}
         */
        this.foreignMembers = {};
        /**
         * Whether measurement labels are shown for every feature. Change it with {@link GeoJSONGroup#setShowMeasurements}.
         * @type {boolean}
         */
        this.showMeasurements = false;
        /**
         * `false` while {@link GeoJSONGroup#setDepthTest} has disabled depth testing.
         * @type {boolean}
         */
        this.depthTest = true;

        if (geojson) this.load(geojson);
    }

    // ------------------------------------------------------------------ GeoJSON features

    /**
     * Add every feature in a GeoJSON object to the group.
     * @param {any} geojson  A FeatureCollection, a Feature or a bare Geometry.
     * @returns {this}
     */
    load(geojson) {
        const features = geojson.type === 'FeatureCollection' ? geojson.features
            : geojson.type === 'Feature' ? [geojson]
            : [{ type: 'Feature', properties: null, geometry: geojson }];

        if (geojson.type === 'FeatureCollection') {
            const { type, features: _f, ...rest } = geojson;
            this.foreignMembers = rest;
        }

        for (const f of features) this.#addEntry(f);
        this.#rebuildPoints();
        return this;
    }

    /**
     * Add a single GeoJSON feature.
     * @param {any} feature  A GeoJSON Feature.
     * @returns {string|number}  The key used to address the feature.
     */
    addFeature(feature) {
        const key = this.#addEntry(feature);
        this.#rebuildPoints();
        return key;
    }

    /**
     * Replace a feature's geometry, properties and style, and rebuild only that feature
     * (plus the point batches). Highlight and measurement state are kept. This is cheap enough to call
     * every frame for a few moving features.
     * @param {string|number} key
     * @param {any} feature  The new GeoJSON Feature.
     */
    updateFeature(key, feature) {
        const entry = this.entries.get(key);
        if (!entry) throw new Error(`No feature with key ${key}`);
        this.#disposeEntryObject(entry);
        entry.record = this.#normalize(feature, entry.record.index);
        entry.style = this.#resolveStyle(feature, entry.geometry);
        this.#buildEntryObject(entry);
        this.#rebuildPoints();
        this.#emit('featureupdated', entry);
    }

    /**
     * Remove a feature (or geometry object, by key).
     * @param {string|number} key
     * @returns {boolean}  `false` if no feature has that key.
     */
    removeFeature(key) {
        const entry = this.entries.get(key);
        if (!entry) return false;
        this.#disposeEntryObject(entry);
        this.entries.delete(key);
        if (entry.geometry) entry.geometry.group = null;
        this.#rebuildPoints();
        this.#emit('featureremoved', entry);
        return true;
    }

    /**
     * The GeoJSON Feature for a key. For geometry objects this is the feature as of their last `update()`.
     * @param {string|number} key
     * @returns {any}
     */
    getFeature(key) {
        return this.entries.get(key)?.record.source;
    }

    // ------------------------------------------------------------------ geometry objects

    /**
     * Add an editable geometry object. Its `id` becomes its key. A geometry can only be in one group;
     * adding it here removes it from its previous group.
     * @template {import('./geometry/Geometry.js').Geometry} T
     * @param {T} geometry
     * @returns {T}  The same geometry, for chaining.
     */
    addGeometry(geometry) {
        this.#attachGeometry(geometry);
        this.#rebuildPoints();
        return geometry;
    }

    /**
     * Add several geometry objects, rebuilding the point batches once.
     * @param {Iterable<import('./geometry/Geometry.js').Geometry>} geometries
     * @returns {this}
     */
    addGeometries(geometries) {
        for (const g of geometries) this.#attachGeometry(g);
        this.#rebuildPoints();
        return this;
    }

    /**
     * Remove a geometry object from the group.
     * @param {import('./geometry/Geometry.js').Geometry} geometry
     * @returns {boolean}
     */
    removeGeometry(geometry) {
        return geometry.group === this ? this.removeFeature(geometry.id) : false;
    }

    /**
     * Re-render a geometry object after its vectors, properties or style changed. `geometry.update()`
     * calls this.
     * @param {import('./geometry/Geometry.js').Geometry} geometry
     */
    updateGeometry(geometry) {
        if (geometry.group !== this) throw new Error(`Geometry ${geometry.id} is not in this group`);
        this.updateFeature(geometry.id, geometry.toGeoJSON());
    }

    /**
     * The geometry object for a key, if the feature was added with {@link GeoJSONGroup#addGeometry}.
     * @param {string|number} key
     * @returns {import('./geometry/Geometry.js').Geometry | undefined}
     */
    getGeometry(key) {
        return this.entries.get(key)?.geometry;
    }

    /**
     * All geometry objects in the group, in insertion order.
     * @type {import('./geometry/Geometry.js').Geometry[]}
     */
    get geometries() {
        return [...this.entries.values()].flatMap((e) => (e.geometry ? [e.geometry] : []));
    }

    // ------------------------------------------------------------------ styling / picking

    /**
     * Switch a feature to or from the highlight style.
     * @param {string|number|import('./geometry/Geometry.js').Geometry} keyOrGeometry
     * @param {boolean} [highlighted=true]
     */
    setHighlighted(keyOrGeometry, highlighted = true) {
        const entry = this.entries.get(keyOf(keyOrGeometry));
        if (!entry || entry.highlighted === highlighted) return;
        entry.highlighted = highlighted;

        const style = this.#effectiveStyle(entry);
        if (entry.object) {
            for (const child of entry.object.children) {
                const c = /** @type {Mesh} */ (child);
                if (c.userData.role === 'line') c.material = this.materials.line(style);
                else if (c.userData.role === 'fill') c.material = this.materials.fill(style);
                else if (c.userData.role === 'stroke') c.material = this.materials.stroke(style);
            }
        }
        if (entry.record.points.length) this.#recolorPoints(entry);
    }

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
    setShowMeasurements(show, keyOrGeometry) {
        if (keyOrGeometry === undefined) {
            this.showMeasurements = show;
            for (const e of this.entries.values()) this.#rebuildEntry(e);
            return;
        }
        const entry = this.entries.get(keyOf(keyOrGeometry));
        if (!entry || entry.showMeasurements === show) return;
        entry.showMeasurements = show;
        if (entry.geometry) entry.geometry.showMeasurements = show;
        this.#rebuildEntry(entry);
    }

    /**
     * Turn depth testing on or off for the whole group. With it off, features draw on top of the rest of
     * the scene (point clouds, meshes), which is useful for editing and measuring.
     * @param {boolean} enabled
     */
    setDepthTest(enabled) {
        if (this.depthTest === enabled) return;
        this.depthTest = enabled;
        for (const e of this.entries.values()) {
            e.style = this.#resolveStyle(e.record.source, e.geometry);
            this.#rebuildEntry(e);
        }
        this.#rebuildPoints();
    }

    /**
     * Find the feature that a `Raycaster` intersection belongs to. Works for hits on
     * lines, polygon fills and outlines, and individual points inside a batch.
     *
     * Raycasting fat lines needs `raycaster.camera` to be set (`setFromCamera` does this).
     * @param {import('three').Intersection | null | undefined} hit
     * @returns {PickResult|null}
     */
    featureFromIntersection(hit) {
        if (!hit?.object) return null;
        /** @type {string|number|undefined} */
        let key;
        if (hit.object.userData.role === 'points') key = hit.object.userData.refs[hit.index ?? -1]?.key;
        else {
            for (let o = /** @type {import('three').Object3D|null} */ (hit.object); o && o !== this; o = o.parent) {
                if (o.userData.featureKey !== undefined) { key = o.userData.featureKey; break; }
            }
        }
        const entry = key === undefined ? undefined : this.entries.get(key);
        return entry ? { key: entry.key, feature: entry.record.source, geometry: entry.geometry } : null;
    }

    /**
     * World-space bounds of all features, computed from the float64 source coordinates.
     * @param {Box3} [target]
     * @returns {Box3}
     */
    getBoundingBox(target = new Box3()) {
        target.makeEmpty();
        const v = new Vector3();
        for (const { record } of this.entries.values()) {
            for (const p of record.points) target.expandByPoint(v.set(p[0], p[1], p[2]));
            for (const l of record.lines) for (const p of l) target.expandByPoint(v.set(p[0], p[1], p[2]));
            for (const poly of record.polygons) for (const p of poly[0]) target.expandByPoint(v.set(p[0], p[1], p[2]));
        }
        return target;
    }

    // ------------------------------------------------------------------ export

    /**
     * Export the group as an RFC 7946 FeatureCollection. GeoJSON features are returned unchanged:
     * float64 coordinates, original types such as `MultiPolygon` or `GeometryCollection`, ids,
     * properties and foreign members are all kept. Geometry objects are exported as they are now.
     * Polygon rings are closed if the source left them open.
     * @param {{ bbox?: boolean }} [options]  `bbox: true` adds a 3D `bbox` member.
     * @returns {any}  A FeatureCollection.
     */
    toGeoJSON({ bbox = false } = {}) {
        const features = [...this.entries.values()]
            .sort((a, b) => a.record.index - b.record.index)
            .map(({ record, geometry }) => {
                const f = geometry ? geometry.toGeoJSON() : structuredClone(record.source);
                if (f.geometry) closeRings(f.geometry);
                return f;
            });

        /** @type {Record<string, unknown>} */
        const fc = { type: 'FeatureCollection', ...this.foreignMembers, features };
        if (bbox) {
            const b = this.getBoundingBox();
            if (!b.isEmpty()) fc.bbox = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
        }
        return fc;
    }

    /** Free all geometries and materials, remove every child and detach geometry objects. */
    dispose() {
        for (const entry of this.entries.values()) {
            this.#disposeEntryObject(entry);
            if (entry.geometry) entry.geometry.group = null;
        }
        this.entries.clear();
        this.#disposePoints();
        this.materials.dispose();
    }

    // ------------------------------------------------------------------ internals

    /**
     * @param {any} feature
     * @param {number} index
     */
    #normalize(feature, index) {
        return normalizeFeature(feature, index, {
            defaultZ: this.options.defaultZ,
            transform: this.options.transform,
            warn: this.options.onWarning,
        });
    }

    /**
     * @param {any} feature
     * @param {import('./geometry/Geometry.js').Geometry} [geometry]
     * @returns {Required<import('./materials.js').Style>}
     */
    #resolveStyle(feature, geometry) {
        const s = this.options.style;
        const style = { ...DEFAULT_STYLE, ...(typeof s === 'function' ? s(feature) : s), ...geometry?.style };
        if (!this.depthTest) style.depthTest = false;
        return style;
    }

    /** @param {FeatureEntry} entry */
    #effectiveStyle(entry) {
        return entry.highlighted ? { ...entry.style, ...this.options.highlightStyle } : entry.style;
    }

    /**
     * @param {any} feature
     * @param {import('./geometry/Geometry.js').Geometry} [geometry]
     */
    #addEntry(feature, geometry) {
        const index = uid++;
        const record = this.#normalize(feature, index);
        let key = feature?.id ?? `__${index}`;
        if (this.entries.has(key)) {
            if (geometry) throw new Error(`A feature with id "${key}" is already in this group`);
            this.options.onWarning(`Duplicate feature id "${key}" – using an internal key instead`, { index });
            key = `__${index}`;
        }
        /** @type {FeatureEntry} */
        const entry = {
            key, record, geometry,
            style: this.#resolveStyle(feature, geometry),
            object: null,
            highlighted: false,
            showMeasurements: geometry?.showMeasurements ?? false,
        };
        this.entries.set(key, entry);
        this.#buildEntryObject(entry);
        this.#emit('featureadded', entry);
        return key;
    }

    /** @param {import('./geometry/Geometry.js').Geometry} geometry */
    #attachGeometry(geometry) {
        if (geometry.group === this) return;
        geometry.group?.removeGeometry(geometry);
        geometry.group = this;
        this.#addEntry(geometry.toGeoJSON(), geometry);
    }

    /**
     * @param {FeatureEvent['type']} type
     * @param {FeatureEntry} entry
     */
    #emit(type, entry) {
        /** @type {any} */ (this).dispatchEvent({ type, key: entry.key, feature: entry.record.source, geometry: entry.geometry });
    }

    /** @param {FeatureEntry} entry */
    #rebuildEntry(entry) {
        this.#disposeEntryObject(entry);
        this.#buildEntryObject(entry);
    }

    /** @param {FeatureEntry} entry */
    #buildEntryObject(entry) {
        const { record } = entry;
        const style = this.#effectiveStyle(entry);
        if (!record.lines.length && !record.polygons.length) return;

        const anchor = featureAnchor({ ...record, points: [] });
        const group = new Group();
        group.position.set(anchor[0], anchor[1], anchor[2]);
        group.userData.featureKey = entry.key;
        group.name = String(entry.key);
        const order = style.depthTest ? 0 : 10;

        if (record.lines.length) {
            const segs = [];
            for (const line of record.lines) for (let i = 0; i < line.length - 1; i++) segs.push(line[i], line[i + 1]);
            const obj = segmentsObject(segs, anchor, this.materials.line(style), style.dashed);
            obj.userData.role = 'line';
            obj.renderOrder = order + 1;
            group.add(obj);
        }

        if (record.polygons.length) {
            const fill = this.#polygonMesh(record, anchor, style);
            if (fill) { fill.renderOrder = order; group.add(fill); }

            if (style.strokeWidth > 0) {
                const segs = [];
                for (const poly of record.polygons) for (const ring of poly) {
                    for (let i = 0; i < ring.length; i++) segs.push(ring[i], ring[(i + 1) % ring.length]);
                }
                const obj = segmentsObject(segs, anchor, this.materials.stroke(style), false);
                obj.userData.role = 'stroke';
                obj.renderOrder = order + 1;
                group.add(obj);
            }
        }

        if (this.showMeasurements || entry.showMeasurements) group.add(this.#measurementLabels(record, anchor));

        entry.object = group;
        this.add(group);
    }

    /**
     * @param {import('./normalize.js').FeatureRecord} record
     * @param {number[]} anchor
     */
    #measurementLabels(record, anchor) {
        const { unit, format, element } = this.options.measurements;
        const labels = new Group();
        labels.userData.role = 'measurements';

        /**
         * @param {number[]} at
         * @param {number} value
         * @param {'length'|'area'} kind
         */
        const label = (at, value, kind) => {
            if (!(value > 1e-9)) return; // skip zero-length segments (e.g. a cursor on the last vertex)
            const text = format ? format(value, kind) : formatMeasurement(value, kind, unit);
            const obj = new CSS2DObject(element ? element(text, kind) : defaultLabelElement(text, kind));
            obj.position.set(at[0] - anchor[0], at[1] - anchor[1], at[2] - anchor[2]);
            obj.userData.measurement = { kind, value, text };
            labels.add(obj);
        };

        for (const line of record.lines) {
            for (let i = 0; i < line.length - 1; i++) label(midpoint(line[i], line[i + 1]), distance(line[i], line[i + 1]), 'length');
        }
        for (const poly of record.polygons) {
            const outer = poly[0];
            for (let i = 0; i < outer.length; i++) {
                const a = outer[i], b = outer[(i + 1) % outer.length];
                label(midpoint(a, b), distance(a, b), 'length');
            }
            label(vertexCentroid(outer), polygonArea(poly), 'area');
        }
        return labels;
    }

    /**
     * @param {import('./normalize.js').FeatureRecord} record
     * @param {number[]} anchor
     * @param {Required<import('./materials.js').Style>} style
     */
    #polygonMesh(record, anchor, style) {
        const positions = [];
        const normals = [];
        const indices = [];

        for (const poly of record.polygons) {
            const local = poly.map((ring) => ring.map((p) => [p[0] - anchor[0], p[1] - anchor[1], p[2] - anchor[2]]));
            const tri = triangulatePolygon(local);
            if (!tri) {
                this.options.onWarning('Degenerate polygon (zero area) – fill skipped', { index: record.index });
                continue;
            }
            const base = positions.length / 3;
            for (const v of tri.vertices) {
                positions.push(v[0], v[1], v[2]);
                normals.push(tri.normal[0], tri.normal[1], tri.normal[2]);
            }
            for (const i of tri.indices) indices.push(base + i);
        }
        if (!indices.length) return null;

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
        geometry.setIndex(positions.length / 3 > 65535 ? new BufferAttribute(new Uint32Array(indices), 1) : new BufferAttribute(new Uint16Array(indices), 1));
        geometry.computeBoundingSphere();

        const mesh = new Mesh(geometry, this.materials.fill(style));
        mesh.userData.role = 'fill';
        return mesh;
    }

    #rebuildPoints() {
        this.#disposePoints();

        // bucket by (point material key, grid cell): one draw call per bucket, each with its own anchor
        /** @type {Map<string, { style: Required<import('./materials.js').Style>, positions: number[][], entries: FeatureEntry[] }>} */
        const buckets = new Map();
        for (const entry of this.entries.values()) {
            const style = entry.style;
            entry.pointSlots = [];
            for (const p of entry.record.points) {
                const key = `${pointMaterialKey(style)}|${cellKey(p, this.options.pointCellSize)}`;
                let b = buckets.get(key);
                if (!b) buckets.set(key, (b = { style, positions: [], entries: [] }));
                b.positions.push(p);
                b.entries.push(entry);
            }
        }

        const color = new Color();
        for (const b of buckets.values()) {
            const anchor = boundsCenter(b.positions);
            const geometry = new BufferGeometry();
            geometry.setAttribute('position', new BufferAttribute(toLocalFloat32(b.positions, anchor), 3));
            const colors = new Float32Array(b.positions.length * 3);
            const refs = [];
            const points = new Points(geometry, this.materials.points(b.style));
            for (let i = 0; i < b.entries.length; i++) {
                const entry = b.entries[i];
                color.set(this.#effectiveStyle(entry).pointColor).toArray(colors, i * 3);
                refs.push({ key: entry.key });
                entry.pointSlots?.push({ points, index: i });
            }
            geometry.setAttribute('color', new BufferAttribute(colors, 3));
            geometry.computeBoundingSphere();
            points.position.set(anchor[0], anchor[1], anchor[2]);
            points.onBeforeRender = syncPointUniforms;
            points.renderOrder = b.style.depthTest ? 2 : 12;
            points.userData.role = 'points';
            points.userData.refs = refs;
            this.pointBatches.push(points);
            this.add(points);
        }
    }

    /** @param {FeatureEntry} entry */
    #recolorPoints(entry) {
        const c = new Color(this.#effectiveStyle(entry).pointColor);
        for (const { points, index } of entry.pointSlots ?? []) {
            const attr = points.geometry.getAttribute('color');
            attr.setXYZ(index, c.r, c.g, c.b);
            attr.needsUpdate = true;
        }
    }

    #disposePoints() {
        for (const p of this.pointBatches) {
            p.geometry.dispose();
            this.remove(p);
        }
        this.pointBatches = [];
    }

    /** @param {FeatureEntry} entry */
    #disposeEntryObject(entry) {
        if (!entry.object) return;
        entry.object.traverse((o) => {
            /** @type {Mesh} */ (o).geometry?.dispose();
            // CSS2DObject only removes its element when it is removed itself, not with an ancestor
            if (o instanceof CSS2DObject) o.element.remove();
        });
        this.remove(entry.object);
        entry.object = null;
    }
}

/**
 * @param {string|number|import('./geometry/Geometry.js').Geometry} k
 * @returns {string|number}
 */
function keyOf(k) {
    return typeof k === 'string' || typeof k === 'number' ? k : k.id;
}

/**
 * @param {string} text
 * @param {'length'|'area'} kind
 */
function defaultLabelElement(text, kind) {
    const el = document.createElement('div');
    el.className = `geojson-three-measurement geojson-three-measurement-${kind}`;
    el.textContent = text;
    el.style.cssText = 'background:rgba(31,41,51,.85);color:#fff;padding:2px 6px;border-radius:3px;'
        + 'font:11px/1.4 ui-monospace,monospace;white-space:nowrap;pointer-events:none;'
        + (kind === 'area' ? 'background:rgba(37,99,201,.9);font-weight:600;' : '');
    return el;
}

/**
 * @param {number[][]} segmentPositions  Pairs of segment start and end positions.
 * @param {number[]} anchor
 * @param {import('three/addons/lines/LineMaterial.js').LineMaterial} material
 * @param {boolean} dashed
 */
function segmentsObject(segmentPositions, anchor, material, dashed) {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(toLocalFloat32(segmentPositions, anchor));
    const obj = new LineSegments2(geometry, material);
    if (dashed) obj.computeLineDistances();
    return obj;
}

/** @param {any} geometry */
function closeRings(geometry) {
    switch (geometry.type) {
        case 'Polygon': geometry.coordinates = geometry.coordinates.map(closeRing); break;
        case 'MultiPolygon': geometry.coordinates = geometry.coordinates.map((/** @type {any[]} */ p) => p.map(closeRing)); break;
        case 'GeometryCollection': geometry.geometries.forEach(closeRings); break;
    }
}
