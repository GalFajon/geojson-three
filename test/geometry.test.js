import { describe, it, expect, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Points, Raycaster, Vector3 } from 'three';
import {
    GeoJSONGroup, Point, Line, Polygon, geometriesFromGeoJSON, geometriesToGeoJSON, polygonArea, ringArea,
} from '../src/index.js';
import { mixedCollection, E0, N0, H0 } from './fixtures.js';

// minimal stand-in for an HTMLElement so CSS2DObject works under node
const fakeElement = (text) => ({
    textContent: text, style: {}, setAttribute() {}, remove() {}, parentNode: null,
    ownerDocument: { defaultView: { Element: class {} } },
});
const quiet = { onWarning: () => {}, measurements: { element: fakeElement } };

describe('geometry classes', () => {
    it('keep vectors, properties and ids', () => {
        const p = new Point([E0, N0], { id: 'p', properties: { a: 1 } });
        expect(p.vectors).toEqual([E0, N0, 0]);
        expect(p.toGeoJSON()).toEqual({ type: 'Feature', id: 'p', properties: { a: 1 }, geometry: { type: 'Point', coordinates: [E0, N0, 0] } });
        expect(new Line([[0, 0], [1, 1]]).id).not.toEqual(new Line([[0, 0], [1, 1]]).id);
    });

    it('measure lines in 3D', () => {
        const l = new Line([[0, 0, 0], [3, 4, 0], [3, 4, 12]]);
        expect(l.calculateSegmentLengths()).toEqual([5, 12]);
        expect(l.calculateLength()).toBe(17);
        expect(l.calculateMidpoint([0, 0, 0], [2, 4, 6])).toEqual([1, 2, 3]);
    });

    it('measure polygons in their own plane, minus holes, at large coordinates', () => {
        const ring = (x0, y0, w, h) => [[x0, y0, H0], [x0 + w, y0, H0], [x0 + w, y0 + h, H0], [x0, y0 + h, H0]];
        const poly = new Polygon([[...ring(E0, N0, 60, 40), [E0, N0, H0]], ring(E0 + 38, N0 + 8, 14, 14)]);
        expect(poly.vectors).toHaveLength(4);                 // closing vertex stripped
        expect(poly.calculateArea()).toBeCloseTo(2400 - 196, 6);
        expect(poly.calculatePerimeter()).toBeCloseTo(200, 9);
        expect(poly.calculateSegmentLengths()).toHaveLength(4);

        // vertical wall: the 2D shoelace formula would give 0
        expect(ringArea([[0, 0, 0], [10, 0, 0], [10, 0, 5], [0, 0, 5]])).toBeCloseTo(50, 9);
        // 45 degree roof: 10 m wide, 10 m long slope
        expect(polygonArea([[[0, 0, 0], [10, 0, 0], [10, 7.0710678, 7.0710678], [0, 7.0710678, 7.0710678]]])).toBeCloseTo(100, 5);
    });

    it('export polygon rings closed', () => {
        const poly = new Polygon([[[0, 0, 0], [1, 0, 0], [1, 1, 0]]]);
        expect(poly.toGeoJSON().geometry.coordinates[0]).toEqual([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0]]);
    });

    it('carve and fill holes', () => {
        const outer = new Polygon([[[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]]]);
        const inside = new Polygon([[[10, 10, 0], [20, 10, 0], [20, 20, 0], [10, 20, 0]]]);
        const crossing = new Polygon([[[90, 90, 0], [110, 90, 0], [110, 110, 0], [90, 110, 0]]]);
        const overlapping = new Polygon([[[15, 15, 0], [25, 15, 0], [25, 25, 0], [15, 25, 0]]]);

        expect(outer.carveHole(inside)).toBe(true);
        expect(outer.carveHole(crossing)).toBe(false);
        expect(outer.carveHole(overlapping)).toBe(false);
        expect(outer.calculateArea()).toBeCloseTo(10000 - 100, 9);

        expect(outer.fillHole([50, 50, 0])).toBe(false);
        expect(outer.fillHole([15, 15, 0])).toBe(true);
        expect(outer.holes).toHaveLength(0);
    });
});

describe('GeoJSONGroup with geometry objects', () => {
    it('adds, updates and removes geometries and emits events', () => {
        const geo = new GeoJSONGroup(undefined, quiet);
        const events = [];
        for (const t of ['featureadded', 'featureupdated', 'featureremoved']) geo.addEventListener(t, (e) => events.push([e.type, e.key]));

        const line = geo.addGeometry(new Line([[E0, N0, H0], [E0 + 10, N0, H0]], { id: 'axis' }));
        expect(line.group).toBe(geo);
        expect(geo.geometries).toEqual([line]);
        expect(geo.entries.get('axis').object.position.x).toBeCloseTo(E0 + 5, 9);

        line.vectors.push([E0 + 10, N0 + 20, H0]);
        line.update();
        expect(geo.getFeature('axis').geometry.coordinates).toHaveLength(3);
        expect(geo.entries.get('axis').object.position.y).toBeCloseTo(N0 + 10, 9);

        expect(geo.removeGeometry(line)).toBe(true);
        expect(line.group).toBeNull();
        expect(events).toEqual([['featureadded', 'axis'], ['featureupdated', 'axis'], ['featureremoved', 'axis']]);
    });

    it('moves a geometry between groups and refuses duplicate ids', () => {
        const a = new GeoJSONGroup(undefined, quiet), b = new GeoJSONGroup(undefined, quiet);
        const p = a.addGeometry(new Point([E0, N0, H0], { id: 'x' }));
        b.addGeometry(p);
        expect(a.entries.size).toBe(0);
        expect(p.group).toBe(b);
        expect(() => b.addGeometry(new Point([E0, N0, H0], { id: 'x' }))).toThrow();
    });

    it('applies per-geometry style and highlights by geometry', () => {
        const geo = new GeoJSONGroup(undefined, { ...quiet, style: { lineColor: '#ff0000' } });
        const line = geo.addGeometry(new Line([[0, 0, 0], [1, 0, 0]], { style: { lineWidth: 9 } }));
        const obj = geo.entries.get(line.id).object.children[0];
        expect(obj.material.linewidth).toBe(9);
        geo.setHighlighted(line, true);
        expect(geo.entries.get(line.id).object.children[0].material.linewidth).toBe(5);
    });

    it('resolves picks to geometry objects', () => {
        const geo = new GeoJSONGroup(undefined, quiet);
        const poly = geo.addGeometry(new Polygon([[[E0, N0, H0], [E0 + 20, N0, H0], [E0 + 20, N0 + 20, H0], [E0, N0 + 20, H0]]]));
        const pt = geo.addGeometry(new Point([E0 + 50, N0, H0]));
        geo.updateMatrixWorld(true);
        const ray = (x, y) => {
            const r = new Raycaster(new Vector3(x, y, H0 + 50), new Vector3(0, 0, -1));
            r.params.Points.threshold = 0.2;
            r.camera = new PerspectiveCamera();
            return r.intersectObject(geo, true);
        };
        expect(geo.featureFromIntersection(ray(E0 + 5, N0 + 5).find((h) => h.object instanceof Mesh)).geometry).toBe(poly);
        expect(geo.featureFromIntersection(ray(E0 + 50, N0).find((h) => h.object instanceof Points)).geometry).toBe(pt);
    });

    it('shows measurement labels at float64-accurate positions', () => {
        const geo = new GeoJSONGroup(undefined, quiet);
        const poly = geo.addGeometry(new Polygon([[[E0, N0, H0], [E0 + 60, N0, H0], [E0 + 60, N0 + 40, H0], [E0, N0 + 40, H0]]]));
        const line = geo.addGeometry(new Line([[E0, N0 - 10, H0], [E0 + 3, N0 - 6, H0]]));

        poly.setShowMeasurements(true);
        const labels = geo.entries.get(poly.id).object.children.find((c) => c.userData.role === 'measurements');
        const texts = labels.children.map((c) => c.userData.measurement.text);
        expect(texts).toEqual(['60.00 m', '40.00 m', '60.00 m', '40.00 m', '2400.0 m²']);
        expect(geo.entries.get(line.id).object.children.some((c) => c.userData.role === 'measurements')).toBe(false);

        // label position in world space is exact (anchor + local)
        geo.updateMatrixWorld(true);
        const w = labels.children[0].getWorldPosition(new Vector3());
        expect(w.x).toBeCloseTo(E0 + 30, 6);
        expect(w.y).toBeCloseTo(N0, 6);

        geo.setShowMeasurements(true);   // whole group
        const lineLabels = geo.entries.get(line.id).object.children.find((c) => c.userData.role === 'measurements');
        expect(lineLabels.children[0].userData.measurement.text).toBe('5.00 m');
        const removed = vi.fn();
        lineLabels.children[0].element.remove = removed;
        geo.setShowMeasurements(false);
        expect(removed).toHaveBeenCalled();       // label DOM elements are cleaned up on rebuild
        poly.setShowMeasurements(false);
        expect(geo.entries.get(poly.id).object.children.some((c) => c.userData.role === 'measurements')).toBe(false);
    });

    it('toggles depth testing for the whole group', () => {
        const geo = new GeoJSONGroup(mixedCollection, quiet);
        geo.setDepthTest(false);
        expect(geo.entries.get('poly').object.children.every((c) => c.material.depthTest === false)).toBe(true);
        expect(geo.pointBatches.every((p) => p.material.depthTest === false && p.renderOrder > 10)).toBe(true);
        geo.setDepthTest(true);
        expect(geo.entries.get('poly').object.children[0].material.depthTest).toBe(true);
    });
});

describe('GeoJSON <-> geometry objects', () => {
    it('splits multi-part features into editable parts and writes them back', () => {
        const warn = vi.fn();
        const geometries = geometriesFromGeoJSON(mixedCollection, { onWarning: warn });
        const types = geometries.map((g) => g.type);
        // p1, mp x2, gc point | l1, ml x2, gc line | poly, mpoly x2
        expect(types.filter((t) => t === 'Point')).toHaveLength(4);
        expect(types.filter((t) => t === 'Line')).toHaveLength(4);
        expect(types.filter((t) => t === 'Polygon')).toHaveLength(3);
        expect(geometries.find((g) => g.id === 'poly').holes).toHaveLength(1);
        expect(geometries.map((g) => g.id)).toContain('mp#1');

        const fc = geometriesToGeoJSON(geometries);
        expect(fc.features).toHaveLength(11);
        expect(fc.features.find((f) => f.id === 'poly').geometry.coordinates).toEqual(mixedCollection.features[4].geometry.coordinates);
    });

    it('exports geometry objects with their current state', () => {
        const geo = new GeoJSONGroup(undefined, quiet);
        const p = geo.addGeometry(new Point([1, 2, 3], { id: 'p' }));
        p.vectors = [4, 5, 6];   // not yet updated
        expect(geo.toGeoJSON().features[0].geometry.coordinates).toEqual([4, 5, 6]);
    });
});
