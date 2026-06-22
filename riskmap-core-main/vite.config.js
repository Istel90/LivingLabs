import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    assetsInclude: ['**/*.tif'],
    server: {
        host: '127.0.0.1',
        port: 4175,
        strictPort: true,
        proxy: {
            '/priority-handoff': 'http://127.0.0.1:4176',
            '/responsible-handoff': 'http://127.0.0.1:4176',
            '/responsible-review-response': 'http://127.0.0.1:4176',
            '/vworld-data': 'http://127.0.0.1:4176'
        },
        fs: {
            allow: [path.resolve('..')]
        }
    }
});
