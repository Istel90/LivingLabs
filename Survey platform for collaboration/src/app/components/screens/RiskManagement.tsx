import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Badge, statusLabels } from '../ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { mockDepartments } from '../../data/mockData';
import { Plus, Edit, Map, FileText, Trash2, Users, Type } from 'lucide-react';
import * as api from '../../lib/api';
import { sectors, getSubSectorsBySector } from '../../data/sectorMapping';

type PanelTab = 'basic' | 'context' | 'assignment';

export function RiskManagement() {
  const [selectedSector, setSelectedSector] = useState('전체');
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('basic');
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignedDepts, setAssignedDepts] = useState<string[]>([]);

  useEffect(() => {
    loadRisks();
  }, []);

  async function loadRisks() {
    try {
      setLoading(true);
      const data = await api.getRisks();

      console.log('Risks loaded from local storage:', data?.length);

      setRisks(data || []);
    } catch (error) {
      console.error('Failed to load risks:', error);
      setRisks([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRisk() {
    if (!selectedRisk) return;

    try {
      const riskToSave = {
        ...selectedRisk,
        assignedDepartmentIds: assignedDepts,
        updatedAt: new Date().toISOString(),
      };

      if (selectedRisk.id && risks.find(r => r.id === selectedRisk.id)) {
        await api.updateRisk(selectedRisk.id, riskToSave);
      } else {
        const newRisk = {
          ...riskToSave,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        await api.createRisk(newRisk);
      }
      await loadRisks();
      setShowPanel(false);
    } catch (error) {
      console.error('Failed to save risk:', error);
      alert('리스크 저장에 실패했습니다.');
    }
  }

  async function handleSaveDepartmentAssignment() {
    if (!selectedRisk) return;

    try {
      const updatedRisk = {
        ...selectedRisk,
        assignedDepartmentIds: assignedDepts,
        updatedAt: new Date().toISOString(),
      };

      await api.updateRisk(selectedRisk.id, updatedRisk);

      // 각 부서별로 assignment 생성
      for (const dept of assignedDepts) {
        await api.createAssignment({
          riskId: selectedRisk.id,
          departmentId: dept,
          department: dept,
          deadline: selectedRisk.dueDate || '2026-04-30',
        });
      }

      alert(`${assignedDepts.length}개 부서에 배정이 완료되었습니다.`);
      await loadRisks();
    } catch (error) {
      console.error('Failed to save assignment:', error);
      alert('부서 배정 저장에 실패했습니다.');
    }
  }

  async function handleDeleteRisk(id: string) {
    if (!confirm('이 리스크를 삭제하시겠습니까?')) return;

    try {
      await api.deleteRisk(id);
      await loadRisks();
      setShowPanel(false);
    } catch (error) {
      console.error('Failed to delete risk:', error);
      alert('리스크 삭제에 실패했습니다.');
    }
  }

  function handleAddNew() {
    const firstSector = sectors[0];
    const firstSubSectors = getSubSectorsBySector(firstSector.id);

    setSelectedRisk({
      id: crypto.randomUUID(),
      projectId: 'default',
      municipality: '인천광역시',
      title: '',
      description: '',
      sectorId: firstSector.id,
      sectorName: firstSector.name,
      subsectorId: firstSubSectors.length > 0 ? firstSubSectors[0].id : '',
      subsectorName: firstSubSectors.length > 0 ? firstSubSectors[0].name : '',
      detailTagId: '',
      detailTagName: '',
      respondentGuide: '',
      overview: {
        summary: '',
        expectedImpact: '',
        relatedClimateHazard: '',
      },
      contextInfo: {
        title: '',
        body: '',
        keyPoints: [],
        blocks: [],
        source: '',
      },
      mapInfo: {
        center: [37.4563, 126.7052],
        zoom: 11,
        baseLayer: 'osm',
        visibleLayers: [],
        markers: [],
      },
      assignedDepartmentIds: [],
      status: 'draft',
      dueDate: '2026-04-30',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setAssignedDepts([]);
    setActiveTab('basic');
    setShowPanel(true);
  }

  function handleEditRisk(risk: any) {
    setSelectedRisk(risk);
    setAssignedDepts(risk.assignedDepartmentIds || risk.assignedDepartmentsList || []);
    setActiveTab('basic');
    setShowPanel(true);
  }

  const toggleDepartment = (deptName: string) => {
    setAssignedDepts(prev =>
      prev.includes(deptName)
        ? prev.filter(d => d !== deptName)
        : [...prev, deptName]
    );
  };

  function handleSectorChange(sectorName: string) {
    const sector = sectors.find(s => s.name === sectorName);
    if (!sector || !selectedRisk) return;

    const subSectors = getSubSectorsBySector(sector.id);

    setSelectedRisk({
      ...selectedRisk,
      sectorName: sectorName,
      sectorId: sector.id,
      subsectorName: subSectors.length > 0 ? subSectors[0].name : '',
      subsectorId: subSectors.length > 0 ? subSectors[0].id : '',
    });
  }

  const availableSubSectors = selectedRisk?.sectorId
    ? getSubSectorsBySector(selectedRisk.sectorId)
    : [];

  const allSectorsForFilter = ['전체', ...sectors.map(s => s.name)];

  const filteredRisks = selectedSector === '전체'
    ? risks
    : risks.filter(r => r.sectorName === selectedSector);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-muted-foreground">데이터를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1>지역 리스크 관리</h1>
          <Button variant="primary" onClick={handleAddNew}>
            <Plus className="w-4 h-4 mr-2" />
            새 리스크 추가
          </Button>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Sector Filter */}
          <div className="col-span-2">
            <div className="bg-white border border-border rounded-lg p-4">
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
            </div>
          </div>

          {/* Risk List Table */}
          <div className={showPanel ? 'col-span-6' : 'col-span-10'}>
            <div className="bg-white border border-border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>리스크명</TableHead>
                    <TableHead>부문</TableHead>
                    <TableHead>세부부문</TableHead>
                    <TableHead>현황정보</TableHead>
                    <TableHead>지도 레이어</TableHead>
                    <TableHead>배정 부서</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRisks.map(risk => (
                    <TableRow
                      key={risk.id}
                      className={selectedRisk?.id === risk.id ? 'bg-accent/30' : ''}
                    >
                      <TableCell>{risk.title || risk.name}</TableCell>
                      <TableCell>{risk.sectorName || risk.sector}</TableCell>
                      <TableCell>{risk.subsectorName || risk.subSector}</TableCell>
                      <TableCell>{risk.contextInfo?.blocks?.length || risk.contextPages || 0}개</TableCell>
                      <TableCell>{risk.mapInfo?.visibleLayers?.length || risk.mapLayers || 0}개</TableCell>
                      <TableCell>{risk.assignedDepartmentIds?.length || risk.assignedDepartments || 0}개</TableCell>
                      <TableCell>
                        <Badge status={risk.status}>
                          {statusLabels[risk.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditRisk(risk)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteRisk(risk.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Edit Panel */}
          {showPanel && (
            <div className="col-span-4">
              <div className="bg-white border border-border rounded-lg sticky top-8 max-h-[calc(100vh-6rem)] overflow-y-auto">
                <div className="flex justify-between items-center p-6 pb-4 border-b border-border">
                  <h3>리스크 상세 편집</h3>
                  <button
                    onClick={() => setShowPanel(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                  <button
                    onClick={() => setActiveTab('basic')}
                    className={`flex-1 px-4 py-3 flex items-center justify-center gap-2 transition-colors ${
                      activeTab === 'basic'
                        ? 'border-b-2 border-primary text-primary bg-accent/20'
                        : 'text-muted-foreground hover:bg-gray-50'
                    }`}
                  >
                    <Type className="w-4 h-4" />
                    <span>기본정보</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('context')}
                    className={`flex-1 px-4 py-3 flex items-center justify-center gap-2 transition-colors ${
                      activeTab === 'context'
                        ? 'border-b-2 border-primary text-primary bg-accent/20'
                        : 'text-muted-foreground hover:bg-gray-50'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>현황정보</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('assignment')}
                    className={`flex-1 px-4 py-3 flex items-center justify-center gap-2 transition-colors ${
                      activeTab === 'assignment'
                        ? 'border-b-2 border-primary text-primary bg-accent/20'
                        : 'text-muted-foreground hover:bg-gray-50'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>부서배정</span>
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                  {activeTab === 'basic' && (
                    <div className="space-y-4">
                  <div>
                    <label className="block mb-2">지역 리스크명</label>
                    <input
                      type="text"
                      value={selectedRisk.title || selectedRisk.name || ''}
                      onChange={(e) => setSelectedRisk({ ...selectedRisk, title: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                    />
                  </div>

                  <div>
                    <label className="block mb-2">리스크 설명</label>
                    <textarea
                      value={selectedRisk.description || ''}
                      onChange={(e) => setSelectedRisk({ ...selectedRisk, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                    />
                  </div>

                  <div>
                    <label className="block mb-2">부문 선택</label>
                    <select
                      value={selectedRisk.sectorName || selectedRisk.sector || ''}
                      onChange={(e) => handleSectorChange(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                    >
                      {sectors.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block mb-2">세부부문 선택</label>
                    {availableSubSectors.length > 0 ? (
                      <select
                        value={selectedRisk.subsectorName || selectedRisk.subSector || ''}
                        onChange={(e) => {
                          const subSector = availableSubSectors.find(s => s.name === e.target.value);
                          setSelectedRisk({
                            ...selectedRisk,
                            subsectorName: e.target.value,
                            subsectorId: subSector?.id || '',
                          });
                        }}
                        className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      >
                        {availableSubSectors.map(sub => (
                          <option key={sub.id} value={sub.name}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full px-3 py-2 border border-input rounded bg-gray-100 text-muted-foreground">
                        세부부문 없음
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block mb-2">세세부태그 선택 (선택)</label>
                    <input
                      type="text"
                      value={selectedRisk.detailTagName || selectedRisk.subSubTag || ''}
                      onChange={(e) => setSelectedRisk({ ...selectedRisk, detailTagName: e.target.value })}
                      placeholder="예: 수인성 매개질환"
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                    />
                  </div>

                  <div>
                    <label className="block mb-2">응답자에게 보여줄 안내문</label>
                    <textarea
                      value={selectedRisk.respondentGuide || selectedRisk.guidance || ''}
                      onChange={(e) => setSelectedRisk({ ...selectedRisk, respondentGuide: e.target.value })}
                      placeholder="응답자가 설문 작성 시 참고할 안내문을 입력하세요"
                      rows={2}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setActiveTab('context')}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      현황정보 구성
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setActiveTab('context')}
                    >
                      <Map className="w-4 h-4 mr-2" />
                      지도 레이어 선택
                    </Button>
                  </div>

                      <Button variant="primary" className="w-full mt-6" onClick={handleSaveRisk}>
                        저장
                      </Button>
                    </div>
                  )}

                  {/* Context Tab */}
                  {activeTab === 'context' && (
                    <div className="space-y-4">
                      <div className="text-muted-foreground mb-4">
                        응답자에게 제공할 현황정보 페이지를 구성합니다.
                      </div>

                      <div className="p-4 border border-border rounded-lg bg-gray-50">
                        <div className="mb-3">현황정보 블록</div>
                        <div className="space-y-2">
                          <div className="p-3 bg-white border border-border rounded">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">제목: 건강 부문 현황</div>
                                <div className="text-sm text-muted-foreground">텍스트 블록</div>
                              </div>
                              <Button size="sm" variant="ghost">편집</Button>
                            </div>
                          </div>
                          <div className="p-3 bg-white border border-border rounded">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">그래프: 감염병 발생 추이</div>
                                <div className="text-sm text-muted-foreground">차트 블록</div>
                              </div>
                              <Button size="sm" variant="ghost">편집</Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <Button variant="outline" className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        블록 추가
                      </Button>

                      <div className="pt-4 text-sm text-muted-foreground">
                        * 현황정보는 리스크별로 응답자에게 제공되는 참고자료입니다.
                      </div>
                    </div>
                  )}

                  {/* Assignment Tab */}
                  {activeTab === 'assignment' && (
                    <div className="space-y-4">
                      <div className="text-muted-foreground mb-4">
                        이 리스크를 담당할 부서를 선택합니다.
                      </div>

                      <div>
                        <label className="block mb-3">부서 선택 (복수 선택 가능)</label>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto border border-border rounded-lg p-3">
                          {mockDepartments.map(dept => (
                            <label
                              key={dept.id}
                              className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
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
                      </div>

                      <div>
                        <label className="block mb-2">제출 마감일</label>
                        <input
                          type="date"
                          defaultValue="2026-04-30"
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        />
                      </div>

                      <div className="p-3 bg-accent rounded">
                        <div className="text-sm mb-2">선택된 부서: {assignedDepts.length}개</div>
                        {assignedDepts.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {assignedDepts.map(dept => (
                              <span
                                key={dept}
                                className="px-2 py-1 bg-primary text-white rounded text-sm"
                              >
                                {dept}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <Button
                        variant="primary"
                        className="w-full"
                        onClick={handleSaveDepartmentAssignment}
                        disabled={assignedDepts.length === 0}
                      >
                        부서 배정 저장
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
