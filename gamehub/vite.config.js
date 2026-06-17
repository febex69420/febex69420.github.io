/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Relative base so the build works whether served from the domain root,
// from /gamehub/, or from any other sub-path on GitHub Pages.
export default defineConfig({
    base: './',
    plugins: [react()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    build: {
        target: 'es2020',
        sourcemap: false,
        rollupOptions: {
            output: {
                // Split heavy vendor libs out of the main chunk for faster first load.
                manualChunks: {
                    react: ['react', 'react-dom', 'react-router-dom'],
                    motion: ['framer-motion'],
                    icons: ['lucide-react'],
                },
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        css: true,
    },
});
