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
    /**
     * @param {number[][][]} positions  `[outerRing, ...holes]` as in GeoJSON. Rings may be closed or open.
     * @param {import('./Geometry.js').GeometryConfig} [config]
     */
    constructor(positions: number[][][], config?: import("./Geometry.js").GeometryConfig);
    /** Interior rings, not closed. @type {number[][][]} */
    holes: number[][][];
    /**
     * Perimeter of the outer ring, including the closing edge.
     * @returns {number}
     */
    calculatePerimeter(): number;
    /**
     * Remove the hole that contains `position` (plan view) and re-render.
     * @param {number[]} position
     * @returns {boolean}  Whether a hole was removed.
     */
    fillHole(position: number[]): boolean;
    /**
     * Cut another polygon's outer ring out of this polygon as a new hole, if it lies completely inside the
     * outer ring and does not overlap an existing hole (plan view). Re-renders on success. The other polygon
     * is not modified or removed.
     * @param {Polygon} polygon
     * @returns {boolean}  Whether the hole was added.
     */
    carveHole(polygon: Polygon): boolean;
    /** @protected */
    protected geoJSONGeometry(): {
        type: string;
        coordinates: number[][][];
    };
}
import { Geometry } from './Geometry.js';
