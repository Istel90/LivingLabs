import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import { mockDepartments } from '../../data/mockData';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Edit,
  FileSpreadsheet,
  FileText,
  Layers,
  Map,
  Plus,
  Trash2,
  Type,
  Upload,
  Users,
} from 'lucide-react';
import * as api from '../../lib/api';
import { sectors, getSubSectorsBySector } from '../../data/sectorMapping';
import { getLocalGovernment } from '../../data/localGovernments';
import type { ContentBlock } from '../../types/risk';

type PanelTab = 'basic' | 'context' | 'assignment';
type RiskStatus = 'draft' | 'review_requested' | 'confirmed';
type BlockType = ContentBlock['type'];

interface RiskManagementProps {
  localGovId?: string | null;
}

const blockTypeOptions: Array<{ type: BlockType; label: string; icon: typeof Type }> = [
  { type: 'title', label: '제목', icon: Type },
  { type: 'text', label: '본문', icon: FileText },
  { type: 'table', label: '표', icon: FileSpreadsheet },
  { type: 'chart', label: '그래프', icon: Layers },
  { type: 'map', label: '지도', icon: Map },
  { type: 'note', label: '주석', icon: FileText },
  { type: 'source', label: '출처', icon: FileText },
];

const mapLayerOptions = ['폭염일수', '고령인구 분포', '감염병 발생 현황', '침수흔적도', '취약계층 분포', '무더위쉼터'];

const csvTemplate = [
  '리스크명,설명,부문,세부부문,세부태그,응답안내,배정부서,마감일,현황요약,예상영향,관련기후위험',
  '폭염으로 인한 온열질환 증가,고령층과 야외근로자의 온열질환 위험이 증가합니다.,건강,건강질환,온열질환,지역 내 취약계층과 사업 필요성을 고려해 응답해주세요.,건강증진과|기후대응과,2026-04-30,최근 폭염일수와 취약계층 분포를 검토합니다.,응급 이송 및 건강 피해 증가가 예상됩니다.,폭염',
].join('\n');

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()_\-./]/g, '');
}

function pick(row: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const entry = Object.entries(row).find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  return entry ? String(entry[1] ?? '').trim() : '';
}

function parseDelimitedText(text: string) {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const delimiter = cleaned.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    const next = cleaned[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  rows.push(row);

  const [headers = [], ...dataRows] = rows.filter((items) => items.some(Boolean));
  return dataRows.map((items) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = items[index] || '';
      return record;
    }, {}),
  );
}

function splitList(value: string) {
  return value
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapStatus(value: string): RiskStatus {
  if (['confirmed', '확정'].includes(value)) return 'confirmed';
  if (['review_requested', '검토요청', '검토'].includes(value)) return 'review_requested';
  return 'draft';
}

function badgeStatus(status: string): 'pending' | 'in-progress' | 'confirmed' {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'review_requested') return 'in-progress';
  return 'pending';
}

function statusLabel(status: string) {
  if (status === 'confirmed') return '확정';
  if (status === 'review_requested') return '검토요청';
  return '작성중';
}

export function RiskManagement({ localGovId }: RiskManagementProps) {
  const [selectedSector, setSelectedSector] = useState('전체');
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('basic');
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignedDepts, setAssignedDepts] = useState<string[]>([]);
  const [markerDraft, setMarkerDraft] = useState({ label: '', lat: '', lng: '' });
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localGov = localGovId ? getLocalGovernment(localGovId) : undefined;

  useEffect(() => {
    loadRisks();
  }, []);

  async function loadRisks() {
    try {
      setLoading(true);
      const data = await api.getRisks();
      setRisks(data || []);
    } catch (error) {
      console.error('Failed to load risks:', error);
      setRisks([]);
    } finally {
      setLoading(false);
    }
  }

  function makeDefaultRisk(overrides: Record<string, unknown> = {}) {
    const firstSector = sectors[0];
    const firstSubSectors = getSubSectorsBySector(firstSector.id);
    return {
      id: crypto.randomUUID(),
      projectId: 'default',
      municipality: localGov?.displayName || '인천광역시',
      title: '',
      description: '',
      sectorId: firstSector.id,
      sectorName: firstSector.name,
      subsectorId: firstSubSectors[0]?.id || '',
      subsectorName: firstSubSectors[0]?.name || '',
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
        center: localGov?.center || [37.4563, 126.7052],
        zoom: localGov?.zoom || 11,
        regionCode: localGov?.regionCode,
        baseLayer: 'osm',
        visibleLayers: [],
        markers: [],
      },
      assignedDepartmentIds: [],
      status: 'draft',
      dueDate: '2026-04-30',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function riskFromRow(row: Record<string, unknown>) {
    const sectorValue = pick(row, ['부문', 'sector', 'sectorName']);
    const sector = sectors.find((item) => item.name === sectorValue || item.id === sectorValue) || sectors[0];
    const subSectorValue = pick(row, ['세부부문', '하위부문', 'subsector', 'subsectorName', 'subSector']);
    const subSectors = getSubSectorsBySector(sector.id);
    const subSector = subSectors.find((item) => item.name === subSectorValue || item.id === subSectorValue);
    const title = pick(row, ['리스크명', '제목', 'title', 'name']);
    const description = pick(row, ['설명', '리스크설명', 'description']);
    const assignedDepartmentIds = splitList(pick(row, ['배정부서', '부서', 'assignedDepartments', 'assignedDepartmentIds']));
    const summary = pick(row, ['현황요약', '요약', 'summary']);
    const expectedImpact = pick(row, ['예상영향', '영향', 'expectedImpact']);
    const relatedClimateHazard = pick(row, ['관련기후위험', '기후위험', 'hazard', 'relatedClimateHazard']);
    const contextBody = pick(row, ['현황본문', '현황정보', 'context', 'contextBody']);
    const source = pick(row, ['출처', 'source']);

    const blocks: ContentBlock[] = [];
    if (summary || contextBody) {
      blocks.push({
        id: crypto.randomUUID(),
        type: 'title',
        content: `${sectorValue || sector.name} 부문 현황`,
      });
    }
    if (contextBody || summary) {
      blocks.push({
        id: crypto.randomUUID(),
        type: 'text',
        content: contextBody || summary,
      });
    }
    if (source) {
      blocks.push({
        id: crypto.randomUUID(),
        type: 'source',
        content: source,
      });
    }

    return makeDefaultRisk({
      id: pick(row, ['id', 'riskId']) || crypto.randomUUID(),
      title,
      description,
      sectorId: sector.id,
      sectorName: sectorValue || sector.name,
      subsectorId: subSector?.id || subSectors[0]?.id || '',
      subsectorName: subSectorValue || subSector?.name || subSectors[0]?.name || '',
      detailTagName: pick(row, ['세부태그', '상세태그', 'detailTag', 'detailTagName']),
      respondentGuide: pick(row, ['응답안내', '가이드', 'respondentGuide', 'guidance']),
      overview: {
        summary,
        expectedImpact,
        relatedClimateHazard,
      },
      contextInfo: {
        title: blocks.find((block) => block.type === 'title')?.content || '',
        body: contextBody || summary,
        keyPoints: [],
        blocks,
        source,
      },
      assignedDepartmentIds,
      status: mapStatus(pick(row, ['상태', 'status'])),
      dueDate: pick(row, ['마감일', 'dueDate', 'deadline']) || '2026-04-30',
    });
  }

  async function readRowsFromFile(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'xlsx' || extension === 'xls') {
      const XLSX: any = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) as Record<string, unknown>[];
    }

    return parseDelimitedText(await file.text());
  }

  async function handleRiskFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportMessage('리스크 목록을 읽는 중입니다...');
      const rows = await readRowsFromFile(file);
      const importedRisks = rows
        .map(riskFromRow)
        .filter((risk) => risk.title || risk.description);

      if (importedRisks.length === 0) {
        setImportMessage('가져올 수 있는 리스크 행이 없습니다. 리스크명 또는 설명 열을 확인해주세요.');
        return;
      }

      for (const risk of importedRisks) {
        const existing = risks.find((item) => item.id === risk.id);
        if (existing) {
          await api.updateRisk(risk.id, { ...existing, ...risk, id: existing.id });
        } else {
          await api.createRisk(risk);
        }
      }

      await loadRisks();
      setImportMessage(`${importedRisks.length}개 리스크를 가져왔습니다. 각 리스크를 선택해 현황정보와 부서배정을 이어서 정리하세요.`);
    } catch (error) {
      console.error('Failed to import risk file:', error);
      setImportMessage('파일을 읽지 못했습니다. CSV UTF-8 형식이거나 첫 번째 시트에 표 머리글이 있는 엑셀 파일인지 확인해주세요.');
    } finally {
      event.target.value = '';
    }
  }

  function downloadTemplate() {
    const blob = new Blob([`\uFEFF${csvTemplate}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'risk-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveRisk() {
    if (!selectedRisk) return;

    try {
      const riskToSave = {
        ...selectedRisk,
        assignedDepartmentIds: assignedDepts,
        updatedAt: new Date().toISOString(),
      };

      if (selectedRisk.id && risks.find((risk) => risk.id === selectedRisk.id)) {
        await api.updateRisk(selectedRisk.id, riskToSave);
      } else {
        await api.createRisk({
          ...riskToSave,
          id: selectedRisk.id || crypto.randomUUID(),
          createdAt: selectedRisk.createdAt || new Date().toISOString(),
        });
      }
      await loadRisks();
      setImportMessage('리스크 정보가 저장되었습니다.');
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

      for (const dept of assignedDepts) {
        await api.createAssignment({
          riskId: selectedRisk.id,
          departmentId: dept,
          department: dept,
          deadline: selectedRisk.dueDate || '2026-04-30',
        });
      }

      await loadRisks();
      setImportMessage(`${assignedDepts.length}개 부서에 배정되었습니다.`);
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
      setSelectedRisk(null);
    } catch (error) {
      console.error('Failed to delete risk:', error);
      alert('리스크 삭제에 실패했습니다.');
    }
  }

  function handleAddNew() {
    setSelectedRisk(makeDefaultRisk());
    setAssignedDepts([]);
    setMarkerDraft({ label: '', lat: '', lng: '' });
    setActiveTab('basic');
    setShowPanel(true);
  }

  function handleEditRisk(risk: any, tab: PanelTab = 'basic') {
    setSelectedRisk({
      ...makeDefaultRisk(),
      ...risk,
      overview: {
        summary: '',
        expectedImpact: '',
        relatedClimateHazard: '',
        ...(risk.overview || {}),
      },
      contextInfo: {
        title: '',
        body: '',
        keyPoints: [],
        blocks: [],
        source: '',
        ...(risk.contextInfo || {}),
      },
      mapInfo: {
        center: localGov?.center || [37.4563, 126.7052],
        zoom: localGov?.zoom || 11,
        regionCode: localGov?.regionCode,
        baseLayer: 'osm',
        visibleLayers: [],
        markers: [],
        ...(risk.mapInfo || {}),
      },
    });
    setAssignedDepts(risk.assignedDepartmentIds || risk.assignedDepartmentsList || []);
    setMarkerDraft({ label: '', lat: '', lng: '' });
    setActiveTab(tab);
    setShowPanel(true);
  }

  function handleSectorChange(sectorName: string) {
    const sector = sectors.find((item) => item.name === sectorName);
    if (!sector || !selectedRisk) return;

    const subSectors = getSubSectorsBySector(sector.id);

    setSelectedRisk({
      ...selectedRisk,
      sectorName,
      sectorId: sector.id,
      subsectorName: subSectors[0]?.name || '',
      subsectorId: subSectors[0]?.id || '',
    });
  }

  function toggleDepartment(deptName: string) {
    setAssignedDepts((previous) =>
      previous.includes(deptName)
        ? previous.filter((department) => department !== deptName)
        : [...previous, deptName],
    );
  }

  function updateContextBlocks(blocks: ContentBlock[]) {
    if (!selectedRisk) return;
    setSelectedRisk({
      ...selectedRisk,
      contextInfo: {
        ...(selectedRisk.contextInfo || {}),
        title: blocks.find((block) => block.type === 'title')?.content || selectedRisk.contextInfo?.title || '',
        body: blocks.find((block) => block.type === 'text')?.content || selectedRisk.contextInfo?.body || '',
        source: blocks.find((block) => block.type === 'source')?.content || selectedRisk.contextInfo?.source || '',
        blocks,
      },
    });
  }

  function addBlock(type: BlockType) {
    const label = blockTypeOptions.find((option) => option.type === type)?.label || '블록';
    const blocks = selectedRisk?.contextInfo?.blocks || [];
    updateContextBlocks([
      ...blocks,
      {
        id: crypto.randomUUID(),
        type,
        content: type === 'title' ? '새 현황정보 제목' : `${label} 내용을 입력하세요.`,
      },
    ]);
  }

  function updateBlock(id: string, content: string) {
    updateContextBlocks((selectedRisk?.contextInfo?.blocks || []).map((block: ContentBlock) =>
      block.id === id ? { ...block, content } : block,
    ));
  }

  function deleteBlock(id: string) {
    updateContextBlocks((selectedRisk?.contextInfo?.blocks || []).filter((block: ContentBlock) => block.id !== id));
  }

  function moveBlock(id: string, direction: 'up' | 'down') {
    const blocks = [...(selectedRisk?.contextInfo?.blocks || [])];
    const index = blocks.findIndex((block) => block.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= blocks.length) return;
    [blocks[index], blocks[targetIndex]] = [blocks[targetIndex], blocks[index]];
    updateContextBlocks(blocks);
  }

  function toggleLayer(layer: string) {
    if (!selectedRisk) return;
    const visibleLayers = selectedRisk.mapInfo?.visibleLayers || [];
    setSelectedRisk({
      ...selectedRisk,
      mapInfo: {
        ...(selectedRisk.mapInfo || {}),
        visibleLayers: visibleLayers.includes(layer)
          ? visibleLayers.filter((item: string) => item !== layer)
          : [...visibleLayers, layer],
      },
    });
  }

  function addMarker() {
    if (!selectedRisk) return;
    const lat = Number(markerDraft.lat);
    const lng = Number(markerDraft.lng);
    if (!markerDraft.label || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert('마커명, 위도, 경도를 입력해주세요.');
      return;
    }

    setSelectedRisk({
      ...selectedRisk,
      mapInfo: {
        ...(selectedRisk.mapInfo || {}),
        markers: [
          ...(selectedRisk.mapInfo?.markers || []),
          { id: crypto.randomUUID(), label: markerDraft.label, lat, lng },
        ],
      },
    });
    setMarkerDraft({ label: '', lat: '', lng: '' });
  }

  function deleteMarker(id: string) {
    if (!selectedRisk) return;
    setSelectedRisk({
      ...selectedRisk,
      mapInfo: {
        ...(selectedRisk.mapInfo || {}),
        markers: (selectedRisk.mapInfo?.markers || []).filter((marker: any) => marker.id !== id),
      },
    });
  }

  const availableSubSectors = selectedRisk?.sectorId
    ? getSubSectorsBySector(selectedRisk.sectorId)
    : [];

  const allSectorsForFilter = ['전체', ...sectors.map((sector) => sector.name)];

  const filteredRisks = selectedSector === '전체'
    ? risks
    : risks.filter((risk) => (risk.sectorName || risk.sector) === selectedSector);

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
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-emerald-700 mb-2">RISK SURVEY BUILDER</div>
            <h1 className="mb-2">지역 리스크 관리</h1>
            <p className="text-muted-foreground">
              리스크 목록 등록부터 현황정보 구성, 부서 배정까지 한 화면에서 설문 단위를 완성합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={handleRiskFileImport}
            />
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              양식 CSV
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              엑셀/CSV 가져오기
            </Button>
            <Button variant="primary" onClick={handleAddNew}>
              <Plus className="w-4 h-4 mr-2" />
              새 리스크 추가
            </Button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold mb-1">대량 입력 방식</div>
              <p className="text-sm text-muted-foreground">
                엑셀 첫 번째 시트 또는 CSV의 머리글을 기준으로 가져옵니다. 기본 열은
                <span className="font-semibold text-slate-700"> 리스크명, 설명, 부문, 세부부문, 배정부서, 마감일</span>이며,
                배정부서는 <span className="font-semibold text-slate-700">건강증진과|기후대응과</span>처럼 구분합니다.
              </p>
              {importMessage && (
                <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {importMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-2">
            <div className="bg-white border border-border rounded-lg p-4">
              <h3 className="mb-4">부문 필터</h3>
              <div className="space-y-2">
                {allSectorsForFilter.map((sector) => (
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

          <div className={showPanel ? 'col-span-6' : 'col-span-10'}>
            <div className="bg-white border border-border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>리스크명</TableHead>
                    <TableHead>부문</TableHead>
                    <TableHead>세부부문</TableHead>
                    <TableHead>현황정보</TableHead>
                    <TableHead>지도정보</TableHead>
                    <TableHead>배정부서</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRisks.map((risk) => (
                    <TableRow
                      key={risk.id}
                      className={selectedRisk?.id === risk.id ? 'bg-accent/30' : ''}
                    >
                      <TableCell>{risk.title || risk.name || '제목 없음'}</TableCell>
                      <TableCell>{risk.sectorName || risk.sector}</TableCell>
                      <TableCell>{risk.subsectorName || risk.subSector}</TableCell>
                      <TableCell>{risk.contextInfo?.blocks?.length || risk.contextPages || 0}개</TableCell>
                      <TableCell>{risk.mapInfo?.visibleLayers?.length || risk.mapLayers || 0}개</TableCell>
                      <TableCell>{risk.assignedDepartmentIds?.length || risk.assignedDepartments || 0}개</TableCell>
                      <TableCell>
                        <Badge status={badgeStatus(risk.status)}>
                          {statusLabel(risk.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEditRisk(risk, 'basic')} title="기본정보 편집">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleEditRisk(risk, 'context')} title="현황정보 구성">
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteRisk(risk.id)} title="삭제">
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

          {showPanel && selectedRisk && (
            <div className="col-span-4">
              <div className="bg-white border border-border rounded-lg sticky top-8 max-h-[calc(100vh-6rem)] overflow-y-auto">
                <div className="flex justify-between items-center p-6 pb-4 border-b border-border">
                  <div>
                    <h3>리스크 상세 구성</h3>
                    <div className="text-sm text-muted-foreground mt-1">
                      {selectedRisk.title || '새 리스크'}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPanel(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    닫기
                  </button>
                </div>

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

                <div className="p-6">
                  {activeTab === 'basic' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block mb-2">지역 리스크명</label>
                        <input
                          type="text"
                          value={selectedRisk.title || selectedRisk.name || ''}
                          onChange={(event) => setSelectedRisk({ ...selectedRisk, title: event.target.value })}
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        />
                      </div>

                      <div>
                        <label className="block mb-2">리스크 설명</label>
                        <textarea
                          value={selectedRisk.description || ''}
                          onChange={(event) => setSelectedRisk({ ...selectedRisk, description: event.target.value })}
                          rows={3}
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        />
                      </div>

                      <div>
                        <label className="block mb-2">부문 선택</label>
                        <select
                          value={selectedRisk.sectorName || selectedRisk.sector || ''}
                          onChange={(event) => handleSectorChange(event.target.value)}
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        >
                          {sectors.map((sector) => (
                            <option key={sector.id} value={sector.name}>{sector.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block mb-2">세부부문 선택</label>
                        {availableSubSectors.length > 0 ? (
                          <select
                            value={selectedRisk.subsectorName || selectedRisk.subSector || ''}
                            onChange={(event) => {
                              const subSector = availableSubSectors.find((item) => item.name === event.target.value);
                              setSelectedRisk({
                                ...selectedRisk,
                                subsectorName: event.target.value,
                                subsectorId: subSector?.id || '',
                              });
                            }}
                            className="w-full px-3 py-2 border border-input rounded bg-input-background"
                          >
                            {availableSubSectors.map((subSector) => (
                              <option key={subSector.id} value={subSector.name}>
                                {subSector.name}
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
                        <label className="block mb-2">세부태그 선택</label>
                        <input
                          type="text"
                          value={selectedRisk.detailTagName || selectedRisk.subSubTag || ''}
                          onChange={(event) => setSelectedRisk({ ...selectedRisk, detailTagName: event.target.value })}
                          placeholder="예: 온열질환"
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        />
                      </div>

                      <div>
                        <label className="block mb-2">응답자에게 보여줄 안내문</label>
                        <textarea
                          value={selectedRisk.respondentGuide || selectedRisk.guidance || ''}
                          onChange={(event) => setSelectedRisk({ ...selectedRisk, respondentGuide: event.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        />
                      </div>

                      <div>
                        <label className="block mb-2">마감일</label>
                        <input
                          type="date"
                          value={selectedRisk.dueDate || '2026-04-30'}
                          onChange={(event) => setSelectedRisk({ ...selectedRisk, dueDate: event.target.value })}
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setActiveTab('context')}>
                          <FileText className="w-4 h-4 mr-2" />
                          현황정보 구성
                        </Button>
                        <Button variant="outline" className="flex-1" onClick={() => setActiveTab('assignment')}>
                          <Users className="w-4 h-4 mr-2" />
                          부서 배정
                        </Button>
                      </div>

                      <Button variant="primary" className="w-full mt-6" onClick={handleSaveRisk}>
                        저장
                      </Button>
                    </div>
                  )}

                  {activeTab === 'context' && (
                    <div className="space-y-5">
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                        리스크별 설문 전에 응답자가 확인할 현황 설명, 표, 그래프, 지도정보를 구성합니다.
                      </div>

                      <div>
                        <label className="block mb-2">현황 요약</label>
                        <textarea
                          value={selectedRisk.overview?.summary || ''}
                          onChange={(event) => setSelectedRisk({
                            ...selectedRisk,
                            overview: { ...(selectedRisk.overview || {}), summary: event.target.value },
                          })}
                          rows={3}
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block mb-2">예상 영향</label>
                          <input
                            value={selectedRisk.overview?.expectedImpact || ''}
                            onChange={(event) => setSelectedRisk({
                              ...selectedRisk,
                              overview: { ...(selectedRisk.overview || {}), expectedImpact: event.target.value },
                            })}
                            className="w-full px-3 py-2 border border-input rounded bg-input-background"
                          />
                        </div>
                        <div>
                          <label className="block mb-2">관련 기후위험</label>
                          <input
                            value={selectedRisk.overview?.relatedClimateHazard || ''}
                            onChange={(event) => setSelectedRisk({
                              ...selectedRisk,
                              overview: { ...(selectedRisk.overview || {}), relatedClimateHazard: event.target.value },
                            })}
                            className="w-full px-3 py-2 border border-input rounded bg-input-background"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label>현황정보 블록</label>
                          <div className="flex flex-wrap gap-1">
                            {blockTypeOptions.map(({ type, label, icon: Icon }) => (
                              <Button key={type} size="sm" variant="outline" onClick={() => addBlock(type)}>
                                <Icon className="w-3 h-3 mr-1" />
                                {label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          {(selectedRisk.contextInfo?.blocks || []).length === 0 && (
                            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                              아직 구성된 현황정보 블록이 없습니다.
                            </div>
                          )}
                          {(selectedRisk.contextInfo?.blocks || []).map((block: ContentBlock, index: number) => (
                            <div key={block.id} className="rounded-xl border border-border p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold">
                                  {index + 1}. {blockTypeOptions.find((option) => option.type === block.type)?.label || block.type}
                                </span>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => moveBlock(block.id, 'up')}>
                                    <ArrowUp className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => moveBlock(block.id, 'down')}>
                                    <ArrowDown className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => deleteBlock(block.id)}>
                                    <Trash2 className="w-3 h-3 text-red-600" />
                                  </Button>
                                </div>
                              </div>
                              <textarea
                                value={block.content || ''}
                                onChange={(event) => updateBlock(block.id, event.target.value)}
                                rows={block.type === 'text' || block.type === 'table' ? 4 : 2}
                                className="w-full px-3 py-2 border border-input rounded bg-input-background text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Map className="w-4 h-4 text-primary" />
                          <h4>응답자에게 배포할 지도정보</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          {mapLayerOptions.map((layer) => (
                            <label key={layer} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={(selectedRisk.mapInfo?.visibleLayers || []).includes(layer)}
                                onChange={() => toggleLayer(layer)}
                              />
                              <span>{layer}</span>
                            </label>
                          ))}
                        </div>

                        <div className="space-y-2">
                          <input
                            value={markerDraft.label}
                            onChange={(event) => setMarkerDraft({ ...markerDraft, label: event.target.value })}
                            placeholder="마커명"
                            className="w-full px-3 py-2 border border-input rounded bg-input-background"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={markerDraft.lat}
                              onChange={(event) => setMarkerDraft({ ...markerDraft, lat: event.target.value })}
                              placeholder="위도"
                              className="px-3 py-2 border border-input rounded bg-input-background"
                            />
                            <input
                              value={markerDraft.lng}
                              onChange={(event) => setMarkerDraft({ ...markerDraft, lng: event.target.value })}
                              placeholder="경도"
                              className="px-3 py-2 border border-input rounded bg-input-background"
                            />
                          </div>
                          <Button variant="outline" size="sm" className="w-full" onClick={addMarker}>
                            지도 마커 추가
                          </Button>
                        </div>

                        {(selectedRisk.mapInfo?.markers || []).length > 0 && (
                          <div className="mt-3 space-y-1">
                            {(selectedRisk.mapInfo?.markers || []).map((marker: any) => (
                              <div key={marker.id} className="flex items-center justify-between rounded bg-accent px-2 py-1 text-xs">
                                <span>{marker.label} ({marker.lat}, {marker.lng})</span>
                                <button onClick={() => deleteMarker(marker.id)}>삭제</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Button variant="primary" className="w-full" onClick={handleSaveRisk}>
                        현황정보 저장
                      </Button>
                    </div>
                  )}

                  {activeTab === 'assignment' && (
                    <div className="space-y-4">
                      <div className="text-muted-foreground mb-4">
                        이 리스크 설문을 응답할 부서를 선택합니다.
                      </div>

                      <div>
                        <label className="block mb-3">부서 선택</label>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto border border-border rounded-lg p-3">
                          {mockDepartments.map((dept) => (
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

                      <div className="p-3 bg-accent rounded">
                        <div className="text-sm mb-2">선택된 부서 {assignedDepts.length}개</div>
                        {assignedDepts.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {assignedDepts.map((dept) => (
                              <span key={dept} className="px-2 py-1 bg-primary text-white rounded text-sm">
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
