import { Geometry } from './Geometry.js';
import { stripClosingVertex, closeRing } from '../normalize.js';
import { polygonArea, segmentLengths, pathLength, pointInRing2D, ringInsideRing2D, vertexCentroid } from '../measure.js';

/**
 * An editable polygon with optional holes. `vectors` is the outer ring and `holes` holds the interior
 * rings. Rings are stored without the closing vertex and are closed again on export.
 *
 * Polygons can be in any plane: horizontal parcels, vertical walls or tilted roofs triangulate and
 * measure correctly.
 *
 * @example
 * const parcel = new Polygon([
 *     [[0, 0, 0], [60, 0, 0], [60, 40, 0], [0, 40, 0]],      // outer ring
 *     [[38, 8, 0], [38, 22, 0], [52, 22, 0], [52, 8, 0]],    // hole
 * ], { properties: { parcel_no: '1734/2' } });
 * parcel.calculateArea(); // 2400 - 196 = 2204
 */
export class Polygon extends Geometry {
    type = 'Polygon';

    /**
     * @param {number[][][]} positions  `[outerRing, ...holes]` as in GeoJSON. Rings may be closed or open.
     * @param {import('./Geometry.js').GeometryConfig} [config]
     */
    constructor(positions, config = {}) {
        super(config);
        const rings = positions.map((r) => stripClosingVertex(r.map((v) => [v[0], v[1], v[2] ?? 0])));
        /** Outer ring, not closed. @type {number[][]} */
        this.vectors = rings[0] ?? [];
        /** Interior rings, not closed. @type {number[][][]} */
        this.holes = rings.slice(1);
    }

    /**
     * Planar area of the outer ring minus the holes, measured in the polygon's own plane.
     * @returns {number}
     */
    calculateArea() {
        return polygonArea([this.vectors, ...this.holes]);
    }

    /**
     * Perimeter of the outer ring, including the closing edge.
     * @returns {number}
     */
    calculatePerimeter() {
        return pathLength(this.vectors, true);
    }

    /**
     * Lengths of the outer ring's edges, including the closing edge.
     * @returns {number[]}
     */
    calculateSegmentLengths() {
        return segmentLengths(this.vectors, true);
    }

    /**
     * Average of the outer ring's vertices.
     * @returns {number[]}
     */
    calculateCentroid() {
        return vertexCentroid(this.vectors);
    }

    /**
     * Remove the hole that contains `position` (plan view) and re-render.
     * @param {number[]} position
     * @returns {boolean}  Whether a hole was removed.
     */
    fillHole(position) {
        const i = this.holes.findIndex((h) => pointInRing2D(position, h));
        if (i < 0) return false;
        this.holes.splice(i, 1);
        this.update();
        return true;
    }

    /**
     * Cut another polygon's outer ring out of this polygon as a new hole, if it lies completely inside the
     * outer ring and does not overlap an existing hole (plan view). Re-renders on success. The other polygon
     * is not modified or removed.
     * @param {Polygon} polygon
     * @returns {boolean}  Whether the hole was added.
     */
    carveHole(polygon) {
        const ring = polygon.vectors;
        if (!ringInsideRing2D(ring, this.vectors)) return false;
        const overlaps = this.holes.some((h) => ring.some((p) => pointInRing2D(p, h)) || h.some((p) => pointInRing2D(p, ring)));
        if (overlaps) return false;
        this.holes.push(ring.map((v) => [...v]));
        this.update();
        return true;
    }

    /** @protected */
    geoJSONGeometry() {
        return { type: 'Polygon', coordinates: [this.vectors, ...this.holes].map((r) => closeRing(r.map((v) => [...v]))) };
    }
}
