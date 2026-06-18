export interface ContentBlock {
  id: string;
  type: 'title' | 'text' | 'chart' | 'map' | 'image' | 'table' | 'note' | 'source';
  title?: string;
  content?: string;
  imageUrl?: string;
  description?: string;
}

export interface RiskOverview {
  summary: string;
  expectedImpact: string;
  relatedClimateHazard: string;
}

export interface RiskContextInfo {
  title: string;
  body: string;
  keyPoints: string[];
  blocks: ContentBlock[];
  source: string;
}

export interface RiskMapInfo {
  center: [number, number];
  zoom: number;
  regionCode?: string;
  baseLayer: string;
  visibleLayers: string[];
  markers?: {
    id: string;
    lat: number;
    lng: number;
    label: string;
  }[];
}

export interface Risk {
  id: string;
  projectId: string;
  municipality: string;

  title: string;
  description: string;

  sectorId: string;
  sectorName: string;

  subsectorId: string;
  subsectorName: string;

  detailTagId?: string;
  detailTagName?: string;

  respondentGuide: string;

  overview: RiskOverview;
  contextInfo: RiskContextInfo;
  mapInfo: RiskMapInfo;

  assignedDepartmentIds: string[];

  status: 'draft' | 'review_requested' | 'confirmed';

  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Response {
  id: string;
  projectId: string;
  riskId: string;
  userId: string;
  departmentId: string;

  answers: {
    questionId: string;
    value: string | number;
    label: string;
  }[];

  status: 'draft' | 'submitted';
  submittedAt?: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  name: string;
  municipality: string;
}
