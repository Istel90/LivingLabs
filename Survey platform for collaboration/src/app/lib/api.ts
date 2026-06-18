import { getDataBackendKind, getDataProvider } from './data/provider';
import type { PlatformDataset } from './data/types';

const provider = () => getDataProvider();

export function getCurrentDataBackend() {
  return getDataBackendKind();
}

// Projects
export async function getProjects() {
  return provider().getProjects();
}

export async function getProject(id: string) {
  return provider().getProject(id);
}

export async function createProject(project: any) {
  return provider().createProject(project);
}

// Risks
export async function getRisks(projectId?: string) {
  return provider().getRisks(projectId);
}

export async function getRisk(id: string) {
  return provider().getRisk(id);
}

export async function createRisk(risk: any) {
  return provider().createRisk(risk);
}

export async function updateRisk(id: string, risk: any) {
  return provider().updateRisk(id, risk);
}

export async function deleteRisk(id: string, projectId?: string) {
  return provider().deleteRisk(id, projectId);
}

// Responses
export async function getResponses(riskId?: string) {
  return provider().getResponses(riskId);
}

export async function createResponse(response: any) {
  return provider().createResponse(response);
}

// Departments
export async function getDepartments() {
  return provider().getDepartments();
}

export async function createDepartment(department: any) {
  return provider().createDepartment(department);
}

// Assignments
export async function getAssignments(riskId?: string) {
  return provider().getAssignments(riskId);
}

export async function createAssignment(assignment: any) {
  return provider().createAssignment(assignment);
}

// Portable dataset helpers for GitHub Pages demos.
export async function exportDataset(): Promise<PlatformDataset> {
  if (!provider().exportDataset) {
    throw new Error('The current data backend does not support dataset export.');
  }
  return provider().exportDataset!();
}

export async function importDataset(dataset: Partial<PlatformDataset>, options?: { replace?: boolean }) {
  if (!provider().importDataset) {
    throw new Error('The current data backend does not support dataset import.');
  }
  return provider().importDataset!(dataset, options);
}

export async function clearDataset() {
  if (!provider().clearDataset) {
    throw new Error('The current data backend does not support dataset clearing.');
  }
  return provider().clearDataset!();
}
