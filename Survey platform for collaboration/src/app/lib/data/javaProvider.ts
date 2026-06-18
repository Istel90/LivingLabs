import { emptyDataset, type CollectionName, type DataProvider, type PlatformDataset } from './types';

const collections: CollectionName[] = ['projects', 'risks', 'responses', 'departments', 'assignments'];

function baseUrl() {
  const value = import.meta.env.VITE_JAVA_API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
  if (!value) {
    throw new Error('Java backend requires VITE_JAVA_API_BASE_URL or VITE_API_BASE_URL.');
  }
  return String(value).replace(/\/$/, '');
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Java API request failed: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function readCollection(collection: CollectionName): Promise<any[]> {
  const result = await request(`/platform-records/${collection}`);
  return Array.isArray(result) ? result : result.items || [];
}

async function writeItem(collection: CollectionName, item: any) {
  const id = item.id || createId();
  return request(`/platform-records/${collection}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...item, id }),
  });
}

function filterBy(collection: any[], key: string, value?: string) {
  return value ? collection.filter((item) => item[key] === value) : collection;
}

async function exportDataset(): Promise<PlatformDataset> {
  const dataset = emptyDataset();
  for (const collection of collections) {
    dataset[collection] = await readCollection(collection);
  }
  return dataset;
}

async function importDataset(dataset: Partial<PlatformDataset>, options = { replace: false }) {
  if (options.replace) {
    await clearDataset();
  }

  for (const collection of collections) {
    const items = dataset[collection] || [];
    for (const item of items) {
      await writeItem(collection, item);
    }
  }

  return exportDataset();
}

async function clearDataset() {
  await request('/platform-records', { method: 'DELETE' });
}

export const javaDataProvider: DataProvider = {
  async getProjects() {
    return readCollection('projects');
  },
  async getProject(id: string) {
    return request(`/platform-records/projects/${encodeURIComponent(id)}`);
  },
  async createProject(project: any) {
    return writeItem('projects', {
      ...project,
      id: project.id || createId(),
      createdAt: project.createdAt || new Date().toISOString(),
    });
  },
  async getRisks(projectId?: string) {
    return filterBy(await readCollection('risks'), 'projectId', projectId);
  },
  async getRisk(id: string) {
    return request(`/platform-records/risks/${encodeURIComponent(id)}`);
  },
  async createRisk(risk: any) {
    return writeItem('risks', {
      ...risk,
      id: risk.id || createId(),
      projectId: risk.projectId || 'default',
      createdAt: risk.createdAt || new Date().toISOString(),
    });
  },
  async updateRisk(id: string, risk: any) {
    return writeItem('risks', { ...risk, id, updatedAt: new Date().toISOString() });
  },
  async deleteRisk(id: string) {
    await request(`/platform-records/risks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return { success: true };
  },
  async getResponses(riskId?: string) {
    return filterBy(await readCollection('responses'), 'riskId', riskId);
  },
  async createResponse(response: any) {
    return writeItem('responses', {
      ...response,
      id: response.id || createId(),
      userId: response.userId || 'anonymous',
      departmentId: response.departmentId || response.department || 'unknown-department',
      submittedAt: response.submittedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: response.isDraft ? 'draft' : response.status || 'submitted',
    });
  },
  async getDepartments() {
    return readCollection('departments');
  },
  async createDepartment(department: any) {
    return writeItem('departments', { ...department, id: department.id || createId() });
  },
  async getAssignments(riskId?: string) {
    return filterBy(await readCollection('assignments'), 'riskId', riskId);
  },
  async createAssignment(assignment: any) {
    return writeItem('assignments', {
      ...assignment,
      id: assignment.id || `${assignment.riskId || 'risk'}:${assignment.departmentId || 'department'}`,
      createdAt: assignment.createdAt || new Date().toISOString(),
    });
  },
  exportDataset,
  importDataset,
  clearDataset,
};
