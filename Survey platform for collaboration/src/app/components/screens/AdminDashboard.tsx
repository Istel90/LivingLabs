import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge, statusLabels } from '../ui/Badge';
// Dashboard data is loaded through the local data API.
import { FileDown, FolderKanban, Users, CheckCircle2, FileText } from 'lucide-react';
import * as api from '../../lib/api';
import { sectors } from '../../data/sectorMapping';

interface AdminDashboardProps {
  onNavigate?: (screen: 'risks' | 'assignment' | 'review' | 'results') => void;
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const [risks, setRisks] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [risksData, responsesData] = await Promise.all([
        api.getRisks(),
        api.getResponses(),
      ]);

      console.log('Dashboard loaded:', { risks: risksData?.length, responses: responsesData?.length });

      setRisks(risksData || []);
      setResponses(responsesData || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setRisks([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  // 실제 데이터 기반 통계 계산
  const totalRisks = risks.length;

  const assignedDepartmentCount = new Set(
    risks.flatMap(risk => risk.assignedDepartmentIds || risk.assignedDepartmentsList || [])
  ).size;

  const submittedResponses = responses.filter(
    response => response.status === 'submitted'
  ).length;

  const confirmedRisks = risks.filter(
    risk => risk.status === 'confirmed'
  ).length;

  const totalAssignments = risks.reduce(
    (sum, risk) => sum + (risk.assignedDepartmentIds?.length || risk.assignedDepartmentsList?.length || 0),
    0
  );

  const progress = totalAssignments === 0
    ? 0
    : Math.round((submittedResponses / totalAssignments) * 100);

  // 부문별 진행현황 계산
  const sectorProgress = sectors.map(sector => {
    const sectorRisks = risks.filter(risk =>
      risk.sectorId === sector.id || risk.sector === sector.name
    );

    const total = sectorRisks.reduce(
      (sum, risk) => sum + (risk.assignedDepartmentIds?.length || risk.assignedDepartmentsList?.length || 0),
      0
    );

    const completed = responses.filter(response => {
      const risk = risks.find(r => r.id === response.riskId);
      return (risk?.sectorId === sector.id || risk?.sector === sector.name) &&
             response.status === 'submitted';
    }).length;

    return {
      sector: sector.name,
      total,
      completed,
    };
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-muted-foreground">대시보드를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">기후변화 리스크 설문 관리</h1>
          <div className="flex items-center gap-6 text-muted-foreground">
            <span>설문 기간: 2026-03-01 ~ 2026-04-30</span>
            <span>전체 진행률: {progress}%</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-muted-foreground mb-1">등록된 지역 리스크</div>
                  <div className="text-3xl">{totalRisks}</div>
                </div>
                <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                  <FolderKanban className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-muted-foreground mb-1">배정된 부서</div>
                  <div className="text-3xl">{assignedDepartmentCount}</div>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-muted-foreground mb-1">제출 완료 응답</div>
                  <div className="text-3xl">{submittedResponses}</div>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-muted-foreground mb-1">확정 완료 리스크</div>
                  <div className="text-3xl">{confirmedRisks}</div>
                </div>
                <div className="w-12 h-12 bg-blue-900/10 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-blue-900" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Action Buttons */}
        <div className="flex gap-4 mb-8">
          <Button variant="primary" onClick={() => onNavigate?.('risks')}>
            지역 리스크 관리
          </Button>
          <Button variant="outline" onClick={() => onNavigate?.('assignment')}>
            부서 배정 관리
          </Button>
          <Button variant="outline" onClick={() => onNavigate?.('review')}>
            응답 결과 확인
          </Button>
          <Button variant="outline" onClick={() => onNavigate?.('results')}>
            <FileDown className="w-4 h-4 mr-2" />
            엑셀 다운로드
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Sector Progress */}
          <div className="col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>부문별 진행현황</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sectorProgress.map((item) => {
                    const percentage = item.total === 0 ? 0 : (item.completed / item.total) * 100;
                    return (
                      <div key={item.sector}>
                        <div className="flex justify-between mb-2">
                          <span>{item.sector}</span>
                          <span className="text-muted-foreground">
                            {item.total === 0 ? '배정 없음' : `${item.completed} / ${item.total}`}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>최근 활동</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {risks.length > 0 ? (
                    risks
                      .slice()
                      .sort((a, b) => new Date(b.updatedAt || b.createdAt || '').getTime() - new Date(a.updatedAt || a.createdAt || '').getTime())
                      .slice(0, 5)
                      .map((risk) => (
                        <div key={risk.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                          <div className="mb-2">{risk.title || risk.name || '제목 없음'}</div>
                          <div className="flex items-center gap-2">
                            <Badge status={risk.status}>
                              {statusLabels[risk.status] || risk.status}
                            </Badge>
                            <span className="text-muted-foreground">{risk.sectorName || risk.sector}</span>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      최근 활동이 없습니다
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
