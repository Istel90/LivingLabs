import { emptyDataset, type CollectionName, type DataProvider, type PlatformDataset } from './types';

const STORAGE_PREFIX = 'living-lab-survey';
const collections: CollectionName[] = ['projects', 'risks', 'responses', 'departments', 'assignments'];

function storageKey(collection: CollectionName) {
  return `${STORAGE_PREFIX}:${collection}`;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readCollection(collection: CollectionName): any[] {
  try {
    const value = localStorage.getItem(storageKey(collection));
    return value ? JSON.parse(value) : [];
  } catch (error) {
    console.error(`Failed to read ${collection} from local storage:`, error);
    return [];
  }
}

function writeCollection(collection: CollectionName, items: any[]) {
  localStorage.setItem(storageKey(collection), JSON.stringify(items));
}

function upsert(collection: CollectionName, item: any, matcher: (value: any) => boolean) {
  const items = readCollection(collection);
  const index = items.findIndex(matcher);

  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }

  writeCollection(collection, items);
  return item;
}

function mergeCollection(collection: CollectionName, incoming: any[]) {
  const merged = readCollection(collection);

  incoming.forEach((item) => {
    const id = item.id || createId();
    const next = { ...item, id };
    const index = merged.findIndex((value) => value.id === id);

    if (index >= 0) {
      merged[index] = { ...merged[index], ...next };
    } else {
      merged.push(next);
    }
  });

  writeCollection(collection, merged);
  return merged;
}

export const localDataProvider: DataProvider = {
  async getProjects() {
    return readCollection('projects');
  },

  async getProject(id: string) {
    return readCollection('projects').find((project) => project.id === id) || null;
  },

  async createProject(project: any) {
    const item = {
      ...project,
      id: project.id || createId(),
      createdAt: project.createdAt || new Date().toISOString(),
    };
    return upsert('projects', item, (value) => value.id === item.id);
  },

  async getRisks(projectId?: string) {
    const risks = readCollection('risks');
    return projectId ? risks.filter((risk) => risk.projectId === projectId) : risks;
  },

  async getRisk(id: string) {
    return readCollection('risks').find((risk) => risk.id === id) || null;
  },

  async createRisk(risk: any) {
    const item = {
      ...risk,
      id: risk.id || createId(),
      projectId: risk.projectId || 'default',
      createdAt: risk.createdAt || new Date().toISOString(),
    };
    return upsert('risks', item, (value) => value.id === item.id);
  },

  async updateRisk(id: string, risk: any) {
    const item = {
      ...risk,
      id,
      projectId: risk.projectId || 'default',
      updatedAt: new Date().toISOString(),
    };
    return upsert('risks', item, (value) => value.id === id);
  },

  async deleteRisk(id: string) {
    writeCollection(
      'risks',
      readCollection('risks').filter((risk) => risk.id !== id),
    );
    return { success: true };
  },

  async getResponses(riskId?: string) {
    const responses = readCollection('responses');
    return riskId ? responses.filter((response) => response.riskId === riskId) : responses;
  },

  async createResponse(response: any) {
    const item = {
      ...response,
      id: response.id || createId(),
      userId: response.userId || 'anonymous',
      departmentId: response.departmentId || response.department || 'unknown-department',
      submittedAt: response.submittedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: response.isDraft ? 'draft' : response.status || 'submitted',
    };
    return upsert(
      'responses',
      item,
      (value) =>
        value.riskId === item.riskId &&
        (value.departmentId || value.department) === item.departmentId,
    );
  },

  async getDepartments() {
    return readCollection('departments');
  },

  async createDepartment(department: any) {
    const item = { ...department, id: department.id || createId() };
    return upsert('departments', item, (value) => value.id === item.id);
  },

  async getAssignments(riskId?: string) {
    const assignments = readCollection('assignments');
    return riskId ? assignments.filter((assignment) => assignment.riskId === riskId) : assignments;
  },

  async createAssignment(assignment: any) {
    const item = {
      ...assignment,
      id: assignment.id || `${assignment.riskId || 'risk'}:${assignment.departmentId || 'department'}`,
      createdAt: assignment.createdAt || new Date().toISOString(),
    };
    return upsert(
      'assignments',
      item,
      (value) =>
        value.riskId === item.riskId && value.departmentId === item.departmentId,
    );
  },

  async exportDataset() {
    return collections.reduce((dataset, collection) => {
      dataset[collection] = readCollection(collection);
      return dataset;
    }, emptyDataset());
  },

  async importDataset(dataset: Partial<PlatformDataset>, options = {}) {
    if (options.replace) {
      collections.forEach((collection) => writeCollection(collection, dataset[collection] || []));
    } else {
      collections.forEach((collection) => mergeCollection(collection, dataset[collection] || []));
    }
    return this.exportDataset?.() || emptyDataset();
  },

  async clearDataset() {
    collections.forEach((collection) => localStorage.removeItem(storageKey(collection)));
  },
};
