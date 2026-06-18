import { javaDataProvider } from './javaProvider';
import { localDataProvider } from './localProvider';
import { supabaseDataProvider } from './supabaseProvider';
import type { DataBackendKind, DataProvider } from './types';

const providers: Record<DataBackendKind, DataProvider> = {
  local: localDataProvider,
  supabase: supabaseDataProvider,
  java: javaDataProvider,
};

export function getDataBackendKind(): DataBackendKind {
  const configured = String(import.meta.env.VITE_DATA_BACKEND || 'local').toLowerCase();
  if (configured === 'supabase' || configured === 'java') return configured;
  return 'local';
}

export function getDataProvider(): DataProvider {
  return providers[getDataBackendKind()];
}
