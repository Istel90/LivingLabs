import { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
// Review data is loaded through the local data API.
import { AlertCircle } from 'lucide-react';
import * as api from '../../lib/api';
import { sectors } from '../../data/sectorMapping';

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

  async function loadData() {
    try {
      setLoading(true);
      const [risksData, responsesData] = await Promise.all([
        api.getRisks(),
        api.getResponses(),
      ]);

      console.log('Response review loaded:', { risks: risksData?.length, responses: responsesData?.length });

      setRisks(risksData || []);
      setResponses(responsesData || []);

      if (risksData && risksData.length > 0) {
        const firstRisk = risksData[0];
        setSelectedRisk(firstRisk);
        console.log('Selected risk:', firstRisk);
        console.log('Responses for this risk:', responsesData?.filter(r => r.riskId === firstRisk.id));

        // 이미 확정된 값이 있으면 로드
        if (firstRisk.finalType) setFinalType(firstRisk.finalType);
        if (firstRisk.finalUrgency) setFinalUrgency(firstRisk.finalUrgency);
        if (firstRisk.adminComment) setAdminComment(firstRisk.adminComment);
      }
    } catch (error) {
      console.error('Failed to load review data:', error);
      setRisks([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  // submitted 응답만 필터링
  const riskResponses = responses.filter(r =>
    r.riskId === selectedRisk?.id &&
    (r.status === 'submitted' || !r.status)
  );

  // normalize 함수: 띄어쓰기와 대소문자 차이 제거
  const normalizeAnswer = (value: any): string => {
    if (!value) return '';
    return String(value).replace(/\s/g, '').toLowerCase().trim();
  };

  const isSameAnswer = (a: any, b: any): boolean => {
    return normalizeAnswer(a) === normalizeAnswer(b);
  };

  // 응답에서 특정 질문의 답변 추출 (old/new structure 모두 지원)
  const getAnswerValue = (response: any, questionId: string, legacyField?: string): string => {
    // New structure: answers 배열 사용
    if (response.answers && Array.isArray(response.answers)) {
      const answer = response.answers.find((ans: any) =>
        ans.questionId === questionId ||
        normalizeAnswer(ans.label).includes(normalizeAnswer(questionId))
      );
      if (answer) return answer.value;
    }

    // Old structure: legacy field 사용
    if (legacyField && response[legacyField]) {
      return response[legacyField];
    }

    return '';
  };

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

    if (!adminComment) {
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

  const allSectorsForFilter = ['전체', ...sectors.map(s => s.name)];

  const filteredRisks = selectedSector === '전체'
    ? risks
    : risks.filter(r => (r.sectorName || r.sector) === selectedSector);

  // 실제 데이터 기반 통계 계산 (old/new structure 모두 지원)
  function getMostCommon(questionId: string, legacyField: string): { value: string; count: number; total: number } {
    const counts: Record<string, number> = {};

    riskResponses.forEach(r => {
      let value = getAnswerValue(r, questionId, legacyField);

      // question2는 배열일 수 있음
      if (legacyField === 'question2Answers' && Array.isArray(value)) {
        value = value[0];
      }

      if (value) {
        counts[value] = (counts[value] || 0) + 1;
      }
    });

    const entries = Object.entries(counts);
    if (entries.length === 0) return { value: '-', count: 0, total: 0 };

    entries.sort((a, b) => b[1] - a[1]);
    return { value: entries[0][0], count: entries[0][1], total: riskResponses.length };
  }

  const q1TypeStats = getMostCommon('q1_type', 'question1Type');
  const q1UrgencyStats = getMostCommon('q1_urgency', 'question1Urgency');
  const q2Stats = getMostCommon('q2', 'question2Answers');
  const q3ShortStats = getMostCommon('q3_short', 'question3Short');
  const q3LongStats = getMostCommon('q3_long', 'question3Long');

  // 긴급도별 분포 계산 (실제 응답 데이터 기반)
  // mockData의 실제 값: '매우 시급함', '시급함'
  const urgencyOptions = ['매우 시급함', '시급함', '시급성 낮음'];
  const urgencyLabels = ['매우 시급', '시급함', '시급성 낮음'];
  const urgencyColors = ['bg-red-500', 'bg-orange-500', 'bg-green-500'];

  const urgencyDistribution = urgencyOptions.map((option, index) => {
    const count = riskResponses.filter(response => {
      const urgency = getAnswerValue(response, 'q1_urgency', 'question1Urgency');
      const matches = isSameAnswer(urgency, option) ||
                      isSameAnswer(urgency, urgencyLabels[index]);
      return matches;
    }).length;

    const total = riskResponses.length;
    const percentage = total === 0 ? 0 : Math.round((count / total) * 100);

    return {
      label: urgencyLabels[index],
      count,
      percentage,
      color: urgencyColors[index],
    };
  });

  // selectedRisk 변경 시 확정값 초기화
  useEffect(() => {
    if (selectedRisk) {
      setFinalType(selectedRisk.finalType || q1TypeStats.value);
      setFinalUrgency(selectedRisk.finalUrgency || q1UrgencyStats.value);
      setAdminComment(selectedRisk.adminComment || '');
    }
  }, [selectedRisk?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-muted-foreground">응답 데이터를 불러오는 중...</div>
      </div>
    );
  }

  if (!selectedRisk) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-muted-foreground">검토할 리스크가 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="mb-8">응답 결과 검토</h1>

        {/* Risk Selection */}
        <div className="grid grid-cols-12 gap-6 mb-6">
          <div className="col-span-3">
            <Card className="p-4">
              <h3 className="mb-4">부문 선택</h3>
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded bg-input-background mb-4"
              >
                {allSectorsForFilter.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>

              <h3 className="mb-3">리스크 선택</h3>
              {filteredRisks.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredRisks.map(risk => (
                    <button
                      key={risk.id}
                      onClick={() => setSelectedRisk(risk)}
                      className={`w-full text-left px-3 py-2 rounded transition-colors ${
                        selectedRisk?.id === risk.id
                          ? 'bg-primary text-white'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="text-sm mb-1">{risk.title || risk.name}</div>
                      <div className={`text-xs ${selectedRisk?.id === risk.id ? 'text-white/80' : 'text-muted-foreground'}`}>
                        {risk.sectorName || risk.sector}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground text-center py-4">
                  리스크가 없습니다
                </div>
              )}
            </Card>
          </div>

          <div className="col-span-9">
            <Card className="p-6 bg-blue-50 border-blue-200">
              <div className="mb-2">
                <span className="text-muted-foreground">선택된 리스크:</span>
              </div>
              <h3 className="mb-1">{selectedRisk.title || selectedRisk.name}</h3>
              <div className="text-sm text-muted-foreground">
                {selectedRisk.sectorName || selectedRisk.sector} &gt; {selectedRisk.subsectorName || selectedRisk.subSector}
              </div>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Most Common Responses */}
          <div className="col-span-3">
            <Card className="p-6 sticky top-8">
              <h3 className="mb-4">최빈값 요약</h3>
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <div className="text-muted-foreground mb-1">질문 1 유형</div>
                  <div className="mb-1">{q1TypeStats.value}</div>
                  <div className="text-sm text-muted-foreground">
                    {q1TypeStats.count}/{q1TypeStats.total}명
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <div className="text-muted-foreground mb-1">질문 1 긴급도</div>
                  <div className="text-primary">{q1UrgencyStats.value}</div>
                  <div className="text-sm text-muted-foreground">
                    {q1UrgencyStats.count}/{q1UrgencyStats.total}명
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <div className="text-muted-foreground mb-1">질문 2 위치</div>
                  <div>{q2Stats.value}</div>
                  <div className="text-sm text-muted-foreground">
                    {q2Stats.count}/{q2Stats.total}명
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <div className="text-muted-foreground mb-1">질문 3 단기</div>
                  <div>{q3ShortStats.value}</div>
                  <div className="text-sm text-muted-foreground">
                    {q3ShortStats.count}/{q3ShortStats.total}명
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <div className="text-muted-foreground mb-1">질문 3 장기</div>
                  <div>{q3LongStats.value}</div>
                  <div className="text-sm text-muted-foreground">
                    {q3LongStats.count}/{q3LongStats.total}명
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Response Distribution & Details */}
          <div className="col-span-6 space-y-6">
            {/* Distribution Chart */}
            <Card className="p-6">
              <h3 className="mb-4">긴급도 응답 분포</h3>
              <div className="space-y-4">
                {urgencyDistribution.map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between mb-2">
                      <span>{item.label}</span>
                      <span className="text-muted-foreground">
                        {item.count}명 ({item.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`${item.color} h-3 rounded-full transition-all`}
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Individual Responses Table */}
            <Card className="p-6">
              <h3 className="mb-4">개인 응답 목록</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>응답자</TableHead>
                    <TableHead>근무부서</TableHead>
                    <TableHead>질문 1</TableHead>
                    <TableHead>질문 3 단기</TableHead>
                    <TableHead>제출일시</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskResponses.length > 0 ? (
                    riskResponses.map(resp => {
                      const type = getAnswerValue(resp, 'q1_type', 'question1Type');
                      const urgency = getAnswerValue(resp, 'q1_urgency', 'question1Urgency');
                      const shortTerm = getAnswerValue(resp, 'q3_short', 'question3Short');
                      const respondent = resp.respondent || resp.userId || '-';
                      const department = resp.department || resp.departmentId || '-';
                      const submittedAt = resp.submittedAt || resp.updatedAt || '-';

                      console.log('Displaying response:', {
                        id: resp.id,
                        type,
                        urgency,
                        shortTerm,
                        respondent,
                        department
                      });

                      return (
                        <TableRow key={resp.id}>
                          <TableCell>{respondent}</TableCell>
                          <TableCell>{department}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="mb-1">{type}</div>
                              <div className="text-primary font-medium">{urgency}</div>
                            </div>
                          </TableCell>
                          <TableCell>{shortTerm}</TableCell>
                          <TableCell className="text-sm">{submittedAt}</TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        아직 제출된 응답이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>

          {/* Final Confirmation Panel */}
          <div className="col-span-3">
            <Card className="p-6 sticky top-8">
              <h3 className="mb-4">주관부서 최종 확정</h3>
              <div className="space-y-4">
                <div className="p-3 bg-accent rounded">
                  <div className="text-muted-foreground mb-2">시스템 추천 대표값</div>
                  <div className="mb-1">{q1TypeStats.value}</div>
                  <div className="text-primary">{q1UrgencyStats.value}</div>
                  <div className="text-xs text-muted-foreground mt-2">
                    최빈값 기반 ({q1UrgencyStats.count}/{q1UrgencyStats.total}명)
                  </div>
                </div>

                <div>
                  <label className="block mb-2">최종 확정값 선택</label>
                  <select
                    value={finalUrgency}
                    onChange={(e) => setFinalUrgency(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded bg-input-background mb-2"
                  >
                    <option value="">긴급도 선택</option>
                    <option value="매우 시급함">매우 시급함</option>
                    <option value="시급함">시급함</option>
                    <option value="시급성 낮음">시급성 낮음</option>
                  </select>
                  <select
                    value={finalType}
                    onChange={(e) => setFinalType(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded bg-input-background"
                  >
                    <option value="">유형 선택</option>
                    <option value="우선적 추가조치 필요한 리스크 항목">우선적 추가조치 필요</option>
                    <option value="장기적 연구 및 모니터링이 필요한 리스크 항목">장기적 연구 및 모니터링 필요</option>
                    <option value="잠재적 영향이 존재하는 리스크 항목">잠재적 영향이 존재</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-2">주관부서 의견</label>
                  <textarea
                    rows={4}
                    placeholder="최종 확정값 선택 근거나 추가 의견을 입력하세요"
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded bg-input-background"
                  />
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleConfirm}
                >
                  확정
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleRequestRevision}
                >
                  수정요청
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
