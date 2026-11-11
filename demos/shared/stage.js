import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Tiny scene boilerplate shared by the demos: renderer, z-up camera, orbit controls,
 * resize handling, fit-to-box and hover/click picking for a GeoJSONGroup.
 */
export function createStage({ background = '#eef0f3', near = 0.01, far = 1e5 } = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    document.body.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);

    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, near, far);
    camera.up.set(0, 0, 1); // projected CRSs are z-up

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    addEventListener('resize', () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    });

    const tickers = [];
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
        const dt = clock.getDelta(), t = clock.elapsedTime;
        for (const fn of tickers) fn(t, dt);
        controls.update();
        renderer.render(scene, camera);
    });

    const stage = {
        THREE, renderer, scene, camera, controls,
        onTick: (fn) => tickers.push(fn),

        /** Point the camera at a (float64) Box3 from a given direction. */
        fit(box, direction = new THREE.Vector3(-0.4, -1, 0.8), padding = 1.3) {
            const center = box.getCenter(new THREE.Vector3());
            const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-4);
            const dist = (radius * padding) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
            controls.target.copy(center);
            camera.position.copy(center).addScaledVector(direction.clone().normalize(), dist);
            camera.near = dist / 1000;
            camera.far = dist * 100;
            camera.updateProjectionMatrix();
            controls.update();
        },

        /** Hover + click picking. Callbacks receive ({ key, feature } | null, intersection). */
        pick(geo, { onHover, onClick, highlight = true } = {}) {
            const raycaster = new THREE.Raycaster();
            raycaster.params.Line2 = { threshold: 6 };
            const ndc = new THREE.Vector2();
            let hovered = null;

            const cast = (e) => {
                ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
                raycaster.setFromCamera(ndc, camera);
                // pixel-ish threshold for points, scaled with distance to target
                raycaster.params.Points.threshold = camera.position.distanceTo(controls.target) * 0.01;
                const hit = raycaster.intersectObject(geo, true)[0];
                return [geo.featureFromIntersection(hit), hit];
            };

            renderer.domElement.addEventListener('pointermove', (e) => {
                const [res, hit] = cast(e);
                const key = res?.key ?? null;
                if (key !== hovered) {
                    if (highlight && hovered != null) geo.setHighlighted(hovered, false);
                    hovered = key;
                    if (highlight && key != null) geo.setHighlighted(key, true);
                    renderer.domElement.style.cursor = key != null ? 'pointer' : '';
                }
                onHover?.(res, hit, e);
            });
            renderer.domElement.addEventListener('click', (e) => onClick?.(...cast(e), e));
        },
    };

    window.__stage = stage; // handy for poking around in devtools
    return stage;
}

/** A little floating tooltip that follows the mouse. */
export function tooltip() {
    const el = document.createElement('div');
    el.className = 'tooltip';
    document.body.append(el);
    return {
        show(html, e) {
            el.innerHTML = html;
            el.style.opacity = 1;
            el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
        },
        hide() { el.style.opacity = 0; },
    };
}

/** Deterministic random numbers so demos look the same every load. */
export function rng(seed = 42) {
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** Circle-ish ring around (cx, cy) at height z, for quick cute shapes. */
export function circle(cx, cy, z, r, n = 24, squash = 1) {
    const ring = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash, z]);
    }
    ring.push(ring[0]);
    return ring;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** Attribute table HTML for a properties object. */
export function kv(obj) {
    const rows = Object.entries(obj ?? {}).map(([k, v]) =>
        `<tr><td>${esc(k)}</td><td>${esc(v !== null && typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`);
    return `<table class="kv">${rows.join('') || '<tr><td>(no attributes)</td><td></td></tr>'}</table>`;
}

/** Thousands-separated fixed-point number, surveyor style: 461 234.567 */
export function fmt(n, digits = 3) {
    const [i, f] = Math.abs(n).toFixed(digits).split('.');
    return (n < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? `.${f}` : '');
}

/** Bottom-right readout of the coordinate under the cursor. */
export function coordReadout(labels = ['E', 'N', 'H'], digits = 3) {
    const el = document.createElement('div');
    el.className = 'scalebar';
    el.textContent = '—';
    document.body.append(el);
    return (p) => {
        el.textContent = p ? labels.map((l, i) => `${l} ${fmt([p.x, p.y, p.z][i], digits)}`).join('   ') : '—';
    };
}
