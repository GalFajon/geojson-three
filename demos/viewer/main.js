import { GeoJSONGroup, simplestyle, normalizeGeoJSON } from '../../src/index.js';
import { createStage, kv, fmt, coordReadout, rng } from '../shared/stage.js';

const stage = createStage({ background: '#eef0f3', far: 1e8 });
const statsEl = document.getElementById('stats');
const selection = document.getElementById('selection');
const readout = coordReadout(['x', 'y', 'z'], 2);
let geo = null, selected = null;

// --- projection ------------------------------------------------------------------------
const R = 6378137, deg = Math.PI / 180;
const webMercator = ([lon, lat, h]) => [R * lon * deg, R * Math.log(Math.tan(Math.PI / 4 + (lat * deg) / 2)), h];

/** RFC 7946: no `crs` member and every position within lon/lat bounds. */
function isLonLat(geojson) {
    if (geojson.crs) return false;
    let any = false;
    for (const r of normalizeGeoJSON(geojson, { onWarning: () => {} })) {
        for (const [x, y] of [...r.points, ...r.lines.flat(), ...r.polygons.flat(2)]) {
            if (Math.abs(x) > 180 || Math.abs(y) > 90) return false;
            any = true;
        }
    }
    return any;
}

// --- loading -----------------------------------------------------------------------------
function show(geojson, name) {
    if (geo) { stage.scene.remove(geo); geo.dispose(); }
    selected = null;
    selection.innerHTML = '<p>Click a feature.</p>';

    const lonLat = isLonLat(geojson);
    const warnings = [];
    const t0 = performance.now();
    geo = new GeoJSONGroup(geojson, {
        transform: lonLat ? webMercator : null,
        style: (f) => ({ fillColor: '#c7d2e0', fillOpacity: 0.85, strokeColor: '#4b5563', strokeWidth: 1, lineColor: '#2563c9', lineWidth: 2, pointColor: '#d94f30', pointSize: 9, pointOutlineColor: '#1f2933', ...simplestyle(f) }),
        highlightStyle: { fillColor: '#fde68a', lineColor: '#d97706', pointColor: '#d97706', fillOpacity: 1 },
        onWarning: (m) => warnings.push(m),
    });
    const ms = performance.now() - t0;
    stage.scene.add(geo);

    const box = geo.getBoundingBox();
    if (!box.isEmpty()) {
        stage.fit(box, new stage.THREE.Vector3(0, -0.5, 1), 0.75);
        const shift = box.getSize(new stage.THREE.Vector3()).x * 0.18; // keep clear of the side panel
        stage.controls.target.x -= shift;
        stage.camera.position.x -= shift;
    }
    const types = {};
    for (const e of geo.entries.values()) { const t = e.record.source.geometry?.type ?? 'null'; types[t] = (types[t] ?? 0) + 1; }

    statsEl.innerHTML = kv({
        source: name,
        features: geo.entries.size,
        ...Object.fromEntries(Object.entries(types).map(([k, v]) => [`  ${k}`, v])),
        CRS: lonLat ? 'EPSG:4326 → EPSG:3857' : (geojson.crs?.properties?.name ?? 'as-is (no crs)'),
        'bbox min': box.isEmpty() ? '—' : `${fmt(box.min.x, 1)}, ${fmt(box.min.y, 1)}`,
        'bbox max': box.isEmpty() ? '—' : `${fmt(box.max.x, 1)}, ${fmt(box.max.y, 1)}`,
        'build time': `${ms.toFixed(0)} ms`,
        warnings: warnings.length ? `${warnings.length}: ${warnings.slice(0, 3).join('; ')}` : 'none',
    });
}

async function loadFile(file) {
    try { show(JSON.parse(await file.text()), file.name); }
    catch (e) { statsEl.innerHTML = kv({ error: e.message }); }
}

// --- picking -------------------------------------------------------------------------------
const raycaster = new stage.THREE.Raycaster();
raycaster.params.Line2 = { threshold: 6 };
function hitAt(e) {
    if (!geo) return null;
    raycaster.setFromCamera(new stage.THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), stage.camera);
    raycaster.params.Points.threshold = stage.camera.position.distanceTo(stage.controls.target) * Math.tan(stage.camera.fov * Math.PI / 360) * 10 / innerHeight;
    return raycaster.intersectObject(geo, true)[0] ?? null;
}
stage.renderer.domElement.addEventListener('pointermove', (e) => readout(hitAt(e)?.point));
stage.renderer.domElement.addEventListener('click', (e) => {
    const res = geo?.featureFromIntersection(hitAt(e));
    if (selected != null) geo.setHighlighted(selected, false);
    selected = res?.key ?? null;
    if (selected == null) { selection.innerHTML = '<p>Click a feature.</p>'; return; }
    geo.setHighlighted(selected, true);
    selection.innerHTML = `<p><code>${String(selected)}</code> · ${res.feature.geometry?.type}</p>` + kv(res.feature.properties);
});

// --- file input, drag & drop, export ---------------------------------------------------
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('dragging'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
document.getElementById('file').addEventListener('change', (e) => e.target.files[0] && loadFile(e.target.files[0]));
document.getElementById('export').onclick = () => {
    if (!geo) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(geo.toGeoJSON(), null, 2)], { type: 'application/geo+json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'export.geojson' }).click();
    URL.revokeObjectURL(url);
};

// --- synthetic RFC 7946 sample (lon/lat, WGS 84), a fictional town -------------
function sample() {
    const lon0 = 13.4120, lat0 = 47.8230, kx = 1 / (111320 * Math.cos(lat0 * deg)), ky = 1 / 110540;
    const ll = (x, y) => [+(lon0 + x * kx).toFixed(7), +(lat0 + y * ky).toFixed(7)];
    const rect = (x, y, w, h, a) => {
        const c = Math.cos(a), s = Math.sin(a);
        const pts = [[0, 0], [w, 0], [w, h], [0, h]].map(([u, v]) => ll(x + u * c - v * s, y + u * s + v * c));
        return [[...pts, pts[0]]];
    };
    const rand = rng(11);
    const features = [];
    let no = 120;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) {
        const w = 28 + rand() * 14, h = 30 + rand() * 12;
        features.push({ type: 'Feature', properties: { parcel_no: `${no++}/1`, area_m2: Math.round(w * h), fill: '#e8e3d3', stroke: '#6b6250', 'stroke-width': 1 }, geometry: { type: 'Polygon', coordinates: rect(col * 48, row * 52, w, h, 0.12) } });
    }
    features.push({ type: 'Feature', properties: { name: 'river (synthetic)', class: 'watercourse', stroke: '#2563c9', 'stroke-width': 5 }, geometry: { type: 'LineString', coordinates: Array.from({ length: 30 }, (_, i) => ll(-60 + i * 14, -40 + 22 * Math.sin(i / 4))) } });
    features.push({ type: 'Feature', properties: { name: 'street network', class: 'road', stroke: '#6b7280', 'stroke-width': 3 }, geometry: { type: 'MultiLineString', coordinates: [[ll(-30, 46), ll(360, 90)], [ll(-30, 98), ll(360, 142)], [ll(150, -30), ll(110, 230)]] } });
    const pois = [['pharmacy', 60, 20], ['school', 240, 160], ['bus stop', 150, 50], ['post office', 300, 100]];
    for (const [kind, x, y] of pois) features.push({ type: 'Feature', properties: { name: kind, 'marker-color': '#d94f30', 'marker-size': 'medium' }, geometry: { type: 'Point', coordinates: ll(x, y) } });
    return { type: 'FeatureCollection', features };
}

document.getElementById('sample').onclick = () => show(sample(), 'sample (synthetic, EPSG:4326)');
show(sample(), 'sample (synthetic, EPSG:4326)');
