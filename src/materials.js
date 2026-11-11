import { Color, DoubleSide, MeshBasicMaterial, ShaderMaterial, Vector4 } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/**
 * Visual style of a feature. Every key is optional when you pass a style to
 * {@link GeoJSONGroup}; missing keys fall back to {@link DEFAULT_STYLE}.
 *
 * @typedef {object} Style
 * @property {import('three').ColorRepresentation} [pointColor='#ff0000']  Fill colour of points.
 * @property {number} [pointSize=10]  Point diameter. Pixels when `pointSizeUnits` is `'pixels'`, CRS units
 *   (for example metres) when it is `'world'`.
 * @property {'pixels'|'world'} [pointSizeUnits='pixels']  `'pixels'` keeps a constant on-screen size.
 *   `'world'` gives points a real-world diameter, so they grow and shrink with camera zoom.
 * @property {number} [pointMinSize=2]  Lower clamp in pixels for `'world'` sized points.
 * @property {number} [pointMaxSize=64]  Upper clamp in pixels for `'world'` sized points.
 * @property {import('three').ColorRepresentation|null} [pointOutlineColor='#1f2933']  Outline colour.
 *   Use `null` for plain discs. Points that share size settings, outline and texture share one draw batch,
 *   whatever their fill colour.
 * @property {number} [pointOutlineWidth=1.5]  Outline width in pixels.
 * @property {import('three').Texture|null} [pointTexture=null]  Image drawn for each point instead of a disc
 *   (for example an icon from `TextureLoader`, or a canvas). The image is multiplied by `pointColor`, so use
 *   white for an untinted image. Transparent pixels are discarded.
 * @property {import('three').ColorRepresentation} [lineColor='#ff0000']  Colour of LineString parts.
 * @property {number} [lineWidth=3]  Line width in pixels, or CRS units when `worldUnits` is true.
 * @property {number} [lineOpacity=1]  Line opacity, 0–1.
 * @property {boolean} [dashed=false]  Draw lines dashed.
 * @property {number} [dashSize=1]  Dash length in CRS units.
 * @property {number} [gapSize=1]  Gap length in CRS units.
 * @property {boolean} [worldUnits=false]  Interpret `lineWidth` in CRS units.
 * @property {import('three').ColorRepresentation} [fillColor='#800080']  Polygon fill colour.
 * @property {number} [fillOpacity=0.5]  Polygon fill opacity, 0–1.
 * @property {import('three').ColorRepresentation} [strokeColor='#000000']  Polygon outline colour.
 * @property {number} [strokeWidth=1]  Polygon outline width in pixels. `0` disables outlines.
 * @property {boolean} [depthTest=true]  Depth-test against the rest of the scene.
 */

/**
 * Default style. Every feature style is merged over this.
 * @type {Readonly<Required<Style>>}
 */
export const DEFAULT_STYLE = Object.freeze({
    pointColor: '#ff0000',
    pointSize: 10,
    pointSizeUnits: 'pixels',
    pointMinSize: 2,
    pointMaxSize: 64,
    pointOutlineColor: '#1f2933',
    pointOutlineWidth: 1.5,
    pointTexture: null,

    lineColor: '#ff0000',
    lineWidth: 3,
    lineOpacity: 1,
    dashed: false,
    dashSize: 1,
    gapSize: 1,
    worldUnits: false,

    fillColor: '#800080',
    fillOpacity: 0.5,
    strokeColor: '#000000',
    strokeWidth: 1,

    depthTest: true,
});

/**
 * Default highlight style, merged over a feature's style while it is highlighted.
 * @type {Readonly<Style>}
 */
export const DEFAULT_HIGHLIGHT_STYLE = Object.freeze({
    pointColor: '#90ee90',
    lineColor: '#90ee90',
    lineWidth: 5,
    fillColor: '#90ee90',
    fillOpacity: 1,
});

/**
 * Caches materials by their effective style, so thousands of features share a handful of
 * materials (one draw state each). Calling `dispose()` frees all of them.
 */
export class MaterialCache {
    /** @type {Map<string, import('three').Material>} */
    #cache = new Map();

    /**
     * Material for LineString parts.
     * @param {Required<Style>} style
     * @returns {LineMaterial}
     */
    line(style) {
        const key = `line|${style.lineColor}|${style.lineWidth}|${style.lineOpacity}|${style.dashed}|${style.dashSize}|${style.gapSize}|${style.worldUnits}|${style.depthTest}`;
        return /** @type {LineMaterial} */ (this.#get(key, () => new LineMaterial({
            color: new Color(style.lineColor).getHex(),
            linewidth: style.lineWidth,
            opacity: style.lineOpacity,
            transparent: style.lineOpacity < 1,
            dashed: style.dashed,
            dashSize: style.dashSize,
            gapSize: style.gapSize,
            worldUnits: style.worldUnits,
            depthTest: style.depthTest,
        })));
    }

    /**
     * Material for polygon outlines.
     * @param {Required<Style>} style
     * @returns {LineMaterial}
     */
    stroke(style) {
        return this.line({ ...style, lineColor: style.strokeColor, lineWidth: style.strokeWidth, lineOpacity: 1, dashed: false });
    }

    /**
     * Material for polygon fills.
     * @param {Required<Style>} style
     * @returns {MeshBasicMaterial}
     */
    fill(style) {
        const key = `fill|${style.fillColor}|${style.fillOpacity}|${style.depthTest}`;
        return /** @type {MeshBasicMaterial} */ (this.#get(key, () => new MeshBasicMaterial({
            color: new Color(style.fillColor),
            transparent: style.fillOpacity < 1,
            opacity: style.fillOpacity,
            side: DoubleSide,
            depthTest: style.depthTest,
            depthWrite: style.fillOpacity >= 1,
            // pull fills slightly back so outlines at the same depth stay visible
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
        })));
    }

    /**
     * Material for point batches.
     * @param {Required<Style>} style
     * @returns {ShaderMaterial}
     */
    points(style) {
        return /** @type {ShaderMaterial} */ (this.#get(pointMaterialKey(style), () => createPointMaterial(style)));
    }

    /** Dispose every cached material. */
    dispose() {
        for (const m of this.#cache.values()) m.dispose();
        this.#cache.clear();
    }

    /**
     * @param {string} key
     * @param {() => import('three').Material} create
     */
    #get(key, create) {
        let m = this.#cache.get(key);
        if (!m) this.#cache.set(key, (m = create()));
        return m;
    }
}

/**
 * Key of the style settings that a point batch's material depends on. Points with equal keys
 * (and in the same grid cell) are drawn in one batch. Fill colour is per vertex, so it is not part of the key.
 * @param {Required<Style>} style
 * @returns {string}
 */
export function pointMaterialKey(style) {
    return `points|${style.pointSize}|${style.pointSizeUnits}|${style.pointMinSize}|${style.pointMaxSize}|${style.pointOutlineColor}|${style.pointOutlineWidth}|${style.pointTexture?.uuid ?? ''}|${style.depthTest}`;
}

/**
 * Create the point material: antialiased screen-space discs with an outline, or an image when
 * `pointTexture` is set. Colour is per vertex, so highlighting a point only rewrites three floats.
 * Supports pixel or world-unit sizing, logarithmic depth and clipping planes.
 *
 * The material needs `pixelRatio` and `viewportHeight` from the renderer. {@link GeoJSONGroup} wires this up
 * with {@link syncPointUniforms}. If you use the material yourself, assign that function as `onBeforeRender`
 * of your `Points` object.
 *
 * @param {Required<Style>} style
 * @returns {ShaderMaterial}
 */
export function createPointMaterial(style) {
    return new ShaderMaterial({
        uniforms: {
            size: { value: style.pointSize },
            worldSize: { value: style.pointSizeUnits === 'world' ? 1 : 0 },
            minSize: { value: style.pointMinSize },
            maxSize: { value: style.pointMaxSize },
            pixelRatio: { value: 1 },
            viewportHeight: { value: 1 },  // CSS pixels
            outlineColor: { value: new Color(style.pointOutlineColor ?? 0x000000) },
            outlineWidth: { value: style.pointOutlineColor == null ? 0 : style.pointOutlineWidth },
            map: { value: style.pointTexture ?? null },
            useMap: { value: style.pointTexture ? 1 : 0 },
        },
        vertexShader: /* glsl */`
            #include <common>
            #include <logdepthbuf_pars_vertex>
            #include <clipping_planes_pars_vertex>
            uniform float size;
            uniform float worldSize;
            uniform float minSize;
            uniform float maxSize;
            uniform float pixelRatio;
            uniform float viewportHeight;
            attribute vec3 color;
            varying vec3 vColor;
            varying float vSize;
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                bool perspective = projectionMatrix[2][3] == -1.0;
                float dist = perspective ? -mvPosition.z : 1.0;
                float pxPerUnit = projectionMatrix[1][1] * 0.5 * viewportHeight / dist;  // CSS px per world unit

                float s = size;
                if (worldSize > 0.5) s = clamp(size * pxPerUnit, minSize, maxSize);
                vSize = s;
                gl_PointSize = s * pixelRatio;

                // A sprite has one depth for all its pixels. Seen at an angle, the half that overlaps the
                // nearer part of the surface it sits on would fail the depth test. Pull it toward the camera
                // by its own on-screen radius, along the view ray so its screen position is unchanged.
                float r = 0.5 * s / pxPerUnit;
                if (perspective) mvPosition.xyz *= max(dist - r, dist * 0.01) / dist;
                else mvPosition.z += r;
                gl_Position = projectionMatrix * mvPosition;

                #include <logdepthbuf_vertex>
                #include <clipping_planes_vertex>
            }
        `,
        fragmentShader: /* glsl */`
            #include <common>
            #include <logdepthbuf_pars_fragment>
            #include <clipping_planes_pars_fragment>
            uniform vec3 outlineColor;
            uniform float outlineWidth;  // CSS px
            uniform sampler2D map;
            uniform float useMap;
            varying vec3 vColor;
            varying float vSize;
            void main() {
                #include <clipping_planes_fragment>
                if (useMap > 0.5) {
                    vec4 texel = texture2D(map, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y));
                    if (texel.a < 0.02) discard;
                    gl_FragColor = vec4(texel.rgb * vColor, texel.a);
                } else {
                    // antialiased disc with an antialiased outline ring
                    vec2 c = gl_PointCoord * 2.0 - 1.0;
                    float r = length(c);
                    float px = 2.0 / max(vSize, 1.0);   // one pixel in units of the radius
                    float alpha = 1.0 - smoothstep(1.0 - px, 1.0, r);
                    if (alpha <= 0.0) discard;
                    float edge = 1.0 - outlineWidth * px;
                    float ring = outlineWidth > 0.0 ? smoothstep(edge - px, edge, r) : 0.0;
                    gl_FragColor = vec4(mix(vColor, outlineColor, ring), alpha);
                }
                #include <logdepthbuf_fragment>
            }
        `,
        depthTest: style.depthTest,
        transparent: true,   // soft edges blend with what is behind
        clipping: true,
    });
}

const _viewport = new Vector4();

/**
 * `onBeforeRender` hook for `Points` that use {@link createPointMaterial}. It copies the renderer's
 * pixel ratio and viewport height into the material's uniforms.
 *
 * @this {import('three').Points}
 * @param {import('three').WebGLRenderer} renderer
 */
export function syncPointUniforms(renderer) {
    const u = /** @type {ShaderMaterial} */ (this.material).uniforms;
    renderer.getCurrentViewport(_viewport);
    const pr = renderer.getPixelRatio();
    u.pixelRatio.value = pr;
    u.viewportHeight.value = _viewport.w / pr;
}
