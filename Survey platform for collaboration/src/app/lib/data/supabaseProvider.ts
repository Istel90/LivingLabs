import { emptyDataset, type CollectionName, type DataProvider, type PlatformDataset } from './types';

const collections: CollectionName[] = ['projects', 'risks', 'responses', 'departments', 'assignments'];

interface SupabaseRecord {
  id: string;
  collection: CollectionName;
  project_id?: string | null;
  risk_id?: string | null;
  department_id?: string | null;
  payload: any;
  updated_at?: string;
}

function requireConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const table = import.meta.env.VITE_SUPABASE_RECORDS_TABLE || 'platform_records';

  if (!url || !anonKey) {
    throw new Error('Supabase backend requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  return { url: String(url).replace(/\/$/, ''), anonKey, table };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function recordFromItem(collection: CollectionName, item: any): SupabaseRecord {
  const id = item.id || createId();
  return {
    id,
    collection,
    project_id: item.projectId || null,
    risk_id: item.riskId || null,
    department_id: item.departmentId || item.department || null,
    payload: { ...item, id },
    updated_at: new Date().toISOString(),
  };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, anonKey } = requireConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function readCollection(collection: CollectionName): Promise<any[]> {
  const { table } = requireConfig();
  const records = await request(`${table}?collection=eq.${collection}&select=*`) as SupabaseRecord[];
  return records.map((record) => record.payload);
}

async function writeItem(collection: CollectionName, item: any) {
  const { table } = requireConfig();
  const record = recordFromItem(collection, item);
  const existing = await request(`${table}?collection=eq.${collection}&id=eq.${record.id}&select=id`) as Pick<SupabaseRecord, 'id'>[];

  if (existing.length) {
    const records = await request(`${table}?collection=eq.${collection}&id=eq.${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify(record),
    }) as SupabaseRecord[];
    return records[0]?.payload || record.payload;
  }

  const records = await request(table, {
    method: 'POST',
    body: JSON.stringify(record),
  }) as SupabaseRecord[];
  return records[0]?.payload || record.payload;
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
  const { table } = requireConfig();
  await request(`${table}?collection=in.(${collections.join(',')})`, { method: 'DELETE' });
}

export const supabaseDataProvider: DataProvider = {
  async getProjects() {
    return readCollection('projects');
  },
  async getProject(id: string) {
    return (await readCollection('projects')).find((project) => project.id === id) || null;
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
    return (await readCollection('risks')).find((risk) => risk.id === id) || null;
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
    const { table } = requireConfig();
    await request(`${table}?collection=eq.risks&id=eq.${id}`, { method: 'DELETE' });
    return { success: true };
  },
  async getResponses(riskId?: string) {
    return filterBy(await readCollection('responses'), 'riskId', riskId);
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
    return writeItem('responses', item);
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
