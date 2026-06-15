import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
// Summary data is loaded through the local data API.
import { FileDown, CheckCircle, AlertTriangle } from 'lucide-react';
import * as api from '../../lib/api';
import { sectors } from '../../data/sectorMapping';

export function ResultsSummary() {
  const [selectedSector, setSelectedSector] = useState('전체');
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

      console.log('Results summary loaded:', { risks: risksData?.length, responses: responsesData?.length });

      setRisks(risksData || []);
      setResponses(responsesData || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      setRisks([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  const allSectorsForFilter = ['전체', ...sectors.map(s => s.name)];

  const filteredRisks = selectedSector === '전체'
    ? risks
    : risks.filter(r => (r.sectorName || r.sector) === selectedSector);

  // Calculate actual statistics from data
  const confirmedCount = risks.filter(r => r.status === 'confirmed').length;

  // Count total assignments and submitted responses
  const totalAssignments = risks.reduce(
    (sum, risk) => sum + (risk.assignedDepartmentIds?.length || 0),
    0
  );

  const submittedResponses = responses.filter(r => r.status === 'submitted').length;
  const completionRate = totalAssignments === 0 ? 0 : Math.round((submittedResponses / totalAssignments) * 100);

  // Count urgent risks (priority determined by admin or status)
  const urgentCount = risks.filter(r =>
    r.finalUrgency === '매우 시급함' || r.finalUrgency === '매우시급'
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-muted-foreground">결과를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1>결과 요약 및 다운로드</h1>
          <Button variant="primary">
            <FileDown className="w-4 h-4 mr-2" />
            전체 결과 엑셀 다운로드
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-muted-foreground mb-1">전체 리스크</div>
                <div className="text-3xl">{risks.length}</div>
              </div>
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-muted-foreground mb-1">응답 완료율</div>
                <div className="text-3xl">{completionRate}%</div>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-muted-foreground mb-1">확정 완료율</div>
                <div className="text-3xl">{risks.length > 0 ? Math.round((confirmedCount / risks.length) * 100) : 0}%</div>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-blue-900" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-muted-foreground mb-1">매우 시급 리스크</div>
                <div className="text-3xl text-red-600">{urgentCount}</div>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Export Info */}
        <Card className="mb-6 p-6 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <FileDown className="w-5 h-5 text-primary mt-1" />
            <div>
              <h3 className="mb-2">엑셀 다운로드 안내</h3>
              <p className="text-muted-foreground">
                다운로드 파일에는 전체 우선순위, 부문별 응답현황, 리스크별 상세응답, 공간범위 선택 요약이 포함됩니다.
                확정이 완료된 리스크만 최종 우선순위에 포함됩니다.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-12 gap-6">
          {/* Sector Filter */}
          <div className="col-span-2">
            <Card className="p-4">
              <h3 className="mb-4">부문 필터</h3>
              <div className="space-y-2">
                {allSectorsForFilter.map(sector => (
                  <button
                    key={sector}
                    onClick={() => setSelectedSector(sector)}
                    className={`w-full text-left px-3 py-2 rounded transition-colors ${
                      selectedSector === sector
                        ? 'bg-primary text-white'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {sector}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Priority Table */}
          <div className="col-span-10">
            <Card className="p-6">
              <h3 className="mb-4">부문별 우선순위 표</h3>
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
                  {filteredRisks.map((risk, index) => (
                    <TableRow key={risk.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{risk.title || risk.name}</TableCell>
                      <TableCell>{risk.sectorName || risk.sector}</TableCell>
                      <TableCell>{risk.subsectorName || risk.subSector}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded ${
                          index === 0 ? 'bg-red-100 text-red-700' :
                          index === 1 ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {index === 0 ? '매우 시급' : index === 1 ? '시급' : '보통'}
                        </span>
                      </TableCell>
                      <TableCell>지자체 전역</TableCell>
                      <TableCell>증가</TableCell>
                      <TableCell>증가</TableCell>
                      <TableCell>
                        {risk.status === 'confirmed' ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <span className="text-muted-foreground">미확정</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
