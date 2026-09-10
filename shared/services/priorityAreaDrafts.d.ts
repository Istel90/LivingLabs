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
}

export function listPriorityAreaDrafts(options: {
  regionCode?: string;
  hazardType: string;
  limit?: number;
  offset?: number;
  draftId?: string;
}): Promise<PriorityAreaDraftRow[]>;

export function listRegionalPriorityAreaDrafts(hazardType: string, regionCode?: string): Promise<PriorityAreaDraftRow[]>;

export function savePriorityAreaDraft(options: {
  regionCode: string;
  regionName: string;
  hazardType: string;
  projectName?: string;
  actorUser?: string;
  draftPayload: Record<string, unknown>;
}): Promise<PriorityAreaDraftRow | null>;

export function draftPayloadFromRow(row: PriorityAreaDraftRow): Record<string, unknown> | null;
export function clearPriorityAreaDrafts(): Promise<boolean>;
