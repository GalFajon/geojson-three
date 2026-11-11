import { Geometry } from './Geometry.js';

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
    type = 'Line';

    /**
     * @param {number[][]} vectors  At least two `[x, y, z]` positions.
     * @param {import('./Geometry.js').GeometryConfig} [config]
     */
    constructor(vectors, config = {}) {
        super(config);
        /** Vertices. @type {number[][]} */
        this.vectors = vectors.map((v) => [v[0], v[1], v[2] ?? 0]);
    }

    /** @protected */
    geoJSONGeometry() {
        return { type: 'LineString', coordinates: this.vectors.map((v) => [...v]) };
    }
}
