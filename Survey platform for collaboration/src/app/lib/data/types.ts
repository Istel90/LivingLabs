export type CollectionName = 'projects' | 'risks' | 'responses' | 'departments' | 'assignments';

export type DataBackendKind = 'local' | 'supabase' | 'java';

export type PlatformDataset = Record<CollectionName, any[]>;

export interface DataProvider {
  getProjects(): Promise<any[]>;
  getProject(id: string): Promise<any | null>;
  createProject(project: any): Promise<any>;

  getRisks(projectId?: string): Promise<any[]>;
  getRisk(id: string): Promise<any | null>;
  createRisk(risk: any): Promise<any>;
  updateRisk(id: string, risk: any): Promise<any>;
  deleteRisk(id: string, projectId?: string): Promise<{ success: boolean }>;

  getResponses(riskId?: string): Promise<any[]>;
  createResponse(response: any): Promise<any>;

  getDepartments(): Promise<any[]>;
  createDepartment(department: any): Promise<any>;

  getAssignments(riskId?: string): Promise<any[]>;
  createAssignment(assignment: any): Promise<any>;

  exportDataset?(): Promise<PlatformDataset>;
  importDataset?(dataset: Partial<PlatformDataset>, options?: { replace?: boolean }): Promise<PlatformDataset>;
  clearDataset?(): Promise<void>;
}

export const emptyDataset = (): PlatformDataset => ({
  projects: [],
  risks: [],
  responses: [],
  departments: [],
  assignments: [],
});
