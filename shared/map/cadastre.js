// The installed nationwide snapshot; change only when its database is replaced.
export const CADASTRE_DATASET_VERSION = 'vworld-2026-08-08';
export const CADASTRE_BATCH_SIZE = 100;

export function parseParcelIds(value) {
  const ids = String(value || '').split(',').map((id) => id.trim());
  if (!ids.length || ids.length > CADASTRE_BATCH_SIZE || ids.some((id) => !/^\d{19}$/.test(id))) {
    throw new Error(`pnu must contain 1-${CADASTRE_BATCH_SIZE} comma-separated 19-digit identifiers`);
  }
  return [...new Set(ids)];
}
