import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import * as api from '../../lib/api';
import {
  getAnswerValue,
  getSubmittedResponsesForRisk,
  mostCommon,
  normalizeAnswer,
  RISK_TYPE_OPTIONS,
  URGENCY_OPTIONS,
} from '../../lib/surveyModel';

const urgencyDisplayLabels = ['시급하지 않음', '시급함', '매우 시급함'];
const riskTypeDisplayLabels = [
  '우선순위 추가조치 필요 리스크',
  '장기적 연구 및 모니터링 필요 리스크',
  '현재 영향이 존재하는 리스크',
];

export function ResponseReview() {
  const [risks, setRisks] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSector, setSelectedSector] = useState('전체');
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [finalType, setFinalType] = useState('');
  const [finalUrgency, setFinalUrgency] = useState('');
  const [adminComment, setAdminComment] = useState('');

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

  useEffect(() => {
    if (loading) return;

    if (filteredRisks.length === 0) {
      setSelectedRisk(null);
      return;
    }

    if (!selectedRisk || !filteredRisks.some((risk) => risk.id === selectedRisk.id)) {
      setSelectedRisk(filteredRisks[0]);
    }
  }, [filteredRisks, loading]);

  const riskResponses = selectedRisk ? getSubmittedResponsesForRisk(responses, selectedRisk.id) : [];

  const selectedRiskPath = selectedRisk
    ? [
        selectedRisk.sectorName || selectedRisk.sector,
        selectedRisk.subsectorName || selectedRisk.subSector,
        selectedRisk.detailTagName || selectedRisk.subSubTag,
      ].filter(Boolean).join(' > ')
    : '';

  const assignedDepartments = selectedRisk?.assignedDepartmentIds || selectedRisk?.assignedDepartmentsList || [];
  const assignedCount = Array.isArray(assignedDepartments) ? assignedDepartments.length : 0;
  const completionRate = assignedCount === 0 ? 0 : Math.round((riskResponses.length / assignedCount) * 100);

  const q1TypeStats = getMostCommon('q1_type', 'question1Type');
  const q1UrgencyStats = getMostCommon('q1_urgency', 'question1Urgency');
  const q2Stats = getMostCommon('q2', 'question2Answers');
  const q3ShortStats = getMostCommon('q3_short', 'question3Short');
  const q3LongStats = getMostCommon('q3_long', 'question3Long');

  const urgencyColors = ['bg-emerald-500', 'bg-amber-500', 'bg-red-500'];
  const urgencyDistribution = URGENCY_OPTIONS.map((option, index) => {
    const count = riskResponses.filter((response) => {
      const urgency = getAnswerValue(response, 'q1_urgency', 'question1Urgency');
      return isSameAnswer(urgency, option.value);
    }).length;
    const total = riskResponses.length;
    const percentage = total === 0 ? 0 : Math.round((count / total) * 100);

    return {
      label: displayUrgency(option.value, index),
      count,
      percentage,
      color: urgencyColors[index] || 'bg-slate-500',
    };
  });

  useEffect(() => {
    if (!selectedRisk) return;

    setFinalType(selectedRisk.finalType || (q1TypeStats.value === '-' ? '' : q1TypeStats.value));
    setFinalUrgency(selectedRisk.finalUrgency || (q1UrgencyStats.value === '-' ? '' : q1UrgencyStats.value));
    setAdminComment(selectedRisk.adminComment || '');
  }, [selectedRisk?.id, q1TypeStats.value, q1UrgencyStats.value]);

  async function loadData() {
    try {
      setLoading(true);
      const [risksData, responsesData] = await Promise.all([
        api.getRisks(),
        api.getResponses(),
      ]);

      setRisks(risksData || []);
      setResponses(responsesData || []);

      if (risksData && risksData.length > 0) {
        setSelectedRisk(risksData[0]);
      }
    } catch (error) {
      console.error('Failed to load review data:', error);
      setRisks([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  function isSameAnswer(a: any, b: any) {
    return normalizeAnswer(a) === normalizeAnswer(b);
  }

  function getMostCommon(questionId: string, legacyField: string) {
    return mostCommon(riskResponses.map((response) => getAnswerValue(response, questionId, legacyField)));
  }

  function displayUrgency(value: string, index?: number) {
    const matchedIndex = URGENCY_OPTIONS.findIndex((option) => isSameAnswer(option.value, value));
    const labelIndex = matchedIndex >= 0 ? matchedIndex : index;
    return labelIndex !== undefined && urgencyDisplayLabels[labelIndex]
      ? urgencyDisplayLabels[labelIndex]
      : value || '-';
  }

  function displayRiskType(value: string, index?: number) {
    const matchedIndex = RISK_TYPE_OPTIONS.findIndex((option) => isSameAnswer(option, value));
    const labelIndex = matchedIndex >= 0 ? matchedIndex : index;
    return labelIndex !== undefined && riskTypeDisplayLabels[labelIndex]
      ? riskTypeDisplayLabels[labelIndex]
      : value || '-';
  }

  function displayDate(value: string) {
    if (!value || value === '-') return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR');
  }

  async function handleConfirm() {
    if (!selectedRisk) return;

    if (!finalUrgency || !finalType) {
      alert('최종 확정값을 모두 선택해주세요.');
      return;
    }

    try {
      const updatedRisk = {
        ...selectedRisk,
        finalType,
        finalUrgency,
        adminComment,
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
      };

      await api.updateRisk(selectedRisk.id, updatedRisk);
      alert('응답 결과가 확정되었습니다.');
      await loadData();
    } catch (error) {
      console.error('Failed to confirm response:', error);
      alert('확정 저장에 실패했습니다.');
    }
  }

  async function handleRequestRevision() {
    if (!selectedRisk) return;

    if (!adminComment.trim()) {
      alert('수정요청 사유를 입력해주세요.');
      return;
    }

    try {
      const updatedRisk = {
        ...selectedRisk,
        status: 'revision-requested',
        adminComment,
        revisionRequestedAt: new Date().toISOString(),
      };

      await api.updateRisk(selectedRisk.id, updatedRisk);
      alert('수정요청이 전송되었습니다.');
      await loadData();
    } catch (error) {
      console.error('Failed to request revision:', error);
      alert('수정요청 저장에 실패했습니다.');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="text-muted-foreground">응답 데이터를 불러오는 중입니다...</div>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <Card className="max-w-md p-8 text-center">
          <h2 className="mb-2">검토할 리스크가 없습니다</h2>
          <p className="text-muted-foreground">리스크 관리 페이지에서 리스크를 먼저 등록해주세요.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Response Review
          </div>
          <h1 className="mt-1">응답 결과 검토</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            부서별 제출 응답을 비교하고, 주관부서의 최종 리스크 유형과 시급성을 확정합니다.
          </p>
        </div>

        <Card className="mb-6 overflow-hidden border-emerald-100">
          <div className="border-b border-emerald-100 bg-gradient-to-r from-[#073f4d] to-[#008b7a] p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                  Review Target
                </div>
                <h2 className="mt-1">검토할 리스크 선택</h2>
                <p className="mt-1 text-sm text-emerald-50">
                  부문과 리스크를 선택하면 제출 응답, 최빈값, 확정 패널이 한 화면에 정리됩니다.
                </p>
              </div>
              <div className="rounded-full bg-white/15 px-3 py-1 text-sm">
                제출 응답 {responses.filter((response) => response.status === 'submitted').length}건
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 p-5">
            <div className="col-span-12 md:col-span-3">
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

            <div className="col-span-12 md:col-span-5">
              <label className="mb-2 block text-sm text-muted-foreground">리스크 선택</label>
              <select
                value={selectedRisk?.id || ''}
                onChange={(event) => {
                  const nextRisk = risks.find((risk) => risk.id === event.target.value);
                  setSelectedRisk(nextRisk || null);
                }}
                disabled={filteredRisks.length === 0}
                className="w-full rounded-lg border border-input bg-input-background px-3 py-3"
              >
                {filteredRisks.length === 0 ? (
                  <option value="">선택 가능한 리스크가 없습니다</option>
                ) : (
                  filteredRisks.map((risk) => (
                    <option key={risk.id} value={risk.id}>
                      {risk.title || risk.name}
                    </option>
                  ))
                )}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">
                현재 필터에 해당하는 리스크 {filteredRisks.length}개
              </p>
            </div>

            <div className="col-span-12 md:col-span-4">
              {selectedRisk ? (
                <div className="h-full rounded-xl border border-emerald-100 bg-emerald-50/80 p-4">
                  <div className="text-xs font-semibold text-emerald-700">선택된 리스크</div>
                  <h3 className="mt-1 line-clamp-2">{selectedRisk.title || selectedRisk.name}</h3>
                  <div className="mt-2 text-sm text-muted-foreground">{selectedRiskPath || '분류 정보 없음'}</div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{riskResponses.length}</div>
                      <div className="text-muted-foreground">제출</div>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{assignedCount}</div>
                      <div className="text-muted-foreground">배정</div>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{completionRate}%</div>
                      <div className="text-muted-foreground">완료율</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  리스크를 선택해주세요.
                </div>
              )}
            </div>
          </div>
        </Card>

        {selectedRisk && (
          <div className="grid grid-cols-12 gap-6">
            <Card className="col-span-12 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3>{selectedRisk.title || selectedRisk.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedRisk.description || '등록된 설명이 없습니다.'}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedRiskPath}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm ${
                  selectedRisk.status === 'confirmed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : selectedRisk.status === 'revision-requested'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-700'
                }`}>
                  {selectedRisk.status === 'confirmed'
                    ? '확정됨'
                    : selectedRisk.status === 'revision-requested'
                      ? '수정요청'
                      : '검토중'}
                </span>
              </div>
            </Card>

            <Card className="col-span-12 p-6 lg:col-span-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3>최빈값 요약</h3>
                  <p className="mt-1 text-sm text-muted-foreground">제출된 응답에서 가장 많이 선택된 값입니다.</p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
                  {riskResponses.length}명
                </span>
              </div>

              <div className="space-y-3">
                <SummaryItem label="리스크 유형" value={displayRiskType(q1TypeStats.value)} stats={q1TypeStats} />
                <SummaryItem label="시급성" value={displayUrgency(q1UrgencyStats.value)} stats={q1UrgencyStats} accent />
                <SummaryItem label="공간 범위" value={q2Stats.value} stats={q2Stats} />
                <SummaryItem label="단기 영향" value={q3ShortStats.value} stats={q3ShortStats} />
                <SummaryItem label="장기 영향" value={q3LongStats.value} stats={q3LongStats} />
              </div>
            </Card>

            <Card className="col-span-12 p-6 lg:col-span-8">
              <div className="mb-4">
                <h3>시급성 응답 분포</h3>
                <p className="mt-1 text-sm text-muted-foreground">부서별 응답이 어느 시급성에 몰려 있는지 확인합니다.</p>
              </div>
              <div className="space-y-4">
                {urgencyDistribution.map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground">
                        {item.count}명 ({item.percentage}%)
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`${item.color} h-3 rounded-full transition-all`}
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {riskResponses.length === 0 && (
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-dashed border-border bg-slate-50 p-4 text-sm text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  아직 제출된 응답이 없습니다. 부서 배정 후 응답이 제출되면 이곳에 분포가 표시됩니다.
                </div>
              )}
            </Card>

            <Card className="col-span-12 p-6 lg:col-span-8">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3>개별 응답 목록</h3>
                  <p className="mt-1 text-sm text-muted-foreground">부서별 제출값을 비교합니다.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                  {riskResponses.length}건
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>응답자</TableHead>
                      <TableHead>근무부서</TableHead>
                      <TableHead>리스크 유형/시급성</TableHead>
                      <TableHead>단기 영향</TableHead>
                      <TableHead>제출일시</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riskResponses.length > 0 ? (
                      riskResponses.map((response) => {
                        const type = getAnswerValue(response, 'q1_type', 'question1Type');
                        const urgency = getAnswerValue(response, 'q1_urgency', 'question1Urgency');
                        const shortTerm = getAnswerValue(response, 'q3_short', 'question3Short');
                        const respondent = response.respondent || response.userId || '-';
                        const department = response.department || response.departmentId || '-';
                        const submittedAt = response.submittedAt || response.updatedAt || '-';

                        return (
                          <TableRow key={response.id}>
                            <TableCell className="font-medium">{respondent}</TableCell>
                            <TableCell>{department}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div className="mb-1">{displayRiskType(type)}</div>
                                <div className="font-medium text-emerald-700">{displayUrgency(urgency)}</div>
                              </div>
                            </TableCell>
                            <TableCell>{shortTerm || '-'}</TableCell>
                            <TableCell className="text-sm">{displayDate(submittedAt)}</TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          아직 제출된 응답이 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <Card className="col-span-12 p-6 lg:col-span-4">
              <h3 className="mb-4">주관부서 최종 확정</h3>
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4">
                  <div className="mb-2 text-sm text-muted-foreground">시스템 추천값</div>
                  <div className="font-semibold">{displayRiskType(q1TypeStats.value)}</div>
                  <div className="mt-1 font-semibold text-emerald-700">{displayUrgency(q1UrgencyStats.value)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    최빈값 기준 ({q1UrgencyStats.count}/{q1UrgencyStats.total}명)
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-muted-foreground">최종 시급성</label>
                  <select
                    value={finalUrgency}
                    onChange={(event) => setFinalUrgency(event.target.value)}
                    className="w-full rounded-lg border border-input bg-input-background px-3 py-2"
                  >
                    <option value="">시급성 선택</option>
                    {URGENCY_OPTIONS.map((option, index) => (
                      <option key={option.value} value={option.value}>{displayUrgency(option.value, index)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-muted-foreground">최종 리스크 유형</label>
                  <select
                    value={finalType}
                    onChange={(event) => setFinalType(event.target.value)}
                    className="w-full rounded-lg border border-input bg-input-background px-3 py-2"
                  >
                    <option value="">유형 선택</option>
                    {RISK_TYPE_OPTIONS.map((option, index) => (
                      <option key={option} value={option}>{displayRiskType(option, index)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-muted-foreground">주관부서 의견</label>
                  <textarea
                    rows={4}
                    placeholder="최종 확정값 선택 근거나 추가 의견을 입력하세요."
                    value={adminComment}
                    onChange={(event) => setAdminComment(event.target.value)}
                    className="w-full rounded-lg border border-input bg-input-background px-3 py-2"
                  />
                </div>

                <Button variant="primary" className="w-full" onClick={handleConfirm}>
                  확정
                </Button>
                <Button variant="outline" className="w-full" onClick={handleRequestRevision}>
                  수정요청
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  stats,
  accent = false,
}: {
  label: string;
  value: string;
  stats: { count: number; total: number };
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-slate-50'}`}>
      <div className="mb-1 text-sm text-muted-foreground">{label}</div>
      <div className={accent ? 'font-semibold text-emerald-700' : 'font-semibold'}>{value || '-'}</div>
      <div className="mt-2 text-xs text-muted-foreground">
        {stats.count}/{stats.total}명
      </div>
    </div>
  );
}
