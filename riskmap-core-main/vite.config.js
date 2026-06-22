import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    assetsInclude: ['**/*.tif'],
    server: {
        host: '127.0.0.1',
        port: 5175,
        strictPort: true,
        fs: {
            allow: [path.resolve('..')]
        }
    }
});
