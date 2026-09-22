export interface PriorityAreaDraftRow {
  id: string;
  region_code: string;
  set_name: string;
  hazard_type: string;
  analysis_version: string | null;
  analysis_conditions: Record<string, unknown>;
  created_by_user: string | null;
  created_at: string;
  updated_at: string | null;
  status: string;
  lineage_id: string;
  parent_id: string | null;
  deleted_at: string | null;
  management_version: number;
}

export function listPriorityAreaDrafts(options: {
  regionCode?: string;
  hazardType: string;
  limit?: number;
  offset?: number;
  draftId?: string;
  deleted?: boolean;
}): Promise<PriorityAreaDraftRow[]>;

export function listRegionalPriorityAreaDrafts(hazardType: string, regionCode?: string, deleted?: boolean): Promise<PriorityAreaDraftRow[]>;

export function savePriorityAreaDraft(options: {
  regionCode: string;
  regionName: string;
  hazardType: string;
  projectName?: string;
  actorUser?: string;
  draftPayload: Record<string, unknown>;
  parentId?: string | null;
  requestId?: string;
}): Promise<PriorityAreaDraftRow | null>;

export function draftPayloadFromRow(row: PriorityAreaDraftRow): Record<string, unknown> | null;
export function managePriorityAreaDraft(row: PriorityAreaDraftRow, action: 'rename' | 'delete' | 'restore', name?: string): Promise<PriorityAreaDraftRow>;
export function clearPriorityAreaDrafts(): Promise<boolean>;
