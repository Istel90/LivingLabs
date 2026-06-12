const STORAGE_PREFIX = 'living-lab-survey';

type CollectionName = 'projects' | 'risks' | 'responses' | 'departments' | 'assignments';

function storageKey(collection: CollectionName) {
  return `${STORAGE_PREFIX}:${collection}`;
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

function createId() {
  return crypto.randomUUID();
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

// Projects
export async function getProjects() {
  return readCollection('projects');
}

export async function getProject(id: string) {
  return readCollection('projects').find((project) => project.id === id) || null;
}

export async function createProject(project: any) {
  const item = {
    ...project,
    id: project.id || createId(),
    createdAt: project.createdAt || new Date().toISOString(),
  };
  return upsert('projects', item, (value) => value.id === item.id);
}

// Risks
export async function getRisks(projectId?: string) {
  const risks = readCollection('risks');
  return projectId ? risks.filter((risk) => risk.projectId === projectId) : risks;
}

export async function getRisk(id: string) {
  return readCollection('risks').find((risk) => risk.id === id) || null;
}

export async function createRisk(risk: any) {
  const item = {
    ...risk,
    id: risk.id || createId(),
    projectId: risk.projectId || 'default',
    createdAt: risk.createdAt || new Date().toISOString(),
  };
  return upsert('risks', item, (value) => value.id === item.id);
}

export async function updateRisk(id: string, risk: any) {
  const item = {
    ...risk,
    id,
    projectId: risk.projectId || 'default',
    updatedAt: new Date().toISOString(),
  };
  return upsert('risks', item, (value) => value.id === id);
}

export async function deleteRisk(id: string, _projectId?: string) {
  writeCollection(
    'risks',
    readCollection('risks').filter((risk) => risk.id !== id),
  );
  return { success: true };
}

// Responses
export async function getResponses(riskId?: string) {
  const responses = readCollection('responses');
  return riskId ? responses.filter((response) => response.riskId === riskId) : responses;
}

export async function createResponse(response: any) {
  const item = {
    ...response,
    id: response.id || createId(),
    userId: response.userId || 'anonymous',
    submittedAt: response.submittedAt || new Date().toISOString(),
    status: response.isDraft ? 'draft' : response.status || 'submitted',
  };
  return upsert(
    'responses',
    item,
    (value) => value.riskId === item.riskId && value.userId === item.userId,
  );
}

// Departments
export async function getDepartments() {
  return readCollection('departments');
}

export async function createDepartment(department: any) {
  const item = { ...department, id: department.id || createId() };
  return upsert('departments', item, (value) => value.id === item.id);
}

// Assignments
export async function getAssignments(riskId?: string) {
  const assignments = readCollection('assignments');
  return riskId
    ? assignments.filter((assignment) => assignment.riskId === riskId)
    : assignments;
}

export async function createAssignment(assignment: any) {
  const item = {
    ...assignment,
    createdAt: assignment.createdAt || new Date().toISOString(),
  };
  return upsert(
    'assignments',
    item,
    (value) =>
      value.riskId === item.riskId && value.departmentId === item.departmentId,
  );
}
