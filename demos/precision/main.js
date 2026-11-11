import { GeoJSONGroup, normalizeGeoJSON } from '../../src/index.js';
import { createStage, circle, kv, fmt } from '../shared/stage.js';

// ECEF-magnitude coordinates, metres
const X = 4_282_123.4567, Y = 1_112_456.7891, Z = 4_583_210.9123;
const mm = 0.001;
const p = (x, y, z = 0) => [X + x * mm, Y + y * mm, Z + z * mm];
const ring = (r, z = 0, n = 64) => circle(X, Y, Z + z * mm, r * mm, n);

const features = [];
const add = (id, geometry, style) => features.push({ type: 'Feature', id, properties: { style }, geometry });

// target: white disc, two black quadrants, reference rings, crosshair, centre point
add('disc', { type: 'Polygon', coordinates: [ring(10)] }, { fillColor: '#ffffff', fillOpacity: 1, strokeColor: '#111827', strokeWidth: 1.5 });
const wedge = (a0) => {
    const pts = [p(0, 0, 0.05)];
    for (let i = 0; i <= 16; i++) { const a = a0 + (i / 16) * Math.PI / 2; pts.push(p(8 * Math.cos(a), 8 * Math.sin(a), 0.05)); }
    pts.push(pts[0]);
    return [pts];
};
add('quadrants', { type: 'MultiPolygon', coordinates: [wedge(0), wedge(Math.PI)] }, { fillColor: '#111827', fillOpacity: 1, strokeWidth: 0 });
add('rings', { type: 'MultiLineString', coordinates: [2, 4, 6].map((r) => ring(r, 0.1)) }, { lineColor: '#9ca3af', lineWidth: 1 });
add('crosshair', { type: 'MultiLineString', coordinates: [[p(-14, 0, 0.15), p(14, 0, 0.15)], [p(0, -14, 0.15), p(0, 14, 0.15)]] }, { lineColor: '#d94f30', lineWidth: 1.5 });
add('centre', { type: 'Point', coordinates: p(0, 0, 0.2) }, { pointColor: '#d94f30', pointSize: 7, pointOutlineColor: '#ffffff' });

// 20 mm scale bar with 1 mm ticks
const ticks = [];
for (let i = 0; i <= 20; i++) ticks.push([p(-10 + i, -17), p(-10 + i, -17 + (i % 5 === 0 ? 2 : 1))]);
add('scalebar', { type: 'MultiLineString', coordinates: [[p(-10, -17), p(10, -17)], ...ticks] }, { lineColor: '#111827', lineWidth: 1.2 });

const fc = { type: 'FeatureCollection', features };
const stage = createStage({ background: '#e5e7eb' });

let geo = null;
function build(naive) {
    if (geo) { stage.scene.remove(geo); geo.dispose(); }
    geo = new GeoJSONGroup(fc, { style: (f) => f.properties.style });
    if (naive) bakeAbsoluteFloat32(geo);
    stage.scene.add(geo);
    document.getElementById('anchored').classList.toggle('active', !naive);
    document.getElementById('naive').classList.toggle('active', naive);
    document.getElementById('mode').textContent = naive
        ? 'Every vertex rounds to the same float32 value (0.5 m grid). All triangles and segments are degenerate, so nothing is drawn.'
        : 'Float64 anchor per feature in object.position, float32 offsets in the buffers. three.js cancels the translation in float64 when it builds modelViewMatrix.';
}

/** What a naive renderer does: absolute coordinates straight into Float32 buffers. */
function bakeAbsoluteFloat32(geo) {
    for (const obj of geo.children) {
        const a = obj.position.clone();
        for (const m of obj.isPoints ? [obj] : obj.children) {
            const g = m.geometry;
            const buf = g.attributes.instanceStart ? g.attributes.instanceStart.data : g.attributes.position;
            for (let i = 0; i < buf.array.length; i += 3) { buf.array[i] += a.x; buf.array[i + 1] += a.y; buf.array[i + 2] += a.z; }
            buf.needsUpdate = true;
            g.computeBoundingSphere();
            m.frustumCulled = false;
        }
        obj.position.set(0, 0, 0);
    }
}

// error statistics over all source vertices
const all = normalizeGeoJSON(fc).flatMap((r) => [...r.points, ...r.lines.flat(), ...r.polygons.flat(2)]);
const anchoredGeo = new GeoJSONGroup(fc, { style: (f) => f.properties.style });
let errAnchored = 0;
for (const obj of anchoredGeo.children) {
    for (const m of obj.isPoints ? [obj] : obj.children) {
        const g = m.geometry;
        const arr = (g.attributes.instanceStart?.data ?? g.attributes.position).array;
        for (let i = 0; i < arr.length; i += 3) {
            // nearest source vertex (tiny dataset, brute force is fine)
            const w = [obj.position.x + arr[i], obj.position.y + arr[i + 1], obj.position.z + arr[i + 2]];
            let best = Infinity;
            for (const s of all) best = Math.min(best, Math.hypot(w[0] - s[0], w[1] - s[1], w[2] - s[2]));
            errAnchored = Math.max(errAnchored, best);
        }
    }
}
anchoredGeo.dispose();
const errNaive = Math.max(...all.map((s) => Math.hypot(...s.map((v) => Math.fround(v) - v))));
const ulp = (x) => 2 ** (Math.floor(Math.log2(Math.abs(x))) - 23);

document.getElementById('stats').innerHTML = kv({
    'target centre X': fmt(X, 4),
    'target centre Y': fmt(Y, 4),
    'target centre Z': fmt(Z, 4),
    'float32 spacing at Z': `${ulp(Z)} m`,
    'vertices': all.length,
    'max error, anchored': `${(errAnchored * 1e9).toFixed(2)} nm`,
    'max error, absolute f32': `${(errNaive * 1e3).toFixed(1)} mm`,
});

document.getElementById('anchored').onclick = () => build(false);
document.getElementById('naive').onclick = () => build(true);
build(false);
stage.fit(geo.getBoundingBox(), new stage.THREE.Vector3(0.0, -0.3, 1), 1.05);
