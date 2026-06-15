import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge, statusLabels } from '../ui/badge';
// Risk and response data is loaded through the local data API.
import { Calendar, FileText } from 'lucide-react';
import * as api from '../../lib/api';
import { getLocalGovernment } from '../../data/localGovernments';

interface RespondentRiskListProps {
  onStartSurvey?: (riskId: string) => void;
  userDepartment?: string;
  localGovId?: string;
}

export function RespondentRiskList({ onStartSurvey, userDepartment = '건강증진과', localGovId }: RespondentRiskListProps) {
  const [risks, setRisks] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const localGov = localGovId ? getLocalGovernment(localGovId) : null;
  const projectName = localGov ? `${localGov.displayName} 2026 기후변화 리스크 설문` : '기후변화 리스크 설문';

  useEffect(() => {
    if (userDepartment) {
      loadData();
    }
  }, [userDepartment]);

  async function loadData() {
    if (!userDepartment) {
      console.log('No user department, skipping load');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('Loading data for department:', userDepartment);

      const [risksData, responsesData] = await Promise.all([
        api.getRisks(),
        api.getResponses(),
      ]);

      console.log('All risks loaded:', risksData);
      console.log('All responses loaded:', responsesData);

      // 해당 부서에 배정된 리스크만 필터링
      const filtered = (risksData || []).filter((r: any) => {
        const deptList = r.assignedDepartmentIds || r.assignedDepartmentsList || [];
        const isAssigned = Array.isArray(deptList) && deptList.includes(userDepartment);
        return isAssigned;
      });

      console.log('Filtered risks for department:', filtered);
      setRisks(filtered);
      setResponses(responsesData || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      setRisks([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  const assignedRisks = risks;

  // 실제 응답 데이터 기반 통계 계산
  const totalAssigned = assignedRisks.length;
  const submitted = assignedRisks.filter(risk => {
    const response = responses.find(r =>
      r.riskId === risk.id &&
      r.department === userDepartment &&
      r.status === 'submitted'
    );
    return !!response;
  }).length;

  const inProgress = assignedRisks.filter(risk => {
    const response = responses.find(r =>
      r.riskId === risk.id &&
      r.department === userDepartment &&
      r.status === 'draft'
    );
    return !!response;
  }).length;

  const notStarted = totalAssigned - submitted - inProgress;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-muted-foreground">리스크 목록을 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="text-muted-foreground mb-2">{userDepartment}</div>
          <h1>{projectName}</h1>
        </div>

        {/* Info Card */}
        <Card className="mb-6 p-6 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-primary mt-1" />
            <div>
              <h3 className="mb-2">설문 안내</h3>
              <p className="text-muted-foreground">
                귀하의 부서에 배정된 {assignedRisks.length}개의 리스크에 대한 설문을 작성해 주세요.
                각 리스크를 클릭하여 현황정보를 확인하고 질문에 응답하실 수 있습니다.
                마감일은 2026년 4월 30일까지입니다.
              </p>
            </div>
          </div>
        </Card>

        {/* Risk Cards */}
        {assignedRisks.length > 0 ? (
          <div className="space-y-4">
            {assignedRisks.map(risk => (
            <Card key={risk.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="mb-2">{risk.title || risk.name}</h3>
                  <div className="text-muted-foreground mb-3">
                    {risk.sectorName || risk.sector} &gt; {risk.subsectorName || risk.subSector}
                    {(risk.detailTagName || risk.subSubTag) && ` > ${risk.detailTagName || risk.subSubTag}`}
                  </div>
                  <p className="text-muted-foreground mb-4">{risk.description}</p>
                </div>
                <Badge status={risk.status}>
                  {statusLabels[risk.status]}
                </Badge>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex items-center gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>마감: {risk.dueDate || '2026-04-30'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>현황정보 {risk.contextInfo?.blocks?.length || risk.contextPages || 0}페이지</span>
                  </div>
                </div>
                <Button variant="primary" onClick={() => onStartSurvey?.(risk.id)}>
                  응답하기
                </Button>
              </div>
            </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <div className="text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="mb-2">배정된 리스크가 없습니다</h3>
              <p>현재 귀하의 부서({userDepartment})에 배정된 리스크가 없습니다.</p>
            </div>
          </Card>
        )}

        {/* Progress Summary */}
        <Card className="mt-6 p-6">
          <div className="grid grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl mb-1">{totalAssigned}</div>
              <div className="text-muted-foreground">배정된 리스크</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1 text-green-600">{submitted}</div>
              <div className="text-muted-foreground">제출 완료</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1 text-blue-600">{inProgress}</div>
              <div className="text-muted-foreground">작성중</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1 text-gray-600">{notStarted}</div>
              <div className="text-muted-foreground">미작성</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
