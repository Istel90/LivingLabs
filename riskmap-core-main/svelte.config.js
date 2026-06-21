import adapter_static from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config_static = {
    kit: {
        adapter: adapter_static({
            // default options are shown. On some platforms
            // these options are set automatically — see below
            pages: 'build',
            assets: 'build',
            fallback: undefined,
            precompress: false,
            strict: true
        }),
        paths: {
            base: process.argv.includes('dev') ? '' : (process.env.PAGES_BASE_PATH || ''),
            relative: false
        }
    }
};

export default config_static;

// import adapter from '@sveltejs/adapter-auto';

// /** @type {import('@sveltejs/kit').Config} */
// const config = {
//     kit: {
//         // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
//         // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
//         // See https://svelte.dev/docs/kit/adapters for more information about adapters.
//         adapter: adapter()
//     }
// };

// export default config;
