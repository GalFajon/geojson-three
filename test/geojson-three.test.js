import { describe, it, expect, vi } from 'vitest';
import {
    Matrix4, Mesh, PerspectiveCamera, Points, Raycaster, REVISION, Vector2, Vector3,
} from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';

import { GeoJSONGroup, normalizeGeoJSON, triangulatePolygon } from '../src/index.js';
import { mixedCollection, verticalWall, E0, N0, H0, BIG } from './fixtures.js';

const f32 = Math.fround;

describe('environment', () => {
    it('runs against a modern three.js', () => {
        expect(Number(REVISION)).toBeGreaterThanOrEqual(187);
    });
});

describe('normalizeGeoJSON', () => {
    it('handles every RFC 7946 geometry type, nulls and foreign members', () => {
        const recs = normalizeGeoJSON(mixedCollection);
        const byId = Object.fromEntries(recs.map((r) => [r.id, r]));

        expect(byId.p1.points).toEqual([[E0, N0, H0]]);
        expect(byId.mp.points).toHaveLength(2);
        expect(byId.l1.lines).toHaveLength(1);
        expect(byId.ml.lines).toHaveLength(2);
        expect(byId.poly.polygons[0]).toHaveLength(2);          // outer + hole
        expect(byId.poly.polygons[0][0]).toHaveLength(4);       // closing vertex stripped
        expect(byId.mpoly.polygons).toHaveLength(2);
        expect(byId.gc.points).toHaveLength(1);
        expect(byId.gc.lines).toHaveLength(1);
        expect(byId.nogeom.points.length + byId.nogeom.lines.length + byId.nogeom.polygons.length).toBe(0);
    });

    it('fills missing Z with defaultZ', () => {
        const [r] = normalizeGeoJSON({ type: 'Point', coordinates: [1, 2] }, { defaultZ: 42 });
        expect(r.points[0]).toEqual([1, 2, 42]);
    });

    it('applies a coordinate transform (e.g. reprojection) in float64', () => {
        const [r] = normalizeGeoJSON({ type: 'Point', coordinates: [1, 2, 3] }, { transform: ([x, y, z]) => [x + BIG, y + BIG, z] });
        expect(r.points[0]).toEqual([1 + BIG, 2 + BIG, 3]);
    });

    it('warns about and skips invalid geometry instead of throwing', () => {
        const onWarning = vi.fn();
        const recs = normalizeGeoJSON({
            type: 'FeatureCollection', features: [
                { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0]] } },
                { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: ['a', 1] } },
                { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] } },
            ]
        }, { onWarning });
        expect(onWarning).toHaveBeenCalledTimes(3);
        expect(recs.every((r) => !r.points.length && !r.lines.length && !r.polygons.length)).toBe(true);
    });
});

describe('triangulatePolygon', () => {
    const area = ({ vertices, indices }) => {
        let a = 0;
        for (let i = 0; i < indices.length; i += 3) {
            const [p, q, r] = [vertices[indices[i]], vertices[indices[i + 1]], vertices[indices[i + 2]]];
            const u = new Vector3(...q).sub(new Vector3(...p));
            const v = new Vector3(...r).sub(new Vector3(...p));
            a += u.cross(v).length() / 2;
        }
        return a;
    };

    it('triangulates a horizontal polygon with a hole', () => {
        const t = triangulatePolygon([
            [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]],
            [[5, 5, 0], [5, 15, 0], [15, 15, 0], [15, 5, 0]],
        ]);
        expect(area(t)).toBeCloseTo(400 - 100, 6);
    });

    it('triangulates a vertical wall (earcut alone only sees x/y)', () => {
        const t = triangulatePolygon([[[0, 0, 0], [10, 0, 0], [10, 0, 5], [0, 0, 5]]]);
        expect(area(t)).toBeCloseTo(50, 6);
        expect(Math.abs(t.normal[1])).toBeCloseTo(1, 6);
    });

    it('returns null for degenerate rings', () => {
        expect(triangulatePolygon([[[0, 0, 0], [1, 1, 1], [2, 2, 2]]])).toBeNull();
    });
});

describe('GeoJSONGroup', () => {
    const quiet = { onWarning: () => {} };

    it('builds one anchored group per located feature and batches points', () => {
        const geo = new GeoJSONGroup(mixedCollection, quiet);
        const groups = geo.children.filter((c) => c.userData.featureKey !== undefined);
        expect(groups.map((g) => g.userData.featureKey).sort()).toEqual(['gc', 'l1', 'ml', 'mpoly', 'poly']);

        const poly = groups.find((g) => g.userData.featureKey === 'poly');
        expect(poly.children.map((c) => c.userData.role).sort()).toEqual(['fill', 'stroke']);
        expect(poly.children.find((c) => c.userData.role === 'stroke')).toBeInstanceOf(LineSegments2);

        // p1 + 2 from MultiPoint + 1 from GeometryCollection, all within one 10 km cell
        expect(geo.pointBatches).toHaveLength(1);
        expect(geo.pointBatches[0].geometry.getAttribute('position').count).toBe(4);

        // the group itself stays at identity; anchors sit on children
        expect(geo.position.length()).toBe(0);
        expect(poly.position.x).toBeCloseTo(E0 + 10, 9);
    });

    it('splits widely spread points into separately anchored batches', () => {
        const geo = new GeoJSONGroup({
            type: 'MultiPoint', coordinates: [[E0, N0, 0], [E0 + 50_000, N0, 0], [E0 + 100_000, N0, 0]],
        }, { pointCellSize: 10_000 });
        expect(geo.pointBatches).toHaveLength(3);
        for (const b of geo.pointBatches) {
            const pos = b.geometry.getAttribute('position');
            expect(Math.abs(pos.getX(0))).toBeLessThan(1e-9);
        }
    });

    it('vertical walls render with a non-empty fill', () => {
        const geo = new GeoJSONGroup(verticalWall);
        const fill = geo.children[0].children.find((c) => c.userData.role === 'fill');
        expect(fill.geometry.index.count).toBe(6);
    });
});

describe('large-coordinate precision', () => {
    // Positions far from the origin: national-grid easting + UTM-sized northing.
    const X = E0 + 0.123, Y = BIG + 0.456, Z = H0 + 0.789;
    const line = {
        type: 'Feature', id: 'line', properties: {}, geometry: {
            type: 'LineString', coordinates: [[X, Y, Z], [X + 0.001, Y + 0.001, Z], [X + 250, Y + 250, Z + 10]],
        }
    };

    it('stores vertices with sub-millimetre error after the float32 round trip', () => {
        const geo = new GeoJSONGroup(line);
        const group = geo.children[0];
        const start = group.children[0].geometry.getAttribute('instanceStart');

        for (let i = 0; i < start.count; i++) {
            const src = line.geometry.coordinates[i];
            expect(Math.abs(group.position.x + start.getX(i) - src[0])).toBeLessThan(1e-4);
            expect(Math.abs(group.position.y + start.getY(i) - src[1])).toBeLessThan(1e-4);
            expect(Math.abs(group.position.z + start.getZ(i) - src[2])).toBeLessThan(1e-4);
        }

        // Control: storing absolute coordinates in float32 loses ~0.25 m at this northing,
        // and collapses the 1 mm segment completely.
        expect(Math.abs(f32(Y) - Y)).toBeGreaterThan(0.01);
        expect(f32(Y + 0.001) - f32(Y)).toBe(0);
    });

    /**
     * Simulates what the GPU computes: three.js builds modelViewMatrix in float64 on the CPU, then
     * the matrix and the vertex are uploaded as float32 and multiplied in float32.
     */
    function gpuViewSpace(object, camera, local) {
        object.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const mv = new Matrix4().multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
        const e = mv.elements.map(f32);
        const [x, y, z] = local.map(f32);
        const out = [];
        for (let r = 0; r < 3; r++) {
            out.push(f32(f32(f32(f32(e[r] * x) + f32(e[4 + r] * y)) + f32(e[8 + r] * z)) + e[12 + r]));
        }
        return out;
    }

    it('keeps view-space positions accurate on the GPU (relative-to-anchor works with stock three)', () => {
        const geo = new GeoJSONGroup(line);
        const group = geo.children[0];
        const start = group.children[0].geometry.getAttribute('instanceStart');

        const camera = new PerspectiveCamera(60, 1, 0.1, 10_000);
        camera.position.set(X + 20, Y - 30, Z + 15);
        camera.up.set(0, 0, 1);
        camera.lookAt(X, Y, Z);

        const view = camera.matrixWorldInverse;
        camera.updateMatrixWorld(true);

        for (let i = 0; i < start.count; i++) {
            const local = [start.getX(i), start.getY(i), start.getZ(i)];
            const gpu = gpuViewSpace(group, camera, local);
            const truth = new Vector3(...line.geometry.coordinates[i]).applyMatrix4(view);
            expect(Math.abs(gpu[0] - truth.x)).toBeLessThan(1e-3);
            expect(Math.abs(gpu[1] - truth.y)).toBeLessThan(1e-3);
            expect(Math.abs(gpu[2] - truth.z)).toBeLessThan(1e-3);
        }

        // Control: absolute float32 vertices under an identity model matrix are off by decimetres.
        const naive = { updateMatrixWorld() {}, matrixWorld: new Matrix4() };
        const gpu = gpuViewSpace(naive, camera, line.geometry.coordinates[0]);
        const truth = new Vector3(...line.geometry.coordinates[0]).applyMatrix4(view);
        expect(Math.hypot(gpu[0] - truth.x, gpu[1] - truth.y, gpu[2] - truth.z)).toBeGreaterThan(0.05);
    });
});

describe('picking', () => {
    const quiet = { onWarning: () => {} };

    function downRay(x, y) {
        const raycaster = new Raycaster(new Vector3(x, y, H0 + 100), new Vector3(0, 0, -1));
        raycaster.params.Points.threshold = 0.2;
        const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.set(x, y, H0 + 100);
        camera.up.set(0, 1, 0);
        camera.lookAt(x, y, H0);
        camera.updateMatrixWorld(true);
        raycaster.camera = camera;
        return raycaster;
    }

    it('resolves polygon, hole and point hits back to features', () => {
        const geo = new GeoJSONGroup(mixedCollection, quiet);
        geo.updateMatrixWorld(true);

        const polyHit = downRay(E0 + 2, N0 + 17).intersectObject(geo, true).find((h) => h.object instanceof Mesh);
        expect(geo.featureFromIntersection(polyHit).key).toBe('poly');

        const holeHits = downRay(E0 + 10, N0 + 10).intersectObject(geo, true).filter((h) => h.object instanceof Mesh);
        expect(holeHits).toHaveLength(0);

        const ptHit = downRay(E0 + 2, N0).intersectObject(geo, true).find((h) => h.object instanceof Points);
        expect(geo.featureFromIntersection(ptHit).key).toBe('mp');
    });

    it('raycasts fat lines at large coordinates', () => {
        const geo = new GeoJSONGroup(mixedCollection, quiet);
        geo.updateMatrixWorld(true);
        geo.materials.line({ ...geo.entries.get('l1').style }).resolution = new Vector2(1000, 1000);
        // segment from (E0+10, N0) to (E0+10, N0+10)
        const hit = downRay(E0 + 10, N0 + 5).intersectObject(geo, true)
            .find((h) => h.object instanceof LineSegments2 && h.object.userData.role === 'line');
        expect(geo.featureFromIntersection(hit).key).toBe('l1');
    });
});

describe('editing, highlighting and export', () => {
    const quiet = { onWarning: () => {} };

    it('round-trips the input losslessly (types, ids, foreign members, float64)', () => {
        const geo = new GeoJSONGroup(mixedCollection, quiet);
        expect(geo.toGeoJSON()).toEqual(mixedCollection);
    });

    it('closes polygon rings that were left open (invalid in RFC 7946)', () => {
        const open = { type: 'Polygon', coordinates: [[[0, 0, 0], [1, 0, 0], [1, 1, 0]]] };
        const out = new GeoJSONGroup(open).toGeoJSON();
        expect(out.features[0].geometry.coordinates[0]).toEqual([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0]]);
    });

    it('swaps materials and point colours on highlight', () => {
        const geo = new GeoJSONGroup(mixedCollection, quiet);
        const line = geo.entries.get('l1').object.children[0];
        const before = line.material;
        geo.setHighlighted('l1', true);
        expect(line.material).not.toBe(before);
        expect(line.material.linewidth).toBe(5);
        geo.setHighlighted('l1', false);
        expect(line.material).toBe(before);

        const batch = geo.pointBatches[0];
        const idx = batch.userData.refs.findIndex((r) => r.key === 'p1');
        const colors = batch.geometry.getAttribute('color');
        const r0 = colors.getX(idx);
        geo.setHighlighted('p1', true);
        expect(colors.getX(idx)).not.toBe(r0);
    });

    it('updates and removes features', () => {
        const geo = new GeoJSONGroup(mixedCollection, quiet);
        const moved = { type: 'Feature', id: 'l1', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: [[BIG, BIG, 0], [BIG + 1, BIG, 0]] } };
        geo.updateFeature('l1', moved);
        expect(geo.entries.get('l1').object.position.x).toBeCloseTo(BIG + 0.5, 9);
        expect(geo.toGeoJSON().features.find((f) => f.id === 'l1')).toEqual(moved);

        geo.removeFeature('p1');
        expect(geo.pointBatches[0].geometry.getAttribute('position').count).toBe(3);
        expect(geo.toGeoJSON().features.map((f) => f.id)).not.toContain('p1');

        geo.dispose();
        expect(geo.children).toHaveLength(0);
    });

    it('computes float64 bounds', () => {
        const geo = new GeoJSONGroup(mixedCollection, quiet);
        const b = geo.getBoundingBox();
        expect(b.min.x).toBe(E0);
        expect(b.max.y).toBe(N0 + 20);
    });
});

describe('simplestyle', async () => {
    const { simplestyle } = await import('../src/index.js');

    it('maps simplestyle-spec properties onto group styles', () => {
        const geo = new GeoJSONGroup({
            type: 'Feature', id: 'x', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { stroke: '#123456', 'stroke-width': 7, 'fill-opacity': 0.25, 'marker-size': 'large' },
        }, { style: simplestyle });
        const { style } = geo.entries.get('x');
        expect(style).toMatchObject({ lineColor: '#123456', lineWidth: 7, strokeWidth: 7, fillOpacity: 0.25, pointSize: 16 });
        expect(geo.entries.get('x').object.children[0].material.linewidth).toBe(7);
    });
});

describe('point batching', () => {
    it('differently coloured points share one batch when pointOutlineColor is null', () => {
        const fc = { type: 'FeatureCollection', features: ['#f00', '#0f0', '#00f'].map((c, i) => ({
            type: 'Feature', properties: { c }, geometry: { type: 'Point', coordinates: [E0 + i, N0, H0] },
        })) };
        const shared = new GeoJSONGroup(fc, { style: (f) => ({ pointColor: f.properties.c, pointOutlineColor: null }) });
        expect(shared.pointBatches).toHaveLength(1);
        expect(shared.pointBatches[0].material.uniforms.outlineWidth.value).toBe(0);
    });
});

describe('point sizing', async () => {
    const { syncPointUniforms } = await import('../src/index.js');
    const fc = (units) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: [[E0, N0, H0], [E0 + 1, N0, H0]] } });

    it("'world' sizing switches the shader to world units and gets its own batch", () => {
        const geo = new GeoJSONGroup({
            type: 'FeatureCollection', features: [
                { type: 'Feature', properties: { u: 'world' }, geometry: { type: 'Point', coordinates: [E0, N0, H0] } },
                { type: 'Feature', properties: { u: 'pixels' }, geometry: { type: 'Point', coordinates: [E0 + 1, N0, H0] } },
            ]
        }, { style: (f) => ({ pointSizeUnits: f.properties.u, pointSize: 0.5, pointMinSize: 3, pointMaxSize: 40 }) });
        expect(geo.pointBatches).toHaveLength(2);
        const world = geo.pointBatches.find((b) => b.material.uniforms.worldSize.value === 1);
        expect(world.material.uniforms).toMatchObject({ size: { value: 0.5 }, minSize: { value: 3 }, maxSize: { value: 40 } });
    });

    it('syncs pixel ratio and CSS viewport height from the renderer', () => {
        const geo = new GeoJSONGroup(fc());
        const batch = geo.pointBatches[0];
        expect(batch.onBeforeRender).toBe(syncPointUniforms);
        const renderer = { getPixelRatio: () => 2, getCurrentViewport: (v) => v.set(0, 0, 1600, 1200) };
        batch.onBeforeRender(renderer);
        expect(batch.material.uniforms.pixelRatio.value).toBe(2);
        expect(batch.material.uniforms.viewportHeight.value).toBe(600);
    });
});
