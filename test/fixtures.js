// projected coordinates (national-grid-sized eastings), heights in metres
export const E0 = 461234.567;
export const N0 = 101234.891;
export const H0 = 295.123;

// UTM northing / ECEF-sized numbers, where float32 spacing is 0.5 m
export const BIG = 5_123_456.789;

export const mixedCollection = {
    type: 'FeatureCollection',
    name: 'test',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32633' } },
    features: [
        { type: 'Feature', id: 'p1', properties: { kind: 'point' }, geometry: { type: 'Point', coordinates: [E0, N0, H0] } },
        { type: 'Feature', id: 'mp', properties: {}, geometry: { type: 'MultiPoint', coordinates: [[E0 + 1, N0, H0], [E0 + 2, N0, H0]] } },
        { type: 'Feature', id: 'l1', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: [[E0, N0, H0], [E0 + 10, N0, H0], [E0 + 10, N0 + 10, H0 + 1]] } },
        { type: 'Feature', id: 'ml', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[E0, N0], [E0 + 1, N0]], [[E0, N0 + 5], [E0 + 1, N0 + 5]]] } },
        {
            type: 'Feature', id: 'poly', properties: {}, geometry: {
                type: 'Polygon', coordinates: [
                    [[E0, N0, H0], [E0 + 20, N0, H0], [E0 + 20, N0 + 20, H0], [E0, N0 + 20, H0], [E0, N0, H0]],
                    [[E0 + 5, N0 + 5, H0], [E0 + 5, N0 + 15, H0], [E0 + 15, N0 + 15, H0], [E0 + 15, N0 + 5, H0], [E0 + 5, N0 + 5, H0]],
                ]
            }
        },
        {
            type: 'Feature', id: 'mpoly', properties: {}, geometry: {
                type: 'MultiPolygon', coordinates: [
                    [[[E0, N0, H0], [E0 + 1, N0, H0], [E0 + 1, N0 + 1, H0], [E0, N0, H0]]],
                    [[[E0 + 5, N0, H0], [E0 + 6, N0, H0], [E0 + 6, N0 + 1, H0], [E0 + 5, N0, H0]]],
                ]
            }
        },
        {
            type: 'Feature', id: 'gc', properties: {}, geometry: {
                type: 'GeometryCollection', geometries: [
                    { type: 'Point', coordinates: [E0 + 3, N0 + 3, H0] },
                    { type: 'LineString', coordinates: [[E0 + 3, N0 + 3, H0], [E0 + 4, N0 + 4, H0]] },
                ]
            }
        },
        { type: 'Feature', id: 'nogeom', properties: { note: 'unlocated' }, geometry: null },
    ],
};

/** A vertical wall (constant northing) – the original renderer could not triangulate this. */
export const verticalWall = {
    type: 'Feature', id: 'wall', properties: {}, geometry: {
        type: 'Polygon', coordinates: [[
            [E0, N0, H0], [E0 + 10, N0, H0], [E0 + 10, N0, H0 + 5], [E0, N0, H0 + 5], [E0, N0, H0],
        ]]
    }
};
