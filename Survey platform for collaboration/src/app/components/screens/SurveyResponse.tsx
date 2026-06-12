import { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
// Survey data is loaded through the local data API.
import { ChevronLeft, ChevronRight, Save, Send, Layers, ArrowLeft, BarChart3, MapPin, Table as TableIcon } from 'lucide-react';
import * as api from '../../lib/api';
import { ClimateMap } from '../Map/ClimateMap';
import { getLocalGovernment } from '../../data/localGovernments';
import type { ContentBlock } from '../../types/risk';

type TabType = 'overview' | 'context' | 'survey';

interface SurveyResponseProps {
  onBack?: () => void;
  localGovId?: string;
  riskId?: string | null;
  userDepartment?: string;
}

export function SurveyResponse({ onBack, localGovId, riskId, userDepartment }: SurveyResponseProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showLayerPanel, setShowLayerPanel] = useState(true);
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [q1Selected, setQ1Selected] = useState<string | null>(null);
  const [q2Selected, setQ2Selected] = useState<string[]>([]);
  const [q3Short, setQ3Short] = useState<string | null>(null);
  const [q3Long, setQ3Long] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadRisk() {
      try {
        setLoading(true);

        // 모든 리스크를 불러옴
        const allRisks = await api.getRisks();

        // riskId가 제공된 경우 해당 리스크 찾기
        if (riskId) {
          console.log('Loading risk with ID:', riskId);
          const risk = (allRisks || []).find((r: any) => r.id === riskId);

          if (risk) {
            console.log('Found risk:', risk);
            setSelectedRisk(risk);
          } else {
            console.error('Risk not found in local storage:', riskId);
            setSelectedRisk(null);
          }
        } else {
          // riskId가 없으면 사용자 부서에 배정된 첫 번째 리스크 사용
          console.log('No risk ID provided, loading first assigned risk for department:', userDepartment);

          const assignedRisks = (allRisks || []).filter((r: any) => {
            const deptList = r.assignedDepartmentIds || r.assignedDepartmentsList || [];
            return Array.isArray(deptList) && deptList.includes(userDepartment);
          });

          if (assignedRisks.length > 0) {
            console.log('Found assigned risks:', assignedRisks.length);
            setSelectedRisk(assignedRisks[0]);
          } else {
            console.warn('No assigned risks found for department:', userDepartment);
            setSelectedRisk(null);
          }
        }
      } catch (error) {
        console.error('Failed to load risk:', error);
        setSelectedRisk(null);
      } finally {
        setLoading(false);
      }
    }

    loadRisk();
  }, [riskId, userDepartment]);

  const toggleQ2 = (value: string) => {
    setQ2Selected(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  async function handleSaveResponse(isDraft: boolean) {
    if (!q1Selected || !q3Short || !q3Long) {
      alert('모든 필수 질문에 응답해주세요.');
      return;
    }

    try {
      setSaving(true);

      const [q1Type, q1Urgency] = q1Selected.split('-');

      await api.createResponse({
        riskId: selectedRisk.id,
        userId: 'current-user',
        department: userDepartment || '건강증진과',
        respondent: '사용자',
        question1Type: q1Type,
        question1Urgency: q1Urgency,
        question2Answers: q2Selected,
        question3Short: q3Short,
        question3Long: q3Long,
        isDraft,
      });

      alert(isDraft ? '임시저장되었습니다.' : '제출이 완료되었습니다.');

      if (!isDraft) {
        setQ1Selected(null);
        setQ2Selected([]);
        setQ3Short(null);
        setQ3Long(null);
      }
    } catch (error) {
      console.error('Failed to save response:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-muted-foreground">리스크 정보를 불러오는 중...</div>
      </div>
    );
  }

  if (!selectedRisk) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-xl mb-2">배정된 리스크가 없습니다</div>
          <div className="text-muted-foreground mb-4">
            {userDepartment ? `${userDepartment}에 배정된 리스크가 없습니다.` : '리스크를 찾을 수 없습니다.'}
          </div>
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              리스크 목록으로
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Back Button */}
      {onBack && (
        <button
          onClick={onBack}
          className="fixed top-4 left-4 z-20 px-4 py-2 bg-white rounded-lg border border-border shadow-sm hover:shadow flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>리스크 목록으로</span>
        </button>
      )}

      {/* Map Area */}
      <div className="flex-1 relative" style={{ height: '100vh' }}>
        <ClimateMap
          center={
            selectedRisk.mapInfo?.center ||
            (localGovId ? getLocalGovernment(localGovId)?.center : undefined) ||
            [37.4563, 126.7052]
          }
          zoom={
            selectedRisk.mapInfo?.zoom ||
            (localGovId ? getLocalGovernment(localGovId)?.zoom : undefined) ||
            11
          }
          regionName={
            localGovId ? getLocalGovernment(localGovId)?.displayName : '인천광역시'
          }
          markers={selectedRisk.mapInfo?.markers}
          layers={selectedRisk.mapInfo?.visibleLayers}
        />

        {/* Layer Toggle Panel */}
        {showLayerPanel && (
          <Card className="absolute top-4 right-4 p-4 w-64">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                <span>지도 레이어</span>
              </div>
              <button
                onClick={() => setShowLayerPanel(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {(selectedRisk.mapInfo?.visibleLayers || ['폭염일수', '고령인구 분포', '감염병 발생 현황', '침수흔적도']).map(layer => (
                <label key={layer} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" defaultChecked />
                  <span>{layer}</span>
                </label>
              ))}
            </div>
          </Card>
        )}

        {!showLayerPanel && (
          <button
            onClick={() => setShowLayerPanel(true)}
            className="absolute top-4 right-4 p-2 bg-white rounded-lg border border-border shadow-sm hover:shadow"
          >
            <Layers className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Side Panel */}
      <div className="w-[480px] bg-white border-l border-border flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-border">
          {[
            { key: 'overview' as TabType, label: '리스크 개요' },
            { key: 'context' as TabType, label: '현황정보' },
            { key: 'survey' as TabType, label: '설문응답' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-primary text-primary bg-accent/20'
                  : 'text-muted-foreground hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div>
                <label className="text-muted-foreground">리스크명</label>
                <h3 className="mt-1">{selectedRisk.title || selectedRisk.name}</h3>
              </div>
              <div>
                <label className="text-muted-foreground">분류</label>
                <div className="mt-1">
                  {selectedRisk.sectorName || selectedRisk.sector} &gt; {selectedRisk.subsectorName || selectedRisk.subSector}
                  {(selectedRisk.detailTagName || selectedRisk.subSubTag) && ` > ${selectedRisk.detailTagName || selectedRisk.subSubTag}`}
                </div>
              </div>
              <div>
                <label className="text-muted-foreground">설명</label>
                <p className="mt-1">{selectedRisk.description}</p>
              </div>
              {(selectedRisk.respondentGuide || selectedRisk.guidance) && (
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <label className="text-muted-foreground">응답 안내</label>
                  <p className="mt-2">{selectedRisk.respondentGuide || selectedRisk.guidance}</p>
                </Card>
              )}
              {selectedRisk.overview && (
                <>
                  {selectedRisk.overview.summary && (
                    <div>
                      <label className="text-muted-foreground">리스크 요약</label>
                      <p className="mt-1">{selectedRisk.overview.summary}</p>
                    </div>
                  )}
                  {selectedRisk.overview.expectedImpact && (
                    <div>
                      <label className="text-muted-foreground">예상 영향</label>
                      <p className="mt-1">{selectedRisk.overview.expectedImpact}</p>
                    </div>
                  )}
                  {selectedRisk.overview.relatedClimateHazard && (
                    <div>
                      <label className="text-muted-foreground">관련 기후위험</label>
                      <p className="mt-1">{selectedRisk.overview.relatedClimateHazard}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'context' && (
            <div className="space-y-6">
              {selectedRisk.contextInfo && selectedRisk.contextInfo.blocks && selectedRisk.contextInfo.blocks.length > 0 ? (
                <>
                  {selectedRisk.contextInfo.blocks.map((block: ContentBlock) => (
                    <div key={block.id}>
                      {block.type === 'title' && (
                        <h2>{block.content}</h2>
                      )}
                      {block.type === 'text' && (
                        <p>{block.content}</p>
                      )}
                      {block.type === 'table' && (
                        <div className="bg-gray-100 rounded-lg p-4">
                          <TableIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <div className="text-muted-foreground text-center">{block.content}</div>
                        </div>
                      )}
                      {block.type === 'chart' && (
                        <div className="bg-gray-100 rounded-lg p-8 text-center">
                          <BarChart3 className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                          <div className="text-muted-foreground">{block.content}</div>
                        </div>
                      )}
                      {block.type === 'map' && (
                        <div className="bg-gray-100 rounded-lg p-8 text-center">
                          <MapPin className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                          <div className="text-muted-foreground">{block.content}</div>
                        </div>
                      )}
                      {block.type === 'note' && (
                        <div className="text-sm text-muted-foreground border-l-4 border-blue-400 pl-3 py-2 bg-blue-50">
                          {block.content}
                        </div>
                      )}
                      {block.type === 'source' && (
                        <div className="text-sm text-muted-foreground border-t border-border pt-2">
                          출처: {block.content}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="mb-2">현황정보가 아직 구성되지 않았습니다.</p>
                  <p className="text-sm">관리자가 현황정보를 추가하면 여기에 표시됩니다.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'survey' && (
            <div className="space-y-6">
              {/* Question 1 */}
              <div>
                <h4 className="mb-3">질문 1. 리스크 유형 및 시급성</h4>
                <p className="text-muted-foreground mb-4">
                  시급성을 고려하여 위의 리스크가 해당하는 리스크 유형을 한 개만 고르고,
                  해당 리스크의 시급성을 선택해 주십시오.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border border-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="border border-border p-2 text-left">리스크 유형</th>
                        <th className="border border-border p-2">시급성 낮음</th>
                        <th className="border border-border p-2">시급함</th>
                        <th className="border border-border p-2">매우 시급함</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        '우선적 추가조치 필요한 리스크 항목',
                        '장기적 연구 및 모니터링 필요한 리스크 항목',
                        '잠재적 영향이 존재하는 리스크',
                      ].map(type =>
                        ['낮음', '시급', '매우시급'].map(urgency => {
                          const value = `${type}-${urgency}`;
                          return (
                            <tr key={type}>
                              <td className="border border-border p-2">{type}</td>
                              {['낮음', '시급', '매우시급'].map(u => (
                                <td key={u} className="border border-border p-2 text-center">
                                  <input
                                    type="radio"
                                    name="q1"
                                    value={`${type}-${u}`}
                                    checked={q1Selected === `${type}-${u}`}
                                    onChange={(e) => setQ1Selected(e.target.value)}
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })[0]
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Question 2 */}
              <div>
                <h4 className="mb-3">질문 2. 발생 가능 지역 및 공간</h4>
                <p className="text-muted-foreground mb-4">
                  리스크가 발생할 가능성이 큰 지역 공간에 대한 질문입니다. (복수 선택 가능)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border border-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="border border-border p-2 text-left">토지이용 유형</th>
                        <th className="border border-border p-2">지자체 전역</th>
                        <th className="border border-border p-2">특정 권역</th>
                        <th className="border border-border p-2">특정 시군구</th>
                        <th className="border border-border p-2">기타</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['시가화·건조지역', '농업지역', '산림, 초지 및 습지', '나지', '수역 및 인근지역', '복합지역'].map(type => (
                        <tr key={type}>
                          <td className="border border-border p-2">{type}</td>
                          {['전역', '권역', '시군구', '기타'].map(scope => (
                            <td key={scope} className="border border-border p-2 text-center">
                              <input
                                type="checkbox"
                                checked={q2Selected.includes(`${type}-${scope}`)}
                                onChange={() => toggleQ2(`${type}-${scope}`)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Question 3 */}
              <div>
                <h4 className="mb-3">질문 3. 시간범위별 영향 변화</h4>
                <p className="text-muted-foreground mb-4">
                  향후 기후변화가 진행될 경우 각 시간범위별로 미치는 영향에 어느 정도 변화가 있을 것으로 예상되는지 표시해 주십시오.
                </p>
                <table className="w-full border border-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="border border-border p-2 text-left">시간 범위</th>
                      <th className="border border-border p-2">감소</th>
                      <th className="border border-border p-2">현재와 비슷</th>
                      <th className="border border-border p-2">증가</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-border p-2">단기간 (5년 이내)</td>
                      {['감소', '비슷', '증가'].map(opt => (
                        <td key={opt} className="border border-border p-2 text-center">
                          <input
                            type="radio"
                            name="q3-short"
                            value={opt}
                            checked={q3Short === opt}
                            onChange={(e) => setQ3Short(e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-border p-2">장기간 (5년 이후)</td>
                      {['감소', '비슷', '증가'].map(opt => (
                        <td key={opt} className="border border-border p-2 text-center">
                          <input
                            type="radio"
                            name="q3-long"
                            value={opt}
                            checked={q3Long === opt}
                            onChange={(e) => setQ3Long(e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-border p-4 bg-gray-50">
          <div className="flex gap-2 mb-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleSaveResponse(true)}
              disabled={saving}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? '저장중...' : '임시저장'}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => handleSaveResponse(false)}
              disabled={saving}
            >
              <Send className="w-4 h-4 mr-2" />
              {saving ? '제출중...' : '제출하기'}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1">
              <ChevronLeft className="w-4 h-4 mr-1" />
              이전 리스크
            </Button>
            <Button variant="ghost" className="flex-1">
              다음 리스크
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
