process.env.VITE_VWORLD_PROXY_URL =
  process.env.VITE_PUBLIC_VWORLD_PROXY_URL ||
  'https://ehjygntjhqkddtcnvjdj.supabase.co/functions/v1/vworld-data';

process.env.VITE_ANALYSIS_API_URL =
  process.env.VITE_PUBLIC_ANALYSIS_API_URL ||
  'https://ehjygntjhqkddtcnvjdj.supabase.co/functions/v1/spatial-analysis-data';

await import('./build-unified-platform.mjs');
