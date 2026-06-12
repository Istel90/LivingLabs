import { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { mockDepartments } from '../../data/mockData';
import { Calendar } from 'lucide-react';
import * as api from '../../lib/api';

export function DepartmentAssignment() {
  const [risks, setRisks] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [assignedDepts, setAssignedDepts] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('2026-04-30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedRisk) {
      // CRITICAL: Use assignedDepartmentIds as single source of truth
      const departments = selectedRisk.assignedDepartmentIds ||
                          selectedRisk.assignedDepartmentsList ||
                          [];
      setAssignedDepts(departments);
      setDueDate(selectedRisk.dueDate || '2026-04-30');
    }
  }, [selectedRisk?.id]);

  async function loadData() {
    try {
      setLoading(true);
      const [risksData, responsesData] = await Promise.all([
        api.getRisks(),
        api.getResponses(),
      ]);

      console.log('Department assignment loaded:', { risks: risksData?.length, responses: responsesData?.length });

      setRisks(risksData || []);
      setResponses(responsesData || []);

      if (risksData && risksData.length > 0) {
        setSelectedRisk(risksData[0]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setRisks([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  const toggleDepartment = (deptName: string) => {
    setAssignedDepts(prev =>
      prev.includes(deptName)
        ? prev.filter(d => d !== deptName)
        : [...prev, deptName]
    );
  };

  async function handleSaveAssignment() {
    if (!selectedRisk) return;

    try {
      // CRITICAL: Update assignedDepartmentIds as single source of truth
      const updatedRisk = {
        ...selectedRisk,
        assignedDepartmentIds: assignedDepts,
        dueDate: dueDate,
        updatedAt: new Date().toISOString(),
      };

      await api.updateRisk(selectedRisk.id, updatedRisk);

      // 각 부서별로 assignment 생성
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

  // Calculate assignment statistics based on actual data
  function getAssignmentStats(risk: any) {
    const assignedDepartmentIds = risk.assignedDepartmentIds || risk.assignedDepartmentsList || [];
    const assignedCount = assignedDepartmentIds.length;

    // Count responses for this risk
    const riskResponses = responses.filter(r => r.riskId === risk.id);
    const respondentCount = riskResponses.length;

    // Count submitted responses
    const submittedCount = riskResponses.filter(r => r.status === 'submitted').length;

    // Calculate status
    let status = '미작성';
    let statusColor = 'bg-gray-100 text-gray-700';

    if (submittedCount === 0 && respondentCount === 0) {
      status = '미작성';
      statusColor = 'bg-gray-100 text-gray-700';
    } else if (submittedCount > 0 && submittedCount < assignedCount) {
      status = '진행중';
      statusColor = 'bg-blue-100 text-blue-700';
    } else if (submittedCount === assignedCount && assignedCount > 0) {
      status = '완료';
      statusColor = 'bg-green-100 text-green-700';
    } else if (respondentCount > 0 && submittedCount === 0) {
      status = '작성중';
      statusColor = 'bg-yellow-100 text-yellow-700';
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
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-muted-foreground">데이터를 불러오는 중...</div>
      </div>
    );
  }

  if (!selectedRisk) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-muted-foreground">배정할 리스크가 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="mb-8">리스크-부서 배정 관리</h1>

        <div className="grid grid-cols-12 gap-6 mb-6">
          {/* Risk List */}
          <div className="col-span-3">
            <Card className="p-4">
              <h3 className="mb-4">지역 리스크 목록</h3>
              <div className="space-y-2">
                {risks.map(risk => (
                  <button
                    key={risk.id}
                    onClick={() => setSelectedRisk(risk)}
                    className={`w-full text-left px-3 py-2 rounded transition-colors ${
                      selectedRisk.id === risk.id
                        ? 'bg-primary text-white'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <div className="mb-1">{risk.title || risk.name}</div>
                    <div className={`${selectedRisk.id === risk.id ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {risk.sectorName || risk.sector}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Risk Info & Department Selection */}
          <div className="col-span-9 space-y-6">
            {/* Risk Info Card */}
            <Card className="p-6">
              <h3 className="mb-4">선택한 리스크 정보</h3>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24">리스크명:</span>
                  <span>{selectedRisk.title || selectedRisk.name}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24">분류:</span>
                  <span>
                    {selectedRisk.sectorName || selectedRisk.sector} &gt; {selectedRisk.subsectorName || selectedRisk.subSector}
                    {(selectedRisk.detailTagName || selectedRisk.subSubTag) && ` > ${selectedRisk.detailTagName || selectedRisk.subSubTag}`}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24">설명:</span>
                  <span>{selectedRisk.description}</span>
                </div>
              </div>
            </Card>

            {/* Department Selection */}
            <div className="grid grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="mb-4">관련 부서 선택</h3>
                <div className="space-y-2">
                  {mockDepartments.map(dept => (
                    <label
                      key={dept.id}
                      className="flex items-center gap-3 p-3 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={assignedDepts.includes(dept.name)}
                        onChange={() => toggleDepartment(dept.name)}
                        className="w-4 h-4"
                      />
                      <span>{dept.name}</span>
                    </label>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="mb-4">배정 설정</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block mb-2">선택된 부서</label>
                    <div className="p-3 bg-accent rounded border border-border min-h-[100px]">
                      {assignedDepts.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {assignedDepts.map(dept => (
                            <span
                              key={dept}
                              className="px-3 py-1 bg-primary text-white rounded"
                            >
                              {dept}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">부서를 선택하세요</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block mb-2">제출 마감일</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="flex-1 px-3 py-2 border border-input rounded bg-input-background"
                      />
                      <Button variant="outline" size="sm">
                        <Calendar className="w-4 h-4" />
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
          </div>
        </div>

        {/* Assignment Status Table */}
        <Card className="p-6">
          <h3 className="mb-4">배정 현황</h3>
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
              {risks.map(risk => {
                const stats = getAssignmentStats(risk);
                return (
                  <TableRow key={risk.id}>
                    <TableCell>{risk.title || risk.name}</TableCell>
                    <TableCell>{stats.assignedCount}개 부서</TableCell>
                    <TableCell>{stats.respondentCount}명</TableCell>
                    <TableCell>{stats.submittedCount}명</TableCell>
                    <TableCell>{risk.dueDate || '2026-04-30'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded ${stats.statusColor}`}>
                        {stats.status}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
