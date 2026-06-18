import { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { mockDepartments } from '../../data/mockData';
import * as api from '../../lib/api';

export function DepartmentAssignment() {
  const [risks, setRisks] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [selectedSector, setSelectedSector] = useState('전체');
  const [assignedDepts, setAssignedDepts] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('2026-04-30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedRisk) return;

    const departments = selectedRisk.assignedDepartmentIds || selectedRisk.assignedDepartmentsList || [];
    setAssignedDepts(departments);
    setDueDate(selectedRisk.dueDate || '2026-04-30');
  }, [selectedRisk?.id]);

  const allSectorsForFilter = useMemo(() => {
    const sectors = risks
      .map((risk) => risk.sectorName || risk.sector)
      .filter(Boolean);
    return ['전체', ...Array.from(new Set(sectors))];
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

  const selectedRiskPath = selectedRisk
    ? [
        selectedRisk.sectorName || selectedRisk.sector,
        selectedRisk.subsectorName || selectedRisk.subSector,
        selectedRisk.detailTagName || selectedRisk.subSubTag,
      ].filter(Boolean).join(' > ')
    : '';

  const selectedStats = selectedRisk ? getAssignmentStats(selectedRisk) : null;

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
      console.error('Failed to load department assignment data:', error);
      setRisks([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleDepartment(deptName: string) {
    setAssignedDepts((prev) =>
      prev.includes(deptName)
        ? prev.filter((dept) => dept !== deptName)
        : [...prev, deptName],
    );
  }

  async function handleSaveAssignment() {
    if (!selectedRisk) return;

    try {
      const updatedRisk = {
        ...selectedRisk,
        assignedDepartmentIds: assignedDepts,
        dueDate,
        updatedAt: new Date().toISOString(),
      };

      await api.updateRisk(selectedRisk.id, updatedRisk);

      for (const dept of assignedDepts) {
        await api.createAssignment({
          riskId: selectedRisk.id,
          departmentId: dept,
          department: dept,
          deadline: dueDate,
        });
      }

      alert(`${assignedDepts.length}개 부서에 배정이 완료되었습니다.`);
      await loadData();
    } catch (error) {
      console.error('Failed to save assignment:', error);
      alert('부서 배정 저장에 실패했습니다.');
    }
  }

  function getAssignmentStats(risk: any) {
    const assignedDepartmentIds = risk.assignedDepartmentIds || risk.assignedDepartmentsList || [];
    const assignedCount = assignedDepartmentIds.length;
    const riskResponses = responses.filter((response) => response.riskId === risk.id);
    const respondentCount = riskResponses.length;
    const submittedCount = riskResponses.filter((response) => response.status === 'submitted').length;

    let status = '미작성';
    let statusColor = 'bg-slate-100 text-slate-700';

    if (submittedCount > 0 && submittedCount < assignedCount) {
      status = '진행중';
      statusColor = 'bg-blue-100 text-blue-700';
    } else if (submittedCount === assignedCount && assignedCount > 0) {
      status = '완료';
      statusColor = 'bg-emerald-100 text-emerald-700';
    } else if (respondentCount > 0 && submittedCount === 0) {
      status = '작성중';
      statusColor = 'bg-amber-100 text-amber-700';
    }

    return {
      assignedCount,
      respondentCount,
      submittedCount,
      status,
      statusColor,
    };
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="text-muted-foreground">데이터를 불러오는 중입니다...</div>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <Card className="max-w-md p-8 text-center">
          <h2 className="mb-2">배정할 리스크가 없습니다</h2>
          <p className="text-muted-foreground">리스크 관리 페이지에서 리스크 목록을 먼저 등록해주세요.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Risk Department Assignment
          </div>
          <h1 className="mt-1">리스크-부서 배정 관리</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            리스크별 응답 부서를 지정하고 마감일을 설정합니다. 리스크 목록은 드롭다운으로 선택해 화면을 간결하게 유지합니다.
          </p>
        </div>

        <Card className="mb-6 overflow-hidden border-emerald-100">
          <div className="border-b border-emerald-100 bg-gradient-to-r from-[#073f4d] to-[#008b7a] p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                  Risk Selector
                </div>
                <h2 className="mt-1">부서를 배정할 리스크 선택</h2>
                <p className="mt-1 text-sm text-emerald-50">
                  부문으로 좁히고, 개별 리스크를 선택해 관련 부서와 제출 마감일을 관리합니다.
                </p>
              </div>
              <div className="rounded-full bg-white/15 px-3 py-1 text-sm">
                등록 리스크 {risks.length}개
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
              {selectedRisk && selectedStats ? (
                <div className="h-full rounded-xl border border-emerald-100 bg-emerald-50/80 p-4">
                  <div className="text-xs font-semibold text-emerald-700">선택된 리스크</div>
                  <h3 className="mt-1 line-clamp-2">{selectedRisk.title || selectedRisk.name}</h3>
                  <div className="mt-2 text-sm text-muted-foreground">{selectedRiskPath || '분류 정보 없음'}</div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{selectedStats.assignedCount}</div>
                      <div className="text-muted-foreground">배정부서</div>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{selectedStats.submittedCount}</div>
                      <div className="text-muted-foreground">제출</div>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{selectedRisk.dueDate || dueDate}</div>
                      <div className="text-muted-foreground">마감</div>
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
          <div className="mb-6 grid grid-cols-12 gap-6">
            <Card className="col-span-12 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3>선택한 리스크 정보</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedRisk.description || '등록된 설명이 없습니다.'}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm ${selectedStats?.statusColor}`}>
                  {selectedStats?.status}
                </span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-slate-50 p-4">
                  <div className="text-xs text-muted-foreground">리스크명</div>
                  <div className="mt-1 font-semibold">{selectedRisk.title || selectedRisk.name}</div>
                </div>
                <div className="rounded-xl border border-border bg-slate-50 p-4">
                  <div className="text-xs text-muted-foreground">분류</div>
                  <div className="mt-1 font-semibold">{selectedRiskPath || '-'}</div>
                </div>
                <div className="rounded-xl border border-border bg-slate-50 p-4">
                  <div className="text-xs text-muted-foreground">현재 배정</div>
                  <div className="mt-1 font-semibold">{assignedDepts.length}개 부서</div>
                </div>
              </div>
            </Card>

            <Card className="col-span-12 p-6 lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3>관련 부서 선택</h3>
                  <p className="mt-1 text-sm text-muted-foreground">설문 응답을 요청할 부서를 선택합니다.</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                  {assignedDepts.length}개 선택
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {mockDepartments.map((dept) => {
                  const checked = assignedDepts.includes(dept.name);
                  return (
                    <label
                      key={dept.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-border bg-white hover:border-emerald-200 hover:bg-emerald-50/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDepartment(dept.name)}
                        className="h-4 w-4"
                      />
                      <span className="font-medium">{dept.name}</span>
                    </label>
                  );
                })}
              </div>
            </Card>

            <Card className="col-span-12 p-6 lg:col-span-5">
              <h3 className="mb-4">배정 설정</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-muted-foreground">선택된 부서</label>
                  <div className="min-h-[112px] rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                    {assignedDepts.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {assignedDepts.map((dept) => (
                          <span key={dept} className="rounded-lg bg-[#008b7a] px-3 py-1 text-sm text-white">
                            {dept}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">부서를 선택해주세요.</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-muted-foreground">제출 마감일</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      className="flex-1 rounded-lg border border-input bg-input-background px-3 py-2"
                    />
                    <Button variant="outline" size="sm">
                      <Calendar className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleSaveAssignment}
                  disabled={assignedDepts.length === 0}
                >
                  선택 부서 배정
                </Button>
              </div>
            </Card>
          </div>
        )}

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3>배정 현황</h3>
              <p className="mt-1 text-sm text-muted-foreground">전체 리스크의 부서 배정과 응답 제출 상태입니다.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              {risks.length}개 리스크
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>리스크명</TableHead>
                  <TableHead>배정 부서</TableHead>
                  <TableHead>응답자 수</TableHead>
                  <TableHead>제출 수</TableHead>
                  <TableHead>마감일</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risks.map((risk) => {
                  const stats = getAssignmentStats(risk);
                  return (
                    <TableRow key={risk.id}>
                      <TableCell className="font-medium">{risk.title || risk.name}</TableCell>
                      <TableCell>{stats.assignedCount}개 부서</TableCell>
                      <TableCell>{stats.respondentCount}명</TableCell>
                      <TableCell>{stats.submittedCount}명</TableCell>
                      <TableCell>{risk.dueDate || '2026-04-30'}</TableCell>
                      <TableCell>
                        <span className={`rounded px-2 py-1 text-sm ${stats.statusColor}`}>
                          {stats.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
