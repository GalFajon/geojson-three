import { Geometry } from './Geometry.js';

/**
 * An editable point. `vectors` is a single `[x, y, z]` position.
 *
 * Points are drawn in their group's shared point batches, so thousands of `Point` objects still render
 * in a few draw calls.
 *
 * @example
 * const hydrant = new Point([512310.25, 5102415.80, 295.1], { properties: { kind: 'hydrant' } });
 * group.addGeometry(hydrant);
 * hydrant.vectors = [512312, 5102415.8, 295.1];
 * hydrant.update();
 */
export class Point extends Geometry {
    type = 'Point';

    /**
     * @param {number[]} vectors  `[x, y, z]` (z defaults to 0).
     * @param {import('./Geometry.js').GeometryConfig} [config]
     */
    constructor(vectors, config = {}) {
        super(config);
        /** `[x, y, z]` position. @type {number[]} */
        this.vectors = [vectors[0], vectors[1], vectors[2] ?? 0];
    }

    /** @protected */
    geoJSONGeometry() {
        return { type: 'Point', coordinates: [...this.vectors] };
    }
}
