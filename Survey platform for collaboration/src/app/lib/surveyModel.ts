export const RISK_TYPE_OPTIONS = [
  '우선적 추가조치 필요한 리스크 항목',
  '장기적 연구 및 모니터링이 필요한 리스크 항목',
  '잠재적 영향이 존재하는 리스크 항목',
];

export const URGENCY_OPTIONS = [
  { value: '시급성 낮음', label: '시급성 낮음' },
  { value: '시급함', label: '시급함' },
  { value: '매우 시급함', label: '매우 시급함' },
];

export const LAND_USE_TYPES = [
  '시가화·건조지역',
  '농업지역',
  '산림, 초지 및 습지',
  '나지',
  '수역 및 인근지역',
  '복합지역',
];

export const SPACE_SCOPE_OPTIONS = ['지자체 전역', '특정 권역', '특정 시군구', '기타'];
export const CHANGE_OPTIONS = ['감소', '현재와 비슷', '증가'];

export function normalizeAnswer(value: unknown) {
  return String(value ?? '').replace(/\s/g, '').toLowerCase().trim();
}

export function responseDepartment(response: any) {
  return response.departmentId || response.department || '';
}

export function responseMatchesDepartment(response: any, department: string) {
  return normalizeAnswer(responseDepartment(response)) === normalizeAnswer(department);
}

export function getRiskDepartments(risk: any): string[] {
  const departments = risk?.assignedDepartmentIds || risk?.assignedDepartmentsList || [];
  return Array.isArray(departments) ? departments : [];
}

export function getAnswerValue(response: any, questionId: string, legacyField?: string): any {
  if (Array.isArray(response?.answers)) {
    const answer = response.answers.find((item: any) => item.questionId === questionId);
    if (answer) return answer.value;
  }
  return legacyField ? response?.[legacyField] ?? '' : '';
}

export function buildAnswers(values: {
  q1Type: string;
  q1Urgency: string;
  q2Answers: string[];
  q3Short: string;
  q3Long: string;
}) {
  return [
    { questionId: 'q1_type', label: '리스크 유형', value: values.q1Type },
    { questionId: 'q1_urgency', label: '시급성', value: values.q1Urgency },
    { questionId: 'q2', label: '발생 가능 지역 및 공간', value: values.q2Answers },
    { questionId: 'q3_short', label: '단기간 영향 변화', value: values.q3Short },
    { questionId: 'q3_long', label: '장기간 영향 변화', value: values.q3Long },
  ];
}

export function getDepartmentResponse(responses: any[], riskId: string, department: string) {
  return responses.find((response) =>
    response.riskId === riskId && responseMatchesDepartment(response, department)
  );
}

export function getSubmittedResponsesForRisk(responses: any[], riskId: string) {
  return responses.filter((response) => response.riskId === riskId && response.status === 'submitted');
}

export function mostCommon(values: unknown[]) {
  const counts: Record<string, number> = {};
  values.flatMap((value) => Array.isArray(value) ? value : [value]).forEach((value) => {
    const label = String(value ?? '').trim();
    if (label) counts[label] = (counts[label] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? { value: entries[0][0], count: entries[0][1], total: values.length } : { value: '-', count: 0, total: 0 };
}

export function riskTitle(risk: any) {
  return risk?.title || risk?.name || '제목 없음';
}

export function riskSector(risk: any) {
  return risk?.sectorName || risk?.sector || '-';
}

export function riskSubsector(risk: any) {
  return risk?.subsectorName || risk?.subSector || '-';
}
