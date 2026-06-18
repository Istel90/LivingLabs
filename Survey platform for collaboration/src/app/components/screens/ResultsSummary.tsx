import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, FileDown, ListChecks } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import * as api from '../../lib/api';
import { getAnswerValue, getSubmittedResponsesForRisk, mostCommon, normalizeAnswer, URGENCY_OPTIONS } from '../../lib/surveyModel';

const urgencyLabels = ['시급하지 않음', '시급함', '매우 시급함'];

export function ResultsSummary() {
  const [selectedSector, setSelectedSector] = useState('전체');
  const [risks, setRisks] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const allSectorsForFilter = useMemo(() => {
    const sectorNames = risks
      .map((risk) => risk.sectorName || risk.sector)
      .filter(Boolean);
    return ['전체', ...Array.from(new Set(sectorNames))];
  }, [risks]);

  const filteredRisks = useMemo(() => {
    if (selectedSector === '전체') return risks;
    return risks.filter((risk) => (risk.sectorName || risk.sector) === selectedSector);
  }, [risks, selectedSector]);

  const urgencyScore = useMemo(() => {
    return URGENCY_OPTIONS.reduce<Record<string, number>>((acc, option, index) => {
      acc[normalizeAnswer(option.value)] = index + 1;
      acc[normalizeAnswer(option.label)] = index + 1;
      return acc;
    }, {});
  }, []);

  const rankedRisks = filteredRisks.slice().sort((a, b) => {
    const confirmedDelta = Number(b.status === 'confirmed') - Number(a.status === 'confirmed');
    if (confirmedDelta) return confirmedDelta;
    return getUrgencyScore(representativeUrgency(b)) - getUrgencyScore(representativeUrgency(a));
  });

  const confirmedCount = risks.filter((risk) => risk.status === 'confirmed').length;
  const totalAssignments = risks.reduce(
    (sum, risk) => sum + ((risk.assignedDepartmentIds || risk.assignedDepartmentsList || []).length || 0),
    0,
  );
  const submittedResponses = responses.filter((response) => response.status === 'submitted').length;
  const completionRate = totalAssignments === 0 ? 0 : Math.round((submittedResponses / totalAssignments) * 100);
  const confirmedRate = risks.length === 0 ? 0 : Math.round((confirmedCount / risks.length) * 100);
  const urgentCount = risks.filter((risk) => displayUrgency(representativeUrgency(risk)) === '매우 시급함').length;

  const sectorSummaries = allSectorsForFilter
    .filter((sector) => sector !== '전체')
    .map((sector) => {
      const sectorRisks = risks.filter((risk) => (risk.sectorName || risk.sector) === sector);
      const confirmed = sectorRisks.filter((risk) => risk.status === 'confirmed').length;
      return {
        sector,
        total: sectorRisks.length,
        confirmed,
        urgent: sectorRisks.filter((risk) => displayUrgency(representativeUrgency(risk)) === '매우 시급함').length,
      };
    });

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
      console.error('Failed to load results summary:', error);
      setRisks([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  function representativeValue(risk: any, questionId: string, legacyField: string) {
    const riskResponses = getSubmittedResponsesForRisk(responses, risk.id);
    return mostCommon(riskResponses.map((response) => getAnswerValue(response, questionId, legacyField))).value;
  }

  function representativeUrgency(risk: any) {
    return risk.finalUrgency || representativeValue(risk, 'q1_urgency', 'question1Urgency');
  }

  function getUrgencyScore(value: string) {
    return urgencyScore[normalizeAnswer(value)] || 0;
  }

  function displayUrgency(value: string) {
    const matchedIndex = URGENCY_OPTIONS.findIndex((option) =>
      normalizeAnswer(option.value) === normalizeAnswer(value) ||
      normalizeAnswer(option.label) === normalizeAnswer(value),
    );
    return matchedIndex >= 0 ? urgencyLabels[matchedIndex] : value || '-';
  }

  function urgencyBadgeClass(value: string) {
    const label = displayUrgency(value);
    if (label === '매우 시급함') return 'bg-red-100 text-red-700';
    if (label === '시급함') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="text-muted-foreground">결과를 불러오는 중입니다...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Final Results Summary
            </div>
            <h1 className="mt-1">결과 요약 및 다운로드</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              부서 응답, 주관부서 확정값, 부문별 우선순위를 종합해 최종 검토 결과를 확인합니다.
            </p>
          </div>
          <Button variant="primary">
            <FileDown className="mr-2 h-4 w-4" />
            전체 결과 엑셀 다운로드
          </Button>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="전체 리스크"
            value={`${risks.length}`}
            description={`현재 필터: ${selectedSector}`}
            icon={<ListChecks className="h-6 w-6 text-teal-700" />}
            iconClass="bg-teal-100"
          />
          <MetricCard
            label="응답 완료율"
            value={`${completionRate}%`}
            description={`${submittedResponses}/${totalAssignments}건 제출`}
            icon={<CheckCircle className="h-6 w-6 text-emerald-700" />}
            iconClass="bg-emerald-100"
          />
          <MetricCard
            label="확정 완료율"
            value={`${confirmedRate}%`}
            description={`${confirmedCount}/${risks.length}개 확정`}
            icon={<CheckCircle className="h-6 w-6 text-blue-800" />}
            iconClass="bg-blue-100"
          />
          <MetricCard
            label="매우 시급 리스크"
            value={`${urgentCount}`}
            description="최종 또는 대표 시급성 기준"
            icon={<AlertTriangle className="h-6 w-6 text-red-700" />}
            iconClass="bg-red-100"
            valueClass="text-red-600"
          />
        </div>

        <Card className="mb-6 overflow-hidden border-emerald-100">
          <div className="border-b border-emerald-100 bg-gradient-to-r from-[#073f4d] to-[#008b7a] p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                  Summary Filter
                </div>
                <h2 className="mt-1">최종 결과 필터</h2>
                <p className="mt-1 text-sm text-emerald-50">
                  부문별로 결과를 좁혀 확정 우선순위와 응답 현황을 확인합니다.
                </p>
              </div>
              <div className="rounded-full bg-white/15 px-3 py-1 text-sm">
                표시 리스크 {filteredRisks.length}개
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-[minmax(220px,320px)_1fr]">
            <div>
              <label className="mb-2 block text-sm text-muted-foreground">부문 필터</label>
              <select
                value={selectedSector}
                onChange={(event) => setSelectedSector(event.target.value)}
                className="w-full rounded-lg border border-input bg-input-background px-3 py-3"
              >
                {allSectorsForFilter.map((sector) => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4">
              <div className="text-xs font-semibold text-emerald-700">다운로드 안내</div>
              <p className="mt-2 text-sm text-muted-foreground">
                다운로드 파일에는 전체 우선순위, 부문별 응답현황, 리스크별 상세응답, 공간범위 선택 요약이 포함됩니다.
                확정이 완료된 리스크만 최종 우선순위에 포함됩니다.
              </p>
            </div>
          </div>
        </Card>

        <div className="mb-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3>부문별 요약</h3>
                <p className="mt-1 text-sm text-muted-foreground">부문별 리스크 수와 확정 진행 상황입니다.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {sectorSummaries.length}개 부문
              </span>
            </div>
            <div className="space-y-3">
              {sectorSummaries.length > 0 ? (
                sectorSummaries.map((summary) => (
                  <div key={summary.sector} className="rounded-xl border border-border bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold">{summary.sector}</div>
                      <span className="text-sm text-muted-foreground">{summary.total}개</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-white px-2 py-2">
                        <div className="font-semibold text-foreground">{summary.confirmed}</div>
                        <div className="text-muted-foreground">확정</div>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-2">
                        <div className="font-semibold text-red-600">{summary.urgent}</div>
                        <div className="text-muted-foreground">매우 시급</div>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-2">
                        <div className="font-semibold text-foreground">
                          {summary.total === 0 ? 0 : Math.round((summary.confirmed / summary.total) * 100)}%
                        </div>
                        <div className="text-muted-foreground">확정률</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  표시할 부문 요약이 없습니다.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3>최종 우선순위 현황</h3>
                <p className="mt-1 text-sm text-muted-foreground">확정 리스크와 시급성이 높은 리스크가 먼저 표시됩니다.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {rankedRisks.length}개
              </span>
            </div>
            <div className="space-y-3">
              {rankedRisks.slice(0, 5).map((risk, index) => {
                const urgency = representativeUrgency(risk);
                return (
                  <div key={risk.id} className="flex items-center gap-3 rounded-xl border border-border bg-white p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#073f4d] text-sm font-semibold text-white">
                      {risk.status === 'confirmed' ? index + 1 : '-'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{risk.title || risk.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {risk.sectorName || risk.sector || '-'} · {risk.subsectorName || risk.subSector || '-'}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-1 text-sm ${urgencyBadgeClass(urgency)}`}>
                      {displayUrgency(urgency)}
                    </span>
                  </div>
                );
              })}
              {rankedRisks.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  표시할 리스크가 없습니다.
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3>부문별 우선순위 표</h3>
              <p className="mt-1 text-sm text-muted-foreground">최종 결과를 표 형태로 확인합니다.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              {filteredRisks.length}개 표시
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>순위</TableHead>
                  <TableHead>리스크명</TableHead>
                  <TableHead>부문</TableHead>
                  <TableHead>세부부문</TableHead>
                  <TableHead>대표 시급성</TableHead>
                  <TableHead>주요 공간범위</TableHead>
                  <TableHead>단기 영향</TableHead>
                  <TableHead>장기 영향</TableHead>
                  <TableHead>확정 여부</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankedRisks.length > 0 ? (
                  rankedRisks.map((risk, index) => {
                    const urgency = representativeUrgency(risk);
                    const area = representativeValue(risk, 'q2', 'question2Answers');
                    const shortTerm = representativeValue(risk, 'q3_short', 'question3Short');
                    const longTerm = representativeValue(risk, 'q3_long', 'question3Long');

                    return (
                      <TableRow key={risk.id}>
                        <TableCell className="font-semibold">{risk.status === 'confirmed' ? index + 1 : '-'}</TableCell>
                        <TableCell className="font-medium">{risk.title || risk.name}</TableCell>
                        <TableCell>{risk.sectorName || risk.sector || '-'}</TableCell>
                        <TableCell>{risk.subsectorName || risk.subSector || '-'}</TableCell>
                        <TableCell>
                          <span className={`rounded px-2 py-1 text-sm ${urgencyBadgeClass(urgency)}`}>
                            {displayUrgency(urgency)}
                          </span>
                        </TableCell>
                        <TableCell>{area}</TableCell>
                        <TableCell>{shortTerm}</TableCell>
                        <TableCell>{longTerm}</TableCell>
                        <TableCell>
                          {risk.status === 'confirmed' ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-sm text-emerald-700">
                              <CheckCircle className="h-4 w-4" />
                              확정
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-600">미확정</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      표시할 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
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
  valueClass = '',
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  iconClass: string;
  valueClass?: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="mb-1 text-sm text-muted-foreground">{label}</div>
          <div className={`text-3xl font-semibold ${valueClass}`}>{value}</div>
          <div className="mt-2 text-xs text-muted-foreground">{description}</div>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}
