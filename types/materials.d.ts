/**
 * Key of the style settings that a point batch's material depends on. Points with equal keys
 * (and in the same grid cell) are drawn in one batch. Fill colour is per vertex, so it is not part of the key.
 * @param {Required<Style>} style
 * @returns {string}
 */
export function pointMaterialKey(style: Required<Style>): string;
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
export function createPointMaterial(style: Required<Style>): ShaderMaterial;
/**
 * `onBeforeRender` hook for `Points` that use {@link createPointMaterial}. It copies the renderer's
 * pixel ratio and viewport height into the material's uniforms.
 *
 * @this {import('three').Points}
 * @param {import('three').WebGLRenderer} renderer
 */
export function syncPointUniforms(this: import("three").Points<import("three").BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>, import("three").Material<import("three").MaterialEventMap> | import("three").Material<import("three").MaterialEventMap>[], import("three").Object3DEventMap>, renderer: import("three").WebGLRenderer): void;
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
 * @property {number} [extrude=0]  Extrusion height in CRS units along +z. Polygons become solids (caps and side
 *   walls) and lines become vertical walls. Both use `fillColor` and are shaded without needing scene lights.
 *   Use a style function to drive it from a property, for example `(f) => ({ extrude: f.properties.height })`.
 * @property {boolean} [depthTest=true]  Depth-test against the rest of the scene.
 */
/**
 * Default style. Every feature style is merged over this.
 * @type {Readonly<Required<Style>>}
 */
export const DEFAULT_STYLE: Readonly<Required<Style>>;
/**
 * Default highlight style, merged over a feature's style while it is highlighted.
 * @type {Readonly<Style>}
 */
export const DEFAULT_HIGHLIGHT_STYLE: Readonly<Style>;
/**
 * Caches materials by their effective style, so thousands of features share a handful of
 * materials (one draw state each). Calling `dispose()` frees all of them.
 */
export class MaterialCache {
    /**
     * Material for LineString parts.
     * @param {Required<Style>} style
     * @returns {LineMaterial}
     */
    line(style: Required<Style>): LineMaterial;
    /**
     * Material for polygon outlines.
     * @param {Required<Style>} style
     * @returns {LineMaterial}
     */
    stroke(style: Required<Style>): LineMaterial;
    /**
     * Material for polygon fills, extruded solids and walls.
     * @param {Required<Style>} style
     * @param {boolean} [shaded=false]  Use baked per-vertex shading (extruded geometry).
     * @returns {MeshBasicMaterial}
     */
    fill(style: Required<Style>, shaded?: boolean): MeshBasicMaterial;
    /**
     * Material for point batches.
     * @param {Required<Style>} style
     * @returns {ShaderMaterial}
     */
    points(style: Required<Style>): ShaderMaterial;
    /** Dispose every cached material. */
    dispose(): void;
    #private;
}
/**
 * Visual style of a feature. Every key is optional when you pass a style to
 * {@link GeoJSONGroup}; missing keys fall back to {@link DEFAULT_STYLE}.
 */
export type Style = {
    /**
     * Fill colour of points.
     */
    pointColor?: import("three").ColorRepresentation;
    /**
     * Point diameter. Pixels when `pointSizeUnits` is `'pixels'`, CRS units
     * (for example metres) when it is `'world'`.
     */
    pointSize?: number;
    /**
     * `'pixels'` keeps a constant on-screen size.
     * `'world'` gives points a real-world diameter, so they grow and shrink with camera zoom.
     */
    pointSizeUnits?: "pixels" | "world";
    /**
     * Lower clamp in pixels for `'world'` sized points.
     */
    pointMinSize?: number;
    /**
     * Upper clamp in pixels for `'world'` sized points.
     */
    pointMaxSize?: number;
    /**
     * Outline colour.
     * Use `null` for plain discs. Points that share size settings, outline and texture share one draw batch,
     * whatever their fill colour.
     */
    pointOutlineColor?: import("three").ColorRepresentation | null;
    /**
     * Outline width in pixels.
     */
    pointOutlineWidth?: number;
    /**
     * Image drawn for each point instead of a disc
     * (for example an icon from `TextureLoader`, or a canvas). The image is multiplied by `pointColor`, so use
     * white for an untinted image. Transparent pixels are discarded.
     */
    pointTexture?: import("three").Texture | null;
    /**
     * Colour of LineString parts.
     */
    lineColor?: import("three").ColorRepresentation;
    /**
     * Line width in pixels, or CRS units when `worldUnits` is true.
     */
    lineWidth?: number;
    /**
     * Line opacity, 0–1.
     */
    lineOpacity?: number;
    /**
     * Draw lines dashed.
     */
    dashed?: boolean;
    /**
     * Dash length in CRS units.
     */
    dashSize?: number;
    /**
     * Gap length in CRS units.
     */
    gapSize?: number;
    /**
     * Interpret `lineWidth` in CRS units.
     */
    worldUnits?: boolean;
    /**
     * Polygon fill colour.
     */
    fillColor?: import("three").ColorRepresentation;
    /**
     * Polygon fill opacity, 0–1.
     */
    fillOpacity?: number;
    /**
     * Polygon outline colour.
     */
    strokeColor?: import("three").ColorRepresentation;
    /**
     * Polygon outline width in pixels. `0` disables outlines.
     */
    strokeWidth?: number;
    /**
     * Extrusion height in CRS units along +z. Polygons become solids (caps and side
     * walls) and lines become vertical walls. Both use `fillColor` and are shaded without needing scene lights.
     * Use a style function to drive it from a property, for example `(f) => ({ extrude: f.properties.height })`.
     */
    extrude?: number;
    /**
     * Depth-test against the rest of the scene.
     */
    depthTest?: boolean;
};
import { ShaderMaterial } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MeshBasicMaterial } from 'three';
