import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const page = (p) => resolve(import.meta.dirname, 'demos', p);

export default defineConfig({
    root: resolve(import.meta.dirname, 'demos'),
    base: './',
    server: { port: 5199, strictPort: true },
    test: { dir: resolve(import.meta.dirname, 'test') },
    build: {
        outDir: '../dist-demos',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: page('index.html'),
                site: page('site/index.html'),
                precision: page('precision/index.html'),
                points: page('points/index.html'),
                viewer: page('viewer/index.html'),
                docs: page('docs/index.html'),
                editor: page('editor/index.html'),
            },
        },
    },
});
