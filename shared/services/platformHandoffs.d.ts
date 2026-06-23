export function getPlatformHandoffConfig(): { url: string; key: string; enabled: boolean };
export function platformHandoffRow(kind: string, payload?: Record<string, any>, status?: string): Record<string, any>;
export function savePlatformHandoff(kind: string, payload: Record<string, any>, status?: string): Promise<boolean>;
export function listPlatformHandoffs(options?: {
  kind?: string;
  regionCode?: string;
  statuses?: string[];
  limit?: number;
}): Promise<Array<Record<string, any>>>;
export function getLatestPlatformHandoff(kind: string, regionCode?: string, statuses?: string[]): Promise<Record<string, any> | null>;
export function markPlatformHandoffStatus(kind: string, options?: {
  regionCode?: string;
  packageId?: string;
  status?: string;
}): Promise<boolean>;
export function clearPlatformHandoffs(): Promise<boolean>;
