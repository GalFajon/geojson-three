import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import {
    GeoJSONGroup, Point, Line, Polygon, geometriesFromGeoJSON, geometriesToGeoJSON, downloadGeoJSON,
} from '../../src/index.js';
import { createStage, kv, fmt, coordReadout } from '../shared/stage.js';

// UTM zone 33N (EPSG:32633); helper takes metre offsets from a site origin
const E = 512300, N = 5102400, H = 295;
const at = (x, y, z = 0) => [E + x, N + y, H + z];

const STYLE = {
    fillColor: '#c7d2e0', fillOpacity: 0.8, strokeColor: '#4b5563', strokeWidth: 1.5,
    lineColor: '#2563c9', lineWidth: 3,
    pointColor: '#d94f30', pointSize: 11, pointOutlineColor: '#1f2933',
};
const HIGHLIGHT = { fillColor: '#fde68a', strokeColor: '#d97706', lineColor: '#d97706', pointColor: '#d97706', fillOpacity: 0.9 };
const quiet = () => {};

// ---------------------------------------------------------------------------- scene

const stage = createStage();
const { camera, controls, renderer, scene } = stage;

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
labels.domElement.className = 'labels';
renderer.domElement.after(labels.domElement);
addEventListener('resize', () => labels.setSize(innerWidth, innerHeight));
stage.onTick(() => labels.render(scene, camera));

const grid = new THREE.GridHelper(240, 48, 0xaab2bd, 0xd5dae1);
grid.rotation.x = Math.PI / 2;
grid.position.set(...at(30, 15, -0.02));
scene.add(grid);

/** The features being edited. */
const geo = new GeoJSONGroup(undefined, { style: STYLE, highlightStyle: HIGHLIGHT, onWarning: quiet });
scene.add(geo);

/** Vertex handles and snap indicator, drawn on top. */
const handles = new GeoJSONGroup(undefined, { style: (f) => f.properties.style, onWarning: quiet });
handles.setDepthTest(false);
handles.addFeature({ type: 'Feature', id: 'vertices', properties: { style: { pointColor: '#ffffff', pointOutlineColor: '#1f2933', pointSize: 10 } }, geometry: { type: 'MultiPoint', coordinates: [] } });
handles.addFeature({ type: 'Feature', id: 'snap', properties: { style: { pointColor: '#16a34a', pointOutlineColor: '#ffffff', pointSize: 14 } }, geometry: { type: 'MultiPoint', coordinates: [] } });
scene.add(handles);

/** Rubber-band preview while drawing, with live measurements. */
const preview = new GeoJSONGroup(undefined, { style: (f) => f.properties.style, onWarning: quiet });
preview.setDepthTest(false);
preview.setShowMeasurements(true);
const SKETCH = { lineColor: '#d97706', lineWidth: 2, dashed: true, dashSize: 0.8, gapSize: 0.5, fillColor: '#fde68a', fillOpacity: 0.35, strokeColor: '#d97706', strokeWidth: 2 };
preview.addFeature({ type: 'Feature', id: 'sketch', properties: { style: SKETCH }, geometry: null });
scene.add(preview);

// ---------------------------------------------------------------------------- initial data

const counters = { Point: 0, Line: 0, Polygon: 0 };
const nextName = (type) => `${type} ${++counters[type]}`;

geo.addGeometries([
    new Polygon([
        [at(0, 0), at(60, 0), at(60, 40), at(0, 40)],
        [at(38, 8), at(38, 22), at(52, 22), at(52, 8)],
    ], { properties: { name: 'Parcel 1734/2', land_use: 'residential' } }),
    new Polygon([[at(8, 14, 0.05), at(30, 14, 0.05), at(30, 26, 0.05), at(8, 26, 0.05)]],
        { properties: { name: 'Building footprint' }, style: { fillColor: '#e5e7eb', fillOpacity: 1 } }),
    new Line([at(-15, -7.5), at(75, -7.5)], { properties: { name: 'Road axis' }, style: { lineColor: '#6b7280' } }),
    new Line([at(-15, -3), at(19, -3), at(19, 14, 0.05)], { properties: { name: 'Water main', dn_mm: 110 } }),
    ...[[4, 4], [4, 34], [55, 32], [44, 30]].map(([x, y], i) => new Point(at(x, y, 0.1), { properties: { name: `Tree ${i + 1}` }, style: { pointColor: '#4caf50', pointOutlineColor: '#1b5e20' } })),
]);
counters.Polygon = 2; counters.Line = 2; counters.Point = 4;

stage.fit(geo.getBoundingBox(), new THREE.Vector3(-0.25, -0.7, 1), 0.75);
controls.target.x -= 12; camera.position.x -= 12; // keep clear of the panel

// ---------------------------------------------------------------------------- geometry helpers

/** All vertices of a geometry as { ring, index, v }. ring -1 = point, 0 = outer / line, 1.. = holes. */
function vertices(g) {
    if (g instanceof Point) return [{ ring: -1, index: 0, v: g.vectors }];
    const rings = g instanceof Polygon ? [g.vectors, ...g.holes] : [g.vectors];
    return rings.flatMap((r, ring) => r.map((v, index) => ({ ring, index, v })));
}
const ringOf = (g, ring) => (ring === 0 ? g.vectors : g.holes[ring - 1]);
function setVertex(g, ring, index, v) {
    if (ring === -1) g.vectors = [...v];
    else ringOf(g, ring)[index] = [...v];
}
function cloneVectors(g) {
    return { vectors: structuredClone(g.vectors), holes: g instanceof Polygon ? structuredClone(g.holes) : null };
}

// ---------------------------------------------------------------------------- screen / ground helpers

const raycaster = new THREE.Raycaster();
raycaster.params.Line2 = { threshold: 8 };
const ndc = new THREE.Vector2();
const plane = new THREE.Plane();

function setRay(e) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
}

/** Intersection of the pointer ray with the horizontal plane at height z (float64). */
function ground(e, z = H) {
    setRay(e);
    plane.set(new THREE.Vector3(0, 0, 1), -z);
    const p = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return p ? [p.x, p.y, z] : null;
}

const _v = new THREE.Vector3();
function toScreen(v) {
    _v.set(v[0], v[1], v[2]).project(camera);
    return [(_v.x + 1) / 2 * innerWidth, (1 - _v.y) / 2 * innerHeight, _v.z];
}

/** Candidate closest to the pointer on screen, within maxPx. */
function nearestOnScreen(e, candidates, maxPx = 10) {
    let best = null, bestD = maxPx;
    for (const c of candidates) {
        const [x, y, z] = toScreen(c.v);
        if (z > 1) continue; // behind camera
        const d = Math.hypot(x - e.clientX, y - e.clientY);
        if (d < bestD) { best = c; bestD = d; }
    }
    return best;
}

let snapping = true;
/** Existing vertex under the pointer (optionally excluding one vertex being dragged). */
function snapAt(e, exclude) {
    if (!snapping) return null;
    const candidates = [];
    for (const g of geo.geometries) for (const c of vertices(g)) {
        if (exclude && g === exclude.g && c.ring === exclude.ring && c.index === exclude.index) continue;
        candidates.push(c);
    }
    for (const v of drawing.slice(0, -1)) candidates.push({ v });
    return nearestOnScreen(e, candidates, 12)?.v ?? null;
}

function pick(e) {
    setRay(e);
    raycaster.params.Points.threshold = camera.position.distanceTo(controls.target) * Math.tan(camera.fov * Math.PI / 360) * 16 / innerHeight;
    const hit = raycaster.intersectObject(geo, true)[0];
    const res = geo.featureFromIntersection(hit);
    return res ? { geometry: res.geometry, point: hit.point } : null;
}

// ---------------------------------------------------------------------------- state & UI

let tool = 'select';
let selected = null;
/** Vertices of the feature being drawn. */
let drawing = [];
/** Active drag: { type: 'vertex', ring, index } | { type: 'move', start, z, orig }. */
let drag = null;
let downAt = null;

const statusEl = document.getElementById('status');
const selectionEl = document.getElementById('selection');
const readout = coordReadout();

const HINTS = {
    select: 'Click a feature to select it. Drag vertices or the feature itself. Double-click an edge to insert a vertex.',
    point: 'Click to place a point.',
    line: 'Click to add vertices. Enter or double-click to finish, Backspace to undo, Esc to cancel.',
    polygon: 'Click to add vertices (3+). Enter or double-click to finish, Backspace to undo, Esc to cancel.',
};

function setTool(t) {
    cancelDrawing();
    tool = t;
    for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('active', b.dataset.tool === t);
    if (t !== 'select') select(null);
    statusEl.textContent = HINTS[t];
    renderer.domElement.style.cursor = t === 'select' ? '' : 'crosshair';
}

function select(g) {
    if (selected) geo.setHighlighted(selected, false);
    selected = g;
    if (g) geo.setHighlighted(g, true);
    refreshHandles();
    updatePanel();
}

function refreshHandles() {
    handles.updateFeature('vertices', {
        type: 'Feature', id: 'vertices', properties: handles.getFeature('vertices').properties,
        geometry: { type: 'MultiPoint', coordinates: selected ? vertices(selected).map((c) => c.v) : [] },
    });
}

function showSnap(v) {
    handles.updateFeature('snap', {
        type: 'Feature', id: 'snap', properties: handles.getFeature('snap').properties,
        geometry: { type: 'MultiPoint', coordinates: v ? [v] : [] },
    });
}

function updatePanel() {
    if (!selected) { selectionEl.innerHTML = '<p>Nothing selected.</p>'; return; }
    const g = selected;
    const stats = { type: g.type, id: g.id, vertices: vertices(g).length };
    if (g instanceof Point) Object.assign(stats, { E: fmt(g.vectors[0]), N: fmt(g.vectors[1]), H: fmt(g.vectors[2]) });
    if (g instanceof Line) stats.length = `${fmt(g.calculateLength(), 2)} m`;
    if (g instanceof Polygon) Object.assign(stats, { perimeter: `${fmt(g.calculatePerimeter(), 2)} m`, area: `${fmt(g.calculateArea(), 2)} m²`, holes: g.holes.length });
    selectionEl.innerHTML = `<input type="text" id="name" placeholder="name" />${kv(stats)}<div class="btns" style="margin-top:6px"><button id="del">Delete</button></div>`;
    const name = /** @type {HTMLInputElement} */ (document.getElementById('name'));
    name.value = g.properties.name ?? '';
    name.oninput = () => { g.properties.name = name.value; };
    document.getElementById('del').onclick = deleteSelected;
}

function deleteSelected() {
    if (!selected) return;
    const g = selected;
    select(null);
    geo.removeGeometry(g);
}

// ---------------------------------------------------------------------------- drawing

function updateSketch(cursor) {
    const pts = cursor ? [...drawing, cursor] : drawing;
    let geometry = null;
    if (tool === 'polygon' && pts.length >= 3) geometry = { type: 'Polygon', coordinates: [[...pts, pts[0]]] };
    else if (pts.length >= 2) geometry = { type: 'LineString', coordinates: pts };
    preview.updateFeature('sketch', { type: 'Feature', id: 'sketch', properties: { style: SKETCH }, geometry });
}

function finishDrawing() {
    const pts = drawing;
    drawing = [];
    updateSketch(null);
    let g = null;
    if (tool === 'line' && pts.length >= 2) g = new Line(pts, { properties: { name: nextName('Line') } });
    if (tool === 'polygon' && pts.length >= 3) g = new Polygon([pts], { properties: { name: nextName('Polygon') } });
    if (!g) return;
    geo.addGeometry(g);
    setTool('select');
    select(g);
}

function cancelDrawing() {
    drawing = [];
    updateSketch(null);
    showSnap(null);
}

// ---------------------------------------------------------------------------- pointer input

const canvas = renderer.domElement;
// take keyboard focus on click so shortcuts work right after interacting with the scene
canvas.tabIndex = 0;
canvas.style.outline = 'none';
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));

// capture phase: runs before OrbitControls, so a vertex/feature drag can switch the controls off
canvas.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
    if (tool !== 'select' || e.button !== 0) return;

    if (selected) {
        const h = nearestOnScreen(e, vertices(selected));
        if (h && e.altKey) { removeVertex(h); return; }
        if (h) {
            drag = { type: 'vertex', ring: h.ring, index: h.index };
            controls.enabled = false;
            return;
        }
    }
    const hit = pick(e);
    if (hit && hit.geometry && hit.geometry === selected) {
        drag = { type: 'move', z: hit.point.z, start: ground(e, hit.point.z), orig: cloneVectors(selected) };
        controls.enabled = false;
    }
}, { capture: true });

canvas.addEventListener('pointermove', (e) => {
    const snap = tool !== 'select' || drag?.type === 'vertex'
        ? snapAt(e, drag?.type === 'vertex' ? { g: selected, ring: drag.ring, index: drag.index } : null)
        : null;
    showSnap(snap);

    const g0 = ground(e);
    readout(snap ? new THREE.Vector3(...snap) : g0 ? new THREE.Vector3(...g0) : null);

    if (drag?.type === 'vertex') {
        const cur = vertices(selected).find((c) => c.ring === drag.ring && c.index === drag.index);
        const p = snap ?? ground(e, cur.v[2]);
        if (!p) return;
        setVertex(selected, drag.ring, drag.index, p);
        selected.update();
        refreshHandles();
        updatePanel();
        return;
    }
    if (drag?.type === 'move') {
        const p = ground(e, drag.z);
        if (!p || !drag.start) return;
        const dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
        const shift = (v) => [v[0] + dx, v[1] + dy, v[2]];
        if (selected instanceof Point) selected.vectors = shift(drag.orig.vectors);
        else selected.vectors = drag.orig.vectors.map(shift);
        if (selected instanceof Polygon) selected.holes = drag.orig.holes.map((r) => r.map(shift));
        selected.update();
        refreshHandles();
        updatePanel();
        return;
    }
    if (tool === 'line' || tool === 'polygon') {
        if (drawing.length) updateSketch(snap ?? g0);
    }
});

addEventListener('pointerup', (e) => {
    const wasDrag = drag;
    if (drag) { drag = null; controls.enabled = true; }
    if (!downAt || e.button !== 0 || e.target !== canvas) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 4 || wasDrag) return;

    if (tool === 'select') {
        if (e.altKey) return;
        select(pick(e)?.geometry ?? null);
        return;
    }
    const p = snapAt(e) ?? ground(e);
    if (!p) return;
    if (tool === 'point') {
        const g = geo.addGeometry(new Point(p, { properties: { name: nextName('Point') } }));
        select(g);
        return;
    }
    drawing.push(p);
    updateSketch(p);
});

canvas.addEventListener('dblclick', (e) => {
    if (tool === 'line' || tool === 'polygon') {
        // the two clicks of a double-click added the same vertex twice
        const n = drawing.length;
        if (n >= 2 && Math.hypot(drawing[n - 1][0] - drawing[n - 2][0], drawing[n - 1][1] - drawing[n - 2][1]) < 1e-6) drawing.pop();
        finishDrawing();
        return;
    }
    if (tool === 'select' && (selected instanceof Line || selected instanceof Polygon)) insertVertex(e);
});

function insertVertex(e) {
    const hit = pick(e);
    if (!hit || hit.geometry !== selected) return;
    const p = ground(e, hit.point.z);
    if (!p) return;
    const rings = selected instanceof Polygon ? [selected.vectors, ...selected.holes] : [selected.vectors];
    let best = null;
    rings.forEach((r, ring) => {
        const closed = selected instanceof Polygon;
        for (let i = 0; i < r.length - (closed ? 0 : 1); i++) {
            const a = r[i], b = r[(i + 1) % r.length];
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
            const q = [a[0] + t * dx, a[1] + t * dy, a[2] + t * (b[2] - a[2])];
            const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
            if (!best || d < best.d) best = { d, ring, at: i + 1, q };
        }
    });
    if (!best) return;
    ringOf(selected, best.ring).splice(best.at, 0, best.q);
    selected.update();
    refreshHandles();
    updatePanel();
}

function removeVertex(h) {
    if (h.ring === -1) return;
    const r = ringOf(selected, h.ring);
    const min = selected instanceof Polygon ? 3 : 2;
    if (r.length <= min) {
        if (h.ring > 0) selected.holes.splice(h.ring - 1, 1); // drop a degenerate hole entirely
        else return;
    }
    else r.splice(h.index, 1);
    selected.update();
    refreshHandles();
    updatePanel();
}

// ---------------------------------------------------------------------------- keyboard & buttons

addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    else if (k === 'p') setTool('point');
    else if (k === 'l') setTool('line');
    else if (k === 'g') setTool('polygon');
    else if (k === 'enter') finishDrawing();
    else if (k === 'escape') { if (drawing.length) cancelDrawing(); else select(null); }
    else if (k === 'backspace' && drawing.length) { drawing.pop(); updateSketch(drawing[drawing.length - 1] ?? null); }
    else if (k === 'delete' || k === 'backspace') deleteSelected();
    else if (k === 'm') document.getElementById('measure').click();
    else if (k === 's') document.getElementById('snap').click();
    else return;
    e.preventDefault();
});

for (const b of document.querySelectorAll('#tools button')) b.addEventListener('click', () => setTool(b.dataset.tool));

const toggle = (id, initial, fn) => {
    const b = document.getElementById(id);
    let on = initial;
    b.classList.toggle('active', on);
    b.addEventListener('click', () => { on = !on; b.classList.toggle('active', on); fn(on); });
};
toggle('measure', false, (on) => geo.setShowMeasurements(on));
toggle('snap', true, (on) => { snapping = on; if (!on) showSnap(null); });
toggle('ontop', false, (on) => geo.setDepthTest(!on));

document.getElementById('export').onclick = () => downloadGeoJSON(geometriesToGeoJSON(geo.geometries), 'edited');
document.getElementById('clear').onclick = () => { select(null); for (const g of geo.geometries) geo.removeGeometry(g); };
document.getElementById('file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const imported = geometriesFromGeoJSON(JSON.parse(await file.text()), { onWarning: quiet });
    for (const g of imported) {
        let id = g.id, n = 1;
        while (geo.entries.has(id)) id = `${g.id}-${n++}`;
        g.id = id;
    }
    geo.addGeometries(imported);
    stage.fit(geo.getBoundingBox(), new THREE.Vector3(-0.25, -0.7, 1), 0.75);
    e.target.value = '';
});

setTool('select');
