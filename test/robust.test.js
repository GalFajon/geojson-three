import { describe, it, expect, vi } from 'vitest';
import { GeoJSONGroup, triangulatePolygon } from '../src/index.js';
import { E0, N0, H0 } from './fixtures.js';

const area = ({ vertices: V, indices: I }) => {
    let a = 0;
    for (let i = 0; i < I.length; i += 3) {
        const [p, q, r] = [V[I[i]], V[I[i + 1]], V[I[i + 2]]];
        a += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2;
    }
    return a;
};
const sq = (x, y, w, h, z = 0) => [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]];

describe('robust triangulation', () => {
    it('keeps earcut for valid polygons', () => {
        const t = triangulatePolygon([sq(0, 0, 10, 10), sq(2, 2, 2, 2)]);
        expect(t.repaired).toBe(false);
        expect(area(t)).toBeCloseTo(96, 9);
    });

    it.each([
        ['self-intersecting bow tie', [[[0, 0, 0], [10, 10, 0], [10, 0, 0], [0, 10, 0]]], 50],
        ['hole crossing the shell', [sq(0, 0, 10, 10), sq(8, 4, 4, 2)], 96],
        ['overlapping holes', [sq(0, 0, 10, 10), sq(2, 2, 4, 4), sq(4, 4, 4, 4)], 72],
        ['hole outside the shell', [sq(0, 0, 10, 10), sq(20, 20, 2, 2)], 100],
        ['vertex touching an edge', [[[0, 0, 0], [10, 0, 0], [10, 10, 0], [5, 0, 0], [0, 10, 0]]], 50],
        ['hole sharing a shell vertex', [sq(0, 0, 10, 10), [[0, 0, 0], [3, 1, 0], [1, 3, 0]]], 100 - 4],
    ])('repairs a %s', (_name, rings, expected) => {
        const t = triangulatePolygon(rings);
        expect(t.repaired).toBe(true);
        expect(area(t)).toBeCloseTo(expected, 6);
    });

    it('repairs vertical self-intersecting polygons in their own plane', () => {
        // a bow tie standing in the x/z plane
        const t = triangulatePolygon([[[0, 5, 0], [10, 5, 10], [10, 5, 0], [0, 5, 10]]]);
        expect(t.repaired).toBe(true);
        let a = 0;
        const V = t.vertices, I = t.indices;
        for (let i = 0; i < I.length; i += 3) {
            const [p, q, r] = [V[I[i]], V[I[i + 1]], V[I[i + 2]]];
            a += Math.abs((q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0])) / 2;
        }
        expect(a).toBeCloseTo(50, 6);
        expect(V.every((v) => Math.abs(v[1] - 5) < 1e-9)).toBe(true);
    });

    it('interpolates z for vertices created at crossings', () => {
        const t = triangulatePolygon([[[0, 0, 0], [10, 10, 10], [10, 0, 10], [0, 10, 0]]], { mode: 'repair' });
        const crossing = t.vertices.find((v) => Math.abs(v[0] - 5) < 1e-9 && Math.abs(v[1] - 5) < 1e-9);
        expect(crossing[2]).toBeCloseTo(5, 9);
    });

    it('honours mode: earcut skips the check, repair always repairs', () => {
        expect(triangulatePolygon([sq(0, 0, 4, 4)], { mode: 'repair' }).repaired).toBe(true);
        expect(triangulatePolygon([[[0, 0, 0], [10, 10, 0], [10, 0, 0], [0, 10, 0]]], { mode: 'earcut' }).repaired).toBe(false);
    });

    it('validates large rings quickly', () => {
        const ring = Array.from({ length: 20_000 }, (_, i) => {
            const a = (i / 20_000) * Math.PI * 2;
            return [Math.cos(a) * 1000, Math.sin(a) * 1000, 0];
        });
        const t0 = performance.now();
        const t = triangulatePolygon([ring]);
        expect(t.repaired).toBe(false);
        expect(performance.now() - t0).toBeLessThan(1500);
    });

    it('reports repairs through onWarning', () => {
        const onWarning = vi.fn();
        new GeoJSONGroup({ type: 'Polygon', coordinates: [[[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]] }, { onWarning });
        expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('repaired'), expect.anything());
    });
});

describe('extrusion', () => {
    const quiet = { onWarning: () => {} };
    const footprint = {
        type: 'Feature', id: 'b', properties: { height: 12 },
        geometry: { type: 'Polygon', coordinates: [[[E0, N0, H0], [E0 + 20, N0, H0], [E0 + 20, N0 + 10, H0], [E0, N0 + 10, H0], [E0, N0, H0]]] },
    };

    it('turns polygons into shaded solids with outward walls', () => {
        const geo = new GeoJSONGroup(footprint, { ...quiet, style: (f) => ({ extrude: f.properties.height }) });
        const group = geo.entries.get('b').object;
        const fill = group.children.find((c) => c.userData.role === 'fill');
        expect(fill.userData.shaded).toBe(true);
        expect(fill.material.vertexColors).toBe(true);
        expect(fill.geometry.getAttribute('color')).toBeDefined();
        // 2 caps x 2 triangles + 4 walls x 2 triangles
        expect(fill.geometry.index.count / 3).toBe(12);

        // every wall normal points away from the footprint centre
        const pos = fill.geometry.getAttribute('position'), nor = fill.geometry.getAttribute('normal');
        const cx = (E0 + 10) - group.position.x, cy = (N0 + 5) - group.position.y;
        for (let i = 0; i < nor.count; i++) {
            if (Math.abs(nor.getZ(i)) > 0.5) continue;
            const dx = pos.getX(i) - cx, dy = pos.getY(i) - cy;
            expect(dx * nor.getX(i) + dy * nor.getY(i)).toBeGreaterThan(0);
        }

        const box = geo.getBoundingBox();
        expect(box.max.z).toBeCloseTo(H0 + 12, 9);
    });

    it('turns lines into walls and keeps the base line', () => {
        const geo = new GeoJSONGroup({
            type: 'Feature', id: 'w', properties: {},
            geometry: { type: 'LineString', coordinates: [[E0, N0, H0], [E0 + 30, N0, H0], [E0 + 30, N0 + 20, H0]] },
        }, { ...quiet, style: { extrude: 1.8 } });
        const roles = geo.entries.get('w').object.children.map((c) => c.userData.role).sort();
        expect(roles).toEqual(['fill', 'line', 'stroke']);
        const wall = geo.entries.get('w').object.children.find((c) => c.userData.role === 'fill');
        expect(wall.geometry.index.count / 3).toBe(4);
    });

    it('keeps shading when highlighted and leaves flat fills unshaded', () => {
        const geo = new GeoJSONGroup(footprint, { ...quiet, style: { extrude: 5 } });
        geo.setHighlighted('b', true);
        const fill = geo.entries.get('b').object.children.find((c) => c.userData.role === 'fill');
        expect(fill.material.vertexColors).toBe(true);

        const flat = new GeoJSONGroup(footprint, quiet);
        const flatFill = flat.entries.get('b').object.children.find((c) => c.userData.role === 'fill');
        expect(flatFill.material.vertexColors).toBe(false);
    });

    it('extrudes repaired polygons too', () => {
        const geo = new GeoJSONGroup({ type: 'Feature', id: 'x', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]] } },
            { ...quiet, style: { extrude: 3 } });
        const fill = geo.entries.get('x').object.children.find((c) => c.userData.role === 'fill');
        expect(fill.geometry.index.count).toBeGreaterThan(0);
    });
});
