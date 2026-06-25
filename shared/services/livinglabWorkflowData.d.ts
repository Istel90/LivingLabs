export const LIVINGLAB_TABLES: Record<string, string>;

export function selectRows(table: string, options?: {
  select?: string;
  filters?: Record<string, any>;
  order?: string;
  limit?: number;
}): Promise<Array<Record<string, any>>>;

export function insertRows(table: string, rows: Record<string, any> | Array<Record<string, any>>, options?: {
  returning?: 'minimal' | 'representation';
}): Promise<Array<Record<string, any>>>;

export function insertRow(table: string, row: Record<string, any>, options?: {
  returning?: 'minimal' | 'representation';
}): Promise<Record<string, any> | null>;

export function updateRows(table: string, filters: Record<string, any>, patch: Record<string, any>, options?: {
  returning?: 'minimal' | 'representation';
}): Promise<Array<Record<string, any>>>;

export function deleteRows(table: string, filters: Record<string, any>): Promise<boolean>;
export function ensureRegion(region: Record<string, any>): Promise<Record<string, any> | null>;
export function createPriorityAreaSet(areaSet: Record<string, any>): Promise<Record<string, any> | null>;
export function createPriorityAreaOption(option: Record<string, any>): Promise<Record<string, any> | null>;
export function createParcelCandidate(candidate: Record<string, any>): Promise<Record<string, any> | null>;
export function createCandidateParcels(parcels: Array<Record<string, any>>): Promise<Array<Record<string, any>>>;
export function createPriorityAreaReviewRequest(options: Record<string, any>): Promise<Record<string, any> | null>;
export function listHandoffRequests(options?: Record<string, any>): Promise<Array<Record<string, any>>>;
export function openHandoffRequest(handoffId: string, actorTool: string): Promise<Record<string, any> | null>;
export function getPriorityAreaSetGraph(areaSetId: string): Promise<{
  areaSet: Record<string, any> | null;
  options: Array<Record<string, any>>;
  parcelCandidates: Array<Record<string, any>>;
  candidateParcels: Array<Record<string, any>>;
}>;
export function selectPriorityArea(options: Record<string, any>): Promise<Record<string, any> | null>;
export function createAdaptationProject(project: Record<string, any>): Promise<Record<string, any> | null>;
export function createAdaptationPlacement(placement: Record<string, any>): Promise<Record<string, any> | null>;
export function createProjectReviewPackage(options: Record<string, any>): Promise<Record<string, any>>;
export function createResponsibleRevisionReply(options: Record<string, any>): Promise<Record<string, any> | null>;
export function addReviewEvent(event: Record<string, any>): Promise<Record<string, any> | null>;
export function savePriorityAreaHandoffPayload(payload: Record<string, any>): Promise<{
  areaSet: Record<string, any>;
  options: Array<Record<string, any>>;
  parcelCandidates: Array<Record<string, any>>;
  candidateParcels: Array<Record<string, any>>;
  request: Record<string, any> | null;
} | null>;
export function getLatestPriorityAreaHandoffPayload(regionCode: string): Promise<Record<string, any> | null>;
export function recallPriorityAreaReviewRequests(options?: { regionCode?: string; packageId?: string }): Promise<number>;
export function clearDemoWorkflowData(options?: { regionCode?: string }): Promise<boolean>;
