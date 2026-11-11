import { CanvasTexture, SRGBColorSpace } from 'three';
import { GeoJSONGroup } from '../../src/index.js';
import { createStage, tooltip, kv, coordReadout } from '../shared/stage.js';

// UTM zone 33N (EPSG:32633). Local helper: offsets in metres from a site origin.
const E = 512300.000, N = 5102400.000, H = 295.000;
const at = (x, y, z = 0) => [E + x, N + y, H + z];

/** Small map symbol drawn on a canvas, used as a point texture (pointTexture). */
function icon(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    draw(c.getContext('2d'));
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
}
const TREE_ICON = icon((g) => {
    g.fillStyle = '#3f7d4e'; g.strokeStyle = '#1f3d27'; g.lineWidth = 4;
    g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#6aa679';
    for (const [x, y] of [[22, 24], [40, 22], [30, 40], [44, 38]]) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#1f3d27'; g.beginPath(); g.arc(32, 32, 3, 0, Math.PI * 2); g.fill();
});
const SURVEY_ICON = icon((g) => {
    g.fillStyle = '#ffffff'; g.strokeStyle = '#d94f30'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(32, 6); g.lineTo(59, 54); g.lineTo(5, 54); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#1f2933'; g.beginPath(); g.arc(32, 38, 5, 0, Math.PI * 2); g.fill();
});
const closed = (pts) => [...pts, pts[0]];

const CATEGORIES = {
    parcel:   { label: 'Cadastral parcel',  fillColor: '#e8e3d3', fillOpacity: 1, strokeColor: '#6b6250', strokeWidth: 1.5 },
    paving:   { label: 'Paved courtyard',   fillColor: '#d3d0c9', fillOpacity: 1, strokeColor: '#8d8a84', strokeWidth: 1 },
    building: { label: 'Building (walls)',  fillColor: '#f4f4f2', fillOpacity: 1, strokeColor: '#3a3f45', strokeWidth: 1.2 },
    roof:     { label: 'Building (roof)',   fillColor: '#9c5a4a', fillOpacity: 1, strokeColor: '#5e3329', strokeWidth: 1.2 },
    wall:     { label: 'Boundary wall',     fillColor: '#c9c3b6', fillOpacity: 1, strokeColor: '#6b6250', strokeWidth: 1 },
    road:     { label: 'Carriageway',       fillColor: '#b9bec5', fillOpacity: 1, strokeColor: '#7d848c', strokeWidth: 1 },
    axis:     { label: 'Road axis',         lineColor: '#ffffff', lineWidth: 2, dashed: true, dashSize: 3, gapSize: 2 },
    utility:  { label: 'Water main',        lineColor: '#2563c9', lineWidth: 2.5, dashed: true, dashSize: 1.2, gapSize: 0.8 },
    lamp:     { label: 'Street lamp',       lineColor: '#4b5563', lineWidth: 2, pointColor: '#facc15', pointSize: 9, pointOutlineColor: '#4b5563' },
    tree:     { label: 'Tree',              pointColor: '#ffffff', pointSize: 22, pointTexture: TREE_ICON },
    survey:   { label: 'Survey control',    pointColor: '#ffffff', pointSize: 18, pointTexture: SURVEY_ICON },
    stake:    { label: 'Stake-out points',  pointColor: '#facc15', pointSize: 8, pointOutlineColor: '#1f2933' },
    rover:    { label: 'GNSS rover (live)', pointColor: '#f59e0b', pointSize: 13, pointOutlineColor: '#7c4a03' },
};

const features = [];
const add = (id, category, geometry, attrs = {}) => features.push({ type: 'Feature', id, properties: { category, ...attrs }, geometry });

// parcel with an interior ring (courtyard excluded from the parcel surface)
add('parcel-1734-2', 'parcel', {
    type: 'Polygon', coordinates: [
        closed([at(0, 0), at(60, 0), at(60, 40), at(0, 40)]),
        closed([at(38, 8), at(38, 22), at(52, 22), at(52, 8)]),
    ]
}, { parcel_no: '1734/2', area_m2: 2204, land_use: 'residential' });
add('courtyard', 'paving', { type: 'Polygon', coordinates: [closed([at(38, 8, -0.02), at(38, 22, -0.02), at(52, 22, -0.02), at(52, 8, -0.02)])] }, { material: 'concrete pavers' });

// building: 4 vertical wall faces (two of them gabled) + a pitched roof (tilted planes)
{
    const x0 = 8, y0 = 14, w = 22, d = 12, h = 6.5, ridge = 10.2;
    const wall = (a, b) => [closed([at(...a, 0), at(...b, 0), at(...b, h), at(...a, h)])];
    const gable = (a, b) => [closed([at(...a, 0), at(...b, 0), at(...b, h), at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ridge), at(...a, h)])];
    add('bldg-walls', 'building', {
        type: 'MultiPolygon', coordinates: [
            wall([x0, y0], [x0 + w, y0]), gable([x0 + w, y0], [x0 + w, y0 + d]),
            wall([x0 + w, y0 + d], [x0, y0 + d]), gable([x0, y0 + d], [x0, y0]),
        ]
    }, { building_id: 'S-20417', floors: 2, height_m: ridge, use: 'residential' });
    const o = 0.5;
    add('bldg-roof', 'roof', {
        type: 'MultiPolygon', coordinates: [
            [closed([at(x0 - o, y0 - o, h - 0.3), at(x0 + w + o, y0 - o, h - 0.3), at(x0 + w + o, y0 + d / 2, ridge), at(x0 - o, y0 + d / 2, ridge)])],
            [closed([at(x0 - o, y0 + d + o, h - 0.3), at(x0 - o, y0 + d / 2, ridge), at(x0 + w + o, y0 + d / 2, ridge), at(x0 + w + o, y0 + d + o, h - 0.3)])],
        ]
    }, { building_id: 'S-20417', roof_type: 'gable', pitch_deg: 32 });
}

// boundary wall along the north and east parcel edges: vertical polygons, 1.8 m
{
    const segs = [[[0, 40], [60, 40]], [[60, 40], [60, 0]]];
    add('boundary-wall', 'wall', {
        type: 'MultiPolygon',
        coordinates: segs.map(([a, b]) => [closed([at(...a, 0), at(...b, 0), at(...b, 1.8), at(...a, 1.8)])]),
    }, { material: 'stone', height_m: 1.8 });
}

// road: carriageway polygon + dashed axis
add('road', 'road', { type: 'Polygon', coordinates: [closed([at(-15, -11, -0.05), at(75, -11, -0.05), at(75, -4, -0.05), at(-15, -4, -0.05)])] }, { name: 'Station Road', class: 'local', width_m: 7 });
add('road-axis', 'axis', { type: 'LineString', coordinates: [at(-15, -7.5, 0), at(75, -7.5, 0)] }, { name: 'Station Road', chainage_start: '0+000' });

// water main + house connection (MultiLineString)
add('water', 'utility', {
    type: 'MultiLineString', coordinates: [
        [at(-15, -2, 0.02), at(75, -2, 0.02)],
        [at(19, -2, 0.02), at(19, 6, 0.02), at(19, 14, 0.02)],
    ]
}, { network: 'water', material: 'PE100', dn_mm: 110 });

// street lamps: GeometryCollection of a pole (vertical line) + luminaire (point)
for (const [i, x] of [0, 30, 60].entries()) {
    add(`lamp-${i}`, 'lamp', {
        type: 'GeometryCollection', geometries: [
            { type: 'LineString', coordinates: [at(x, -3.2, 0), at(x, -3.2, 7)] },
            { type: 'Point', coordinates: at(x, -3.2, 7) },
        ]
    }, { asset_id: `JR-${1040 + i}`, height_m: 7, lamp: 'LED 40W' });
}

// trees (Points)
for (const [i, [x, y, sp]] of [[4, 4, 'Tilia cordata'], [4, 34, 'Acer platanoides'], [33, 34, 'Betula pendula'], [55, 32, 'Tilia cordata'], [44, 30, 'Prunus avium']].entries()) {
    add(`tree-${i}`, 'tree', { type: 'Point', coordinates: at(x, y, 0.05) }, { species: sp, crown_m: 6 });
}

// survey control (Points) and stake-out (MultiPoint)
add('cp-101', 'survey', { type: 'Point', coordinates: at(-2, 2, 0.1) }, { point_id: '101', type: 'traverse', sigma_mm: 4 });
add('cp-102', 'survey', { type: 'Point', coordinates: at(62, 42, 0.1) }, { point_id: '102', type: 'traverse', sigma_mm: 4 });
add('stakeout', 'stake', {
    type: 'MultiPoint', coordinates: [at(8, 14, 0.05), at(30, 14, 0.05), at(30, 26, 0.05), at(8, 26, 0.05)],
}, { job: 'S-20417 corners', staked: '2026-11-03' });

// GNSS rover, updated every frame
const rover = { type: 'Feature', id: 'rover', properties: { category: 'rover', device: 'Rover R12i', fix: 'RTK fixed', hdop: 0.7 }, geometry: { type: 'Point', coordinates: at(0, 0) } };
features.push(rover);

const geo = new GeoJSONGroup({ type: 'FeatureCollection', features }, {
    style: (f) => CATEGORIES[f.properties?.category] ?? {},
    highlightStyle: { fillColor: '#93c5fd', lineColor: '#2563c9', strokeColor: '#2563c9', pointColor: '#2563c9', fillOpacity: 1 },
});

// legend
document.getElementById('legend').innerHTML = Object.values(CATEGORIES).map((s) => {
    const sw = s.fillColor ? `<i style="background:${s.fillColor};border-color:${s.strokeColor}"></i>`
        : s.pointTexture ? `<i style="border:0;width:16px;height:16px;background:url(${s.pointTexture.image.toDataURL()}) center/contain no-repeat"></i>`
        : s.pointColor && !s.lineColor ? `<i class="dot" style="background:${s.pointColor}"></i>`
        : `<i class="line" style="background:${s.lineColor === '#ffffff' ? '#9aa1a9' : s.lineColor}"></i>`;
    return `${sw}<span>${s.label}</span>`;
}).join('');

const stage = createStage({ background: '#eef0f3' });
stage.scene.add(geo);
stage.fit(geo.getBoundingBox(), new stage.THREE.Vector3(-0.3, -0.75, 1), 0.95);
stage.controls.target.x -= 14; // shift the site right, clear of the side panel
stage.camera.position.x -= 14;

const tip = tooltip();
const readout = coordReadout();
const selection = document.getElementById('selection');
let selected = null;
stage.pick(geo, {
    highlight: false,
    onHover(res, hit, e) {
        readout(hit?.point);
        res ? tip.show(`${CATEGORIES[res.feature.properties.category]?.label} · ${res.feature.geometry.type}`, e) : tip.hide();
    },
    onClick(res) {
        if (selected != null) geo.setHighlighted(selected, false);
        selected = res?.key ?? null;
        if (selected == null) { selection.innerHTML = '<p>Nothing selected.</p>'; return; }
        geo.setHighlighted(selected, true);
        selection.innerHTML = `<p><code>${selected}</code> · ${res.feature.geometry.type}</p>` + kv(res.feature.properties);
    },
});

// rover drives along the road axis
stage.onTick((t) => {
    const x = -15 + ((t * 4) % 90);
    rover.geometry.coordinates = at(x, -6 + 0.4 * Math.sin(t * 1.7), 0.1);
    geo.updateFeature('rover', rover);
});
