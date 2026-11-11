/**
 * An editable polyline (GeoJSON `LineString`). `vectors` is a list of `[x, y, z]` positions.
 *
 * @example
 * const pipe = new Line([[512300, 5102400, 293.5], [512360, 5102400, 293.2]], {
 *     properties: { network: 'water', dn_mm: 110 },
 *     style: { lineColor: '#2563c9', dashed: true },
 * });
 * group.addGeometry(pipe);
 * pipe.calculateLength(); // 60.0008…
 */
export class Line extends Geometry {
    /**
     * @param {number[][]} vectors  At least two `[x, y, z]` positions.
     * @param {import('./Geometry.js').GeometryConfig} [config]
     */
    constructor(vectors: number[][], config?: import("./Geometry.js").GeometryConfig);
    /** @protected */
    protected geoJSONGeometry(): {
        type: string;
        coordinates: any;
    };
}
import { Geometry } from './Geometry.js';
