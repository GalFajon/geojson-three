import { GeoJSONGroup } from '../../src/index.js';
import { createStage, rng, kv, fmt, coordReadout } from '../shared/stage.js';

// a 250 × 165 km region in UTM zone 33N
const EXTENT = { minE: 375_000, maxE: 625_000, minN: 4_920_000, maxN: 5_085_000 };

const CLASSES = {
    address: { label: 'Address point', color: '#4b5563', weight: 0.6 },
    manhole: { label: 'Sewer manhole', color: '#9a6b3f', weight: 0.2 },
    hydrant: { label: 'Fire hydrant',  color: '#d94f30', weight: 0.1 },
    pole:    { label: 'Utility pole',  color: '#2563c9', weight: 0.1 },
};
const classOf = (u) => { let acc = 0; for (const [k, c] of Object.entries(CLASSES)) { acc += c.weight; if (u < acc) return k; } return 'address'; };

function generate(count) {
    const rand = rng(1991);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    const towns = Array.from({ length: 60 }, () => ({
        e: EXTENT.minE + rand() * (EXTENT.maxE - EXTENT.minE),
        n: EXTENT.minN + rand() * (EXTENT.maxN - EXTENT.minN),
        sigma: 800 + rand() * 4000,
        h: 200 + rand() * 600,
    }));
    const features = new Array(count);
    for (let i = 0; i < count; i++) {
        const t = towns[Math.floor(rand() ** 1.6 * towns.length)];
        const cls = classOf(rand());
        features[i] = {
            type: 'Feature', id: i,
            properties: { class: cls, ref: `${cls.slice(0, 2).toUpperCase()}-${String(i).padStart(6, '0')}` },
            geometry: { type: 'Point', coordinates: [+(t.e + gauss() * t.sigma).toFixed(3), +(t.n + gauss() * t.sigma).toFixed(3), +(t.h + gauss() * 15).toFixed(3)] },
        };
    }
    return { type: 'FeatureCollection', features };
}

const stage = createStage({ background: '#eef0f3', far: 1e7 });
const readout = coordReadout();
const statsEl = document.getElementById('stats');
const selection = document.getElementById('selection');
document.getElementById('legend').innerHTML = Object.values(CLASSES).map((c) => `<i class="dot" style="background:${c.color}"></i><span>${c.label}</span>`).join('');

let count = 50_000, cell = 10_000, data = null, geo = null, grid = null, selected = null;
const SIZES = { pixels: { pointSizeUnits: 'pixels', pointSize: 7 }, world: { pointSizeUnits: 'world', pointSize: 150, pointMinSize: 1.5, pointMaxSize: 24 } };
let size = 'pixels';

function build({ refit = false } = {}) {
    if (geo) { stage.scene.remove(geo, grid); geo.dispose(); grid.dispose(); }
    selected = null;
    selection.innerHTML = '<p>Click a point.</p>';

    const t0 = performance.now();
    geo = new GeoJSONGroup(data, {
        pointCellSize: cell,
        style: (f) => ({ pointColor: CLASSES[f.properties.class].color, pointOutlineColor: '#ffffff', pointOutlineWidth: 1, ...SIZES[size] }),
        highlightStyle: { pointColor: '#facc15' },
    });
    const ms = performance.now() - t0;
    stage.scene.add(geo);

    // batch grid overlay (cells that actually hold points)
    const used = new Set(data.features.map((f) => `${Math.floor(f.geometry.coordinates[0] / cell)},${Math.floor(f.geometry.coordinates[1] / cell)}`));
    const lines = [];
    if (cell < 1e8) for (const k of used) {
        const [i, j] = k.split(',').map(Number);
        const [e0, n0, e1, n1] = [i * cell, j * cell, (i + 1) * cell, (j + 1) * cell];
        lines.push([[e0, n0, 150], [e1, n0, 150], [e1, n1, 150], [e0, n1, 150], [e0, n0, 150]]);
    }
    grid = new GeoJSONGroup({ type: 'MultiLineString', coordinates: lines }, { style: { lineColor: '#9ca3af', lineWidth: 1, lineOpacity: 0.7 } });
    stage.scene.add(grid);

    // worst-case float32 error inside the batches: half the float32 spacing of the largest local offset
    let maxLocal = 0;
    for (const b of geo.pointBatches) {
        b.geometry.computeBoundingSphere();
        maxLocal = Math.max(maxLocal, b.geometry.boundingSphere.radius);
    }
    const halfUlp = maxLocal > 0 ? 2 ** (Math.floor(Math.log2(maxLocal)) - 24) : 0;

    statsEl.innerHTML = kv({
        features: count.toLocaleString('en'),
        'point batches': geo.pointBatches.length,
        'build time': `${ms.toFixed(0)} ms`,
        'largest local offset': `${fmt(maxLocal / 1000, 1)} km`,
        'float32 error bound': halfUlp < 1e-3 ? `${(halfUlp * 1e6).toFixed(0)} µm` : `${(halfUlp * 1e3).toFixed(1)} mm`,
        'absolute f32 at E 600 km': `${(2 ** (Math.floor(Math.log2(600_000)) - 24) * 1e3).toFixed(1)} mm`,
    });

    if (refit) stage.fit(geo.getBoundingBox(), new stage.THREE.Vector3(0, -0.5, 1), 0.72);
}

function buttons(el, options, current, onPick) {
    el.innerHTML = '';
    for (const [label, value] of options) {
        const b = document.createElement('button');
        b.textContent = label;
        b.classList.toggle('active', value === current);
        b.onclick = () => { [...el.children].forEach((c) => c.classList.remove('active')); b.classList.add('active'); onPick(value); };
        el.append(b);
    }
}

buttons(document.getElementById('counts'), [['10k', 10_000], ['50k', 50_000], ['100k', 100_000]], count, (v) => { count = v; data = generate(count); build(); });
buttons(document.getElementById('sizes'), [['7 px', 'pixels'], ['150 m (world)', 'world']], size, (v) => { size = v; build(); });
buttons(document.getElementById('cells'), [['2 km', 2_000], ['10 km', 10_000], ['50 km', 50_000], ['one batch', 1e9]], cell, (v) => { cell = v; build(); });

stage.renderer.domElement.addEventListener('pointermove', (e) => readout(hitAt(e)?.point));
stage.renderer.domElement.addEventListener('click', (e) => {
    const hit = hitAt(e);
    const res = geo.featureFromIntersection(hit);
    if (selected != null) geo.setHighlighted(selected, false);
    selected = res?.key ?? null;
    if (selected == null) { selection.innerHTML = '<p>Click a point.</p>'; return; }
    geo.setHighlighted(selected, true);
    const [e0, n0, h0] = res.feature.geometry.coordinates;
    selection.innerHTML = kv({ ...res.feature.properties, class: CLASSES[res.feature.properties.class].label, E: fmt(e0), N: fmt(n0), H: fmt(h0) });
});

const raycaster = new stage.THREE.Raycaster();
function hitAt(e) {
    if (!geo) return null;
    raycaster.setFromCamera(new stage.THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), stage.camera);
    // ~4 px pick radius in world units at the target distance
    raycaster.params.Points.threshold = stage.camera.position.distanceTo(stage.controls.target) * Math.tan(stage.camera.fov * Math.PI / 360) * 8 / innerHeight;
    return raycaster.intersectObjects(geo.pointBatches, false)[0] ?? null;
}

data = generate(count);
build({ refit: true });
