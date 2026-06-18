import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  FileDown,
  FileText,
  FolderKanban,
  Users,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import * as api from '../../lib/api';

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

  const totalRisks = risks.length;
  const assignedDepartmentCount = new Set(
    risks.flatMap((risk) => risk.assignedDepartmentIds || risk.assignedDepartmentsList || []),
  ).size;
  const submittedResponses = responses.filter((response) => response.status === 'submitted').length;
  const confirmedRisks = risks.filter((risk) => risk.status === 'confirmed').length;
  const totalAssignments = risks.reduce(
    (sum, risk) => sum + ((risk.assignedDepartmentIds || risk.assignedDepartmentsList || []).length || 0),
    0,
  );
  const progress = totalAssignments === 0 ? 0 : Math.round((submittedResponses / totalAssignments) * 100);
  const confirmRate = totalRisks === 0 ? 0 : Math.round((confirmedRisks / totalRisks) * 100);

  const sectorProgress = useMemo(() => {
    const sectorNames = Array.from(
      new Set(risks.map((risk) => risk.sectorName || risk.sector || '미분류')),
    );

    return sectorNames.map((sector) => {
      const sectorRisks = risks.filter((risk) => (risk.sectorName || risk.sector || '미분류') === sector);
      const total = sectorRisks.reduce(
        (sum, risk) => sum + ((risk.assignedDepartmentIds || risk.assignedDepartmentsList || []).length || 0),
        0,
      );
      const completed = responses.filter((response) => {
        const risk = risks.find((item) => item.id === response.riskId);
        return (risk?.sectorName || risk?.sector || '미분류') === sector && response.status === 'submitted';
      }).length;
      const confirmed = sectorRisks.filter((risk) => risk.status === 'confirmed').length;

      return {
        sector,
        total,
        completed,
        confirmed,
        risks: sectorRisks.length,
        percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
      };
    });
  }, [risks, responses]);

  const recentRisks = risks
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || '').getTime() - new Date(a.updatedAt || a.createdAt || '').getTime())
    .slice(0, 5);

  async function loadData() {
    try {
      setLoading(true);
      const [risksData, responsesData] = await Promise.all([
        api.getRisks(),
        api.getResponses(),
      ]);

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

  function statusLabel(status: string) {
    switch (status) {
      case 'confirmed':
        return '확정';
      case 'revision-requested':
        return '수정요청';
      case 'submitted':
      case 'completed':
        return '제출완료';
      case 'draft':
      case 'in-progress':
        return '작성중';
      default:
        return '미작성';
    }
  }

  function statusClass(status: string) {
    switch (status) {
      case 'confirmed':
        return 'bg-emerald-100 text-emerald-700';
      case 'revision-requested':
        return 'bg-amber-100 text-amber-700';
      case 'submitted':
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      case 'draft':
      case 'in-progress':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="text-muted-foreground">대시보드 데이터를 불러오는 중입니다...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-[#073f4d] to-[#008b7a] p-8 text-white shadow-xl">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                Risk Survey Dashboard
              </div>
              <h1 className="mt-3 text-3xl font-semibold">기후변화 리스크 설문 관리</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-50">
                리스크 등록, 현황정보 구성, 부서 배정, 응답 검토와 최종 결과 요약까지 진행 상황을 한눈에 확인합니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="primary" onClick={() => onNavigate?.('risks')} className="bg-white text-[#073f4d] hover:bg-emerald-50">
                  리스크 관리
                </Button>
                <Button variant="outline" onClick={() => onNavigate?.('assignment')} className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                  부서 배정
                </Button>
                <Button variant="outline" onClick={() => onNavigate?.('review')} className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                  응답 검토
                </Button>
                <Button variant="outline" onClick={() => onNavigate?.('results')} className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                  <FileDown className="mr-2 h-4 w-4" />
                  결과 요약
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <div className="text-sm text-emerald-50">전체 진행률</div>
              <div className="mt-2 text-5xl font-semibold">{progress}%</div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
                <div className="h-3 rounded-full bg-[#00c896]" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-3 text-sm text-emerald-50">
                제출 {submittedResponses}건 / 배정 {totalAssignments}건
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="등록된 지역 리스크"
            value={`${totalRisks}`}
            description="설문 단위로 관리되는 리스크"
            icon={<FolderKanban className="h-6 w-6 text-teal-700" />}
            iconClass="bg-teal-100"
          />
          <MetricCard
            label="배정된 부서"
            value={`${assignedDepartmentCount}`}
            description="응답 요청 대상 부서 수"
            icon={<Users className="h-6 w-6 text-blue-700" />}
            iconClass="bg-blue-100"
          />
          <MetricCard
            label="제출 완료 응답"
            value={`${submittedResponses}`}
            description={`전체 완료율 ${progress}%`}
            icon={<FileText className="h-6 w-6 text-emerald-700" />}
            iconClass="bg-emerald-100"
          />
          <MetricCard
            label="확정 완료 리스크"
            value={`${confirmedRisks}`}
            description={`확정률 ${confirmRate}%`}
            icon={<CheckCircle2 className="h-6 w-6 text-indigo-800" />}
            iconClass="bg-indigo-100"
          />
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            title="리스크 목록 정리"
            description="엑셀/CSV 등록, 리스크 정보 수정, 현황정보 구성으로 이어집니다."
            icon={<FolderKanban className="h-5 w-5" />}
            onClick={() => onNavigate?.('risks')}
          />
          <ActionCard
            title="부서 배정"
            description="리스크별 응답 부서와 마감일을 설정합니다."
            icon={<Users className="h-5 w-5" />}
            onClick={() => onNavigate?.('assignment')}
          />
          <ActionCard
            title="응답 결과 검토"
            description="부서 응답을 비교하고 최종값을 확정합니다."
            icon={<BarChart3 className="h-5 w-5" />}
            onClick={() => onNavigate?.('review')}
          />
          <ActionCard
            title="최종 결과 요약"
            description="우선순위와 부문별 요약을 확인합니다."
            icon={<FileCheck className="h-5 w-5" />}
            onClick={() => onNavigate?.('results')}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3>부문별 진행현황</h3>
                <p className="mt-1 text-sm text-muted-foreground">부문별 배정 대비 제출 현황입니다.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {sectorProgress.length}개 부문
              </span>
            </div>
            <div className="space-y-4">
              {sectorProgress.length > 0 ? (
                sectorProgress.map((item) => (
                  <div key={item.sector} className="rounded-xl border border-border bg-slate-50 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">{item.sector}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          리스크 {item.risks}개 · 확정 {item.confirmed}개
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.total === 0 ? '배정 없음' : `${item.completed} / ${item.total}`}
                      </div>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-3 rounded-full bg-[#008b7a] transition-all" style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  등록된 부문별 진행현황이 없습니다.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3>최근 활동</h3>
                <p className="mt-1 text-sm text-muted-foreground">최근 수정된 리스크 기준입니다.</p>
              </div>
              <ClipboardList className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="space-y-3">
              {recentRisks.length > 0 ? (
                recentRisks.map((risk) => (
                  <div key={risk.id} className="rounded-xl border border-border bg-white p-4">
                    <div className="mb-2 line-clamp-2 font-semibold">{risk.title || risk.name || '제목 없음'}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-1 text-xs ${statusClass(risk.status)}`}>
                        {statusLabel(risk.status)}
                      </span>
                      <span className="text-sm text-muted-foreground">{risk.sectorName || risk.sector || '미분류'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  최근 활동이 없습니다.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon,
  iconClass,
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="mb-1 text-sm text-muted-foreground">{label}</div>
          <div className="text-3xl font-semibold">{value}</div>
          <div className="mt-2 text-xs text-muted-foreground">{description}</div>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function ActionCard({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </button>
  );
}
