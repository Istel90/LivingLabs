import { useState, useEffect, type ChangeEvent } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Type, FileText, Table as TableIcon, BarChart3, MapPin, FileBox, Plus } from 'lucide-react';
import * as api from '../../lib/api';
import { sectors } from '../../data/sectorMapping';
import type { ContentBlock } from '../../types/risk';
import { getLocalGovernment } from '../../data/localGovernments';
import { ClimateMap } from '../Map/ClimateMap';

type BlockType = 'title' | 'text' | 'table' | 'chart' | 'map' | 'note' | 'source';
type EditorTab = 'context' | 'map' | 'respondent';

interface UploadedRasterLayer {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
}

const blockTypes = [
  { type: 'title' as BlockType, label: '제목', icon: Type },
  { type: 'text' as BlockType, label: '본문', icon: FileText },
  { type: 'table' as BlockType, label: '표', icon: TableIcon },
  { type: 'chart' as BlockType, label: '그래프', icon: BarChart3 },
  { type: 'map' as BlockType, label: '지도 이미지', icon: MapPin },
  { type: 'note' as BlockType, label: '주석', icon: FileBox },
  { type: 'source' as BlockType, label: '출처', icon: FileText },
];

const mapLayerOptions = ['폭염일수', '고령인구 분포', '감염병 발생 현황', '침수흔적도', '취약계층 분포', '무더위쉼터'];
const editorTabs: Array<{ id: EditorTab; label: string; description: string }> = [
  { id: 'context', label: '현황정보 구성하기', description: '응답 전에 보여줄 설명 블록을 작성합니다.' },
  { id: 'map', label: '현황지도 구성하기', description: '지도 레이어, TIF 자료, 마커를 구성합니다.' },
  { id: 'respondent', label: '응답자 화면 미리보기', description: '응답자가 보게 될 화면 흐름을 확인합니다.' },
];

interface ContextEditorProps {
  localGovId?: string;
  localGovName?: string;
}

export function ContextEditor({ localGovId, localGovName = '인천광역시' }: ContextEditorProps) {
  const [selectedSector, setSelectedSector] = useState('전체');
  const [risks, setRisks] = useState<any[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeConfigTab, setActiveConfigTab] = useState<EditorTab>('context');

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<ContentBlock | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<string[]>([]);
  const [markers, setMarkers] = useState<any[]>([]);
  const [markerDraft, setMarkerDraft] = useState({ label: '', lat: '', lng: '' });
  const [uploadedRasterLayers, setUploadedRasterLayers] = useState<UploadedRasterLayer[]>([]);
  const localGov = localGovId ? getLocalGovernment(localGovId) : undefined;

  useEffect(() => {
    loadRisks();
  }, []);

  useEffect(() => {
    if (selectedRisk) {
      // 선택된 리스크의 contextInfo 로드
      if (selectedRisk.contextInfo && selectedRisk.contextInfo.blocks) {
        setBlocks(selectedRisk.contextInfo.blocks);
      } else {
        // 기본 블록 설정
        setBlocks([
          { id: crypto.randomUUID(), type: 'title', content: `${selectedRisk.sector} 부문 현황` },
          { id: crypto.randomUUID(), type: 'text', content: `${localGovName}의 ${selectedRisk.sector} 부문 관련 현황은 아래와 같습니다.` },
        ]);
      }
      setVisibleLayers(selectedRisk.mapInfo?.visibleLayers || []);
      setMarkers(selectedRisk.mapInfo?.markers || []);
      setUploadedRasterLayers(selectedRisk.mapInfo?.rasterLayers || []);
    }
  }, [selectedRisk?.id]);

  async function loadRisks() {
    try {
      setLoading(true);
      const data = await api.getRisks();
      setRisks(data || []);
      if (data && data.length > 0) {
        setSelectedRisk(data[0]);
      }
    } catch (error) {
      console.error('Failed to load risks:', error);
      setRisks([]);
    } finally {
      setLoading(false);
    }
  }

  const allSectorsForFilter = ['전체', ...sectors.map(s => s.name)];

  const filteredRisks = selectedSector === '전체'
    ? risks
    : risks.filter(r => (r.sectorName || r.sector) === selectedSector);

  useEffect(() => {
    if (filteredRisks.length === 0) {
      setSelectedRisk(null);
      return;
    }

    if (!selectedRisk || !filteredRisks.some((risk) => risk.id === selectedRisk.id)) {
      setSelectedRisk(filteredRisks[0]);
    }
  }, [selectedSector, risks.length]);

  const selectedRiskPath = selectedRisk
    ? [
        selectedRisk.sectorName || selectedRisk.sector,
        selectedRisk.subsectorName || selectedRisk.subSector,
        selectedRisk.detailTagName || selectedRisk.subSubTag,
      ].filter(Boolean).join(' > ')
    : '';
  const mapCenter = localGov?.center || selectedRisk?.mapInfo?.center || [37.4563, 126.7052] as [number, number];
  const mapZoom = localGov?.zoom || selectedRisk?.mapInfo?.zoom || 11;
  const mapRegionName = localGov?.displayName || selectedRisk?.municipality || localGovName;

  function addBlock(type: BlockType) {
    const newBlock: ContentBlock = {
      id: crypto.randomUUID(),
      type,
      content: type === 'title' ? '새 제목' : type === 'text' ? '새 본문 내용을 입력하세요' : `새 ${blockTypes.find(b => b.type === type)?.label}`,
    };
    setBlocks([...blocks, newBlock]);
    setSelectedBlock(newBlock);
  }

  function updateBlock(id: string, content: string) {
    setBlocks(blocks.map(b => b.id === id ? { ...b, content } : b));
    if (selectedBlock?.id === id) {
      setSelectedBlock({ ...selectedBlock, content });
    }
  }

  function deleteBlock(id: string) {
    setBlocks(blocks.filter(b => b.id !== id));
    setSelectedBlock(null);
  }

  function moveBlock(id: string, direction: 'up' | 'down') {
    const index = blocks.findIndex(b => b.id === id);
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === blocks.length - 1)
    ) {
      return;
    }

    const newBlocks = [...blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    setBlocks(newBlocks);
  }

  function toggleLayer(layer: string) {
    setVisibleLayers((prev) => prev.includes(layer) ? prev.filter((item) => item !== layer) : [...prev, layer]);
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function handleRasterUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const rasterFiles = files.filter((file) => /\.(tif|tiff)$/i.test(file.name));

    if (files.length > 0 && rasterFiles.length === 0) {
      alert('TIF 또는 TIFF 파일만 업로드할 수 있습니다.');
      event.currentTarget.value = '';
      return;
    }

    const newLayers = rasterFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }));

    setUploadedRasterLayers((prev) => [...prev, ...newLayers]);
    setVisibleLayers((prev) => {
      const next = [...prev];
      newLayers.forEach((layer) => {
        const layerKey = `TIF:${layer.name}`;
        if (!next.includes(layerKey)) {
          next.push(layerKey);
        }
      });
      return next;
    });
    event.currentTarget.value = '';
  }

  function removeRasterLayer(id: string) {
    const target = uploadedRasterLayers.find((layer) => layer.id === id);
    setUploadedRasterLayers((prev) => prev.filter((layer) => layer.id !== id));
    if (target) {
      setVisibleLayers((prev) => prev.filter((layer) => layer !== `TIF:${target.name}`));
    }
  }

  function addMarker() {
    const lat = Number(markerDraft.lat);
    const lng = Number(markerDraft.lng);
    if (!markerDraft.label || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert('마커명, 위도, 경도를 입력해주세요.');
      return;
    }
    setMarkers([...markers, { id: crypto.randomUUID(), label: markerDraft.label, lat, lng }]);
    setMarkerDraft({ label: '', lat: '', lng: '' });
  }

  async function handleSaveContextInfo() {
    if (!selectedRisk) {
      alert('리스크를 선택해주세요.');
      return;
    }

    try {
      const updatedRisk = {
        ...selectedRisk,
        contextInfo: {
          title: blocks.find(b => b.type === 'title')?.content || '현황정보',
          body: blocks.find(b => b.type === 'text')?.content || '',
          blocks: blocks,
          source: blocks.find(b => b.type === 'source')?.content || '',
        },
        mapInfo: {
          ...(selectedRisk.mapInfo || {}),
          center: selectedRisk.mapInfo?.center || localGov?.center,
          zoom: selectedRisk.mapInfo?.zoom || localGov?.zoom,
          regionCode: selectedRisk.mapInfo?.regionCode || localGov?.regionCode,
          visibleLayers,
          markers,
          rasterLayers: uploadedRasterLayers,
        },
        contextPages: blocks.length,
      };

      await api.updateRisk(selectedRisk.id, updatedRisk);
      alert('현황정보가 저장되었습니다.');
      await loadRisks();
    } catch (error) {
      console.error('Failed to save context info:', error);
      alert('저장에 실패했습니다.');
    }
  }

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
        <div className="flex justify-between items-center mb-6">
          <h1>현황정보 페이지 구성</h1>
          <div className="flex gap-2">
            <Button variant="outline">미리보기</Button>
            <Button variant="outline">응답화면에서 보기</Button>
            <Button variant="primary" onClick={handleSaveContextInfo}>저장</Button>
          </div>
        </div>

        {/* Risk Selection */}
        <Card className="mb-6 overflow-hidden border-emerald-100">
          <div className="border-b border-emerald-100 bg-gradient-to-r from-[#073f4d] to-[#008b7a] p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                  Risk Context Builder
                </div>
                <h2 className="mt-1">현황정보를 구성할 리스크 선택</h2>
                <p className="mt-1 text-sm text-emerald-50">
                  리스크 관리에서 등록한 목록을 불러와 설문 전에 보여줄 설명 페이지를 구성합니다.
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
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full rounded-lg border border-input bg-input-background px-3 py-3"
              >
                {allSectorsForFilter.map(sector => (
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
                <div className="h-full rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="text-xs font-semibold text-emerald-700">선택된 리스크</div>
                  <h3 className="mt-1 line-clamp-2">{selectedRisk.title || selectedRisk.name}</h3>
                  <div className="mt-2 text-sm text-muted-foreground">{selectedRiskPath}</div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{blocks.length}</div>
                      <div className="text-muted-foreground">블록</div>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{visibleLayers.length}</div>
                      <div className="text-muted-foreground">지도</div>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-2">
                      <div className="font-semibold text-foreground">{markers.length}</div>
                      <div className="text-muted-foreground">마커</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  리스크 관리 페이지에서 리스크를 먼저 등록하세요.
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-emerald-100 bg-slate-50/70 p-3">
          <div className="grid gap-2 md:grid-cols-3">
            {editorTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveConfigTab(tab.id)}
                className={`rounded-xl px-4 py-3 text-left transition ${
                  activeConfigTab === tab.id
                    ? 'bg-[#073f4d] text-white shadow'
                    : 'bg-white text-slate-600 hover:bg-emerald-50'
                }`}
              >
                <div className="font-semibold">{tab.label}</div>
                <div className={`mt-1 text-xs ${activeConfigTab === tab.id ? 'text-white/75' : 'text-muted-foreground'}`}>
                  {tab.description}
                </div>
              </button>
            ))}
          </div>
          </div>
        </Card>

        <div className="grid grid-cols-12 gap-6">
          {/* Content Block Menu */}
          {activeConfigTab === 'context' && (
          <div className="col-span-12 lg:col-span-3">
            <Card className="p-4 mb-4">
              <h3 className="mb-1">콘텐츠 구성 도구</h3>
              <p className="mb-4 text-sm text-muted-foreground">응답자에게 먼저 보여줄 현황 설명 블록을 추가합니다.</p>
              <div className="space-y-2">
                {blockTypes.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => addBlock(type)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-accent transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-6 sticky top-8">
              <h3 className="mb-4">블록 속성 편집</h3>
              {selectedBlock ? (
                <div className="space-y-4">
                  <div>
                    <label className="block mb-2">블록 유형</label>
                    <select
                      value={selectedBlock.type}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      disabled
                    >
                      {blockTypes.map(({ type, label }) => (
                        <option key={type} value={type}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {selectedBlock.type === 'title' && (
                    <div>
                      <label className="block mb-2">제목</label>
                      <input
                        type="text"
                        value={selectedBlock.content}
                        onChange={(e) => updateBlock(selectedBlock.id, e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      />
                    </div>
                  )}

                  {selectedBlock.type === 'text' && (
                    <div>
                      <label className="block mb-2">본문</label>
                      <textarea
                        value={selectedBlock.content}
                        onChange={(e) => updateBlock(selectedBlock.id, e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      />
                    </div>
                  )}

                  {selectedBlock.type === 'table' && (
                    <>
                      <div>
                        <label className="block mb-2">표 데이터 입력</label>
                        <textarea
                          value={selectedBlock.content}
                          onChange={(e) => updateBlock(selectedBlock.id, e.target.value)}
                          rows={6}
                          placeholder="CSV 형식으로 입력하세요&#10;예:&#10;구분,2020,2021,2022&#10;감염병,120,145,189&#10;질환,85,92,98"
                          className="w-full px-3 py-2 border border-input rounded bg-input-background font-mono text-sm"
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        * 첫 줄은 헤더로 사용됩니다
                      </div>
                    </>
                  )}

                  {(selectedBlock.type === 'chart' || selectedBlock.type === 'map') && (
                    <>
                      <div>
                        <label className="block mb-2">이미지 업로드</label>
                        <Button variant="outline" size="sm" className="w-full">
                          파일 선택
                        </Button>
                      </div>
                      <div>
                        <label className="block mb-2">캡션</label>
                        <input
                          type="text"
                          value={selectedBlock.content}
                          onChange={(e) => updateBlock(selectedBlock.id, e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded bg-input-background"
                        />
                      </div>
                    </>
                  )}

                  {selectedBlock.type === 'note' && (
                    <div>
                      <label className="block mb-2">주석 내용</label>
                      <textarea
                        value={selectedBlock.content}
                        onChange={(e) => updateBlock(selectedBlock.id, e.target.value)}
                        rows={3}
                        placeholder="참고사항이나 주석을 입력하세요"
                        className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      />
                    </div>
                  )}

                  {selectedBlock.type === 'source' && (
                    <div>
                      <label className="block mb-2">출처</label>
                      <input
                        type="text"
                        value={selectedBlock.content}
                        onChange={(e) => updateBlock(selectedBlock.id, e.target.value)}
                        placeholder={`예: ${localGovName} 보건환경연구원, 2025`}
                        className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      />
                    </div>
                  )}

                  <div className="pt-4 border-t border-border">
                    <label className="block mb-2">순서 변경</label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => moveBlock(selectedBlock.id, 'up')}
                      >
                        위로
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => moveBlock(selectedBlock.id, 'down')}
                      >
                        아래로
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => deleteBlock(selectedBlock.id)}
                  >
                    블록 삭제
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  편집할 블록을 선택하세요
                </p>
              )}
            </Card>
          </div>
          )}

          {/* Preview Area */}
          <div className={activeConfigTab === 'context' ? 'col-span-12 lg:col-span-9' : 'col-span-12'}>
            {activeConfigTab === 'map' && (
            <Card className="mb-6 overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h3>지도 정보 구성하기</h3>
                  <p className="text-sm text-muted-foreground">
                    지도 위의 정보 배포 패널에서 기본 레이어와 TIF 자료를 구성합니다.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                  {visibleLayers.length}개 레이어
                </span>
              </div>
              <div className="relative h-[540px]">
                <ClimateMap
                  center={mapCenter}
                  zoom={mapZoom}
                  regionName={mapRegionName}
                  markers={markers}
                  layers={visibleLayers}
                />
                <div className="absolute right-4 top-4 z-[800] max-h-[calc(100%-2rem)] w-72 overflow-y-auto rounded-2xl border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur">
                  <div className="mb-3">
                    <h3 className="mb-1">지도 정보 배포</h3>
                    <p className="text-xs text-muted-foreground">
                      체크한 레이어와 마커가 응답자 지도에 표시됩니다.
                    </p>
                  </div>
                  <div className="space-y-2 mb-4">
                    {mapLayerOptions.map((layer) => (
                      <label key={layer} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-emerald-50">
                        <input type="checkbox" checked={visibleLayers.includes(layer)} onChange={() => toggleLayer(layer)} />
                        <span>{layer}</span>
                      </label>
                    ))}
                  </div>
                  <div className="border-t border-border pt-3">
                    <div className="mb-2 text-sm font-semibold">TIF 레이어 업로드</div>
                    <label className="mb-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 hover:bg-emerald-100">
                      <input
                        type="file"
                        accept=".tif,.tiff,image/tiff"
                        multiple
                        className="hidden"
                        onChange={handleRasterUpload}
                      />
                      TIF/TIFF 파일 선택
                    </label>
                    {uploadedRasterLayers.length > 0 && (
                      <div className="mb-4 space-y-1">
                        {uploadedRasterLayers.map((layer) => {
                          const layerKey = `TIF:${layer.name}`;
                          return (
                            <div key={layer.id} className="rounded-lg bg-slate-50 px-2 py-2 text-xs">
                              <label className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={visibleLayers.includes(layerKey)}
                                  onChange={() => toggleLayer(layerKey)}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-semibold text-slate-800">{layer.name}</span>
                                  <span className="text-muted-foreground">{formatFileSize(layer.size)}</span>
                                </span>
                                <button type="button" className="text-red-600" onClick={() => removeRasterLayer(layer.id)}>
                                  삭제
                                </button>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-3">
                    <div className="mb-2 text-sm font-semibold">지도 마커 추가</div>
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
                      <Button variant="outline" size="sm" className="w-full" onClick={addMarker}>지도 마커 추가</Button>
                    </div>
                    {markers.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {markers.map((marker) => (
                          <div key={marker.id} className="flex items-center justify-between text-xs bg-accent rounded px-2 py-1">
                            <span>{marker.label}</span>
                            <button onClick={() => setMarkers(markers.filter((item) => item.id !== marker.id))}>삭제</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {visibleLayers.length === 0 && (
                  <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl bg-white/90 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                    지도 정보 배포에서 레이어를 선택하면 이곳에 표시됩니다.
                  </div>
                )}
              </div>
            </Card>
            )}

            {activeConfigTab === 'context' && (
            <Card className="p-8">
              <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3>현황정보 페이지 미리보기</h3>
                  <p className="text-sm text-muted-foreground">블록을 클릭하면 오른쪽에서 내용을 수정할 수 있습니다.</p>
                </div>
                <span className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">
                  {blocks.length}개 블록
                </span>
              </div>
              <div className="space-y-6">
                {blocks.map((block) => (
                  <div
                    key={block.id}
                    onClick={() => setSelectedBlock(block)}
                    className={`p-4 rounded border-2 transition-all cursor-pointer ${
                      selectedBlock?.id === block.id
                        ? 'border-primary bg-accent/20'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    {block.type === 'title' && (
                      <h2>{block.content}</h2>
                    )}
                    {block.type === 'text' && (
                      <p>{block.content}</p>
                    )}
                    {block.type === 'table' && (
                      <div className="bg-gray-100 rounded-lg p-8 text-center">
                        <TableIcon className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                        <div className="text-muted-foreground">{block.content}</div>
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
              </div>
            </Card>
            )}

            {activeConfigTab === 'respondent' && (
              <Card className="overflow-hidden">
                <div className="grid min-h-[640px] lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="relative h-[420px] lg:h-auto">
                    <ClimateMap
                      center={mapCenter}
                      zoom={mapZoom}
                      regionName={mapRegionName}
                      markers={markers}
                      layers={visibleLayers}
                    />
                    <div className="absolute left-4 top-4 z-[800] rounded-2xl border border-white/70 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
                      <div className="text-xs font-semibold text-emerald-700">응답자 지도 미리보기</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {visibleLayers.length}개 레이어 · {markers.length}개 마커
                      </div>
                    </div>
                  </div>

                  <div className="max-h-[640px] overflow-y-auto border-t border-border bg-white p-6 lg:border-l lg:border-t-0">
                    <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">선택된 리스크</div>
                      <h3 className="mt-2 text-xl font-semibold">{selectedRisk?.title || selectedRisk?.name || '선택된 리스크 없음'}</h3>
                      {selectedRiskPath && <p className="mt-2 text-sm text-muted-foreground">{selectedRiskPath}</p>}
                      <p className="mt-3 text-sm text-muted-foreground">
                        응답자는 이 현황정보와 지도 레이어를 확인한 뒤 고정 설문 문항에 응답하게 됩니다.
                      </p>
                    </div>

                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3>현황정보 미리보기</h3>
                        <p className="text-sm text-muted-foreground">응답자 화면에서 보이는 설명 블록입니다.</p>
                      </div>
                      <span className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">
                        {blocks.length}개 블록
                      </span>
                    </div>

                    <div className="space-y-4">
                      {blocks.length > 0 ? (
                        blocks.map((block) => (
                          <div key={block.id} className="rounded-xl border border-border bg-background p-4">
                            {block.type === 'title' && <h2>{block.content}</h2>}
                            {block.type === 'text' && <p>{block.content}</p>}
                            {block.type === 'table' && (
                              <div className="rounded-lg bg-gray-100 p-8 text-center">
                                <TableIcon className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
                                <div className="text-muted-foreground">{block.content}</div>
                              </div>
                            )}
                            {block.type === 'chart' && (
                              <div className="rounded-lg bg-gray-100 p-8 text-center">
                                <BarChart3 className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
                                <div className="text-muted-foreground">{block.content}</div>
                              </div>
                            )}
                            {block.type === 'map' && (
                              <div className="rounded-lg bg-gray-100 p-8 text-center">
                                <MapPin className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
                                <div className="text-muted-foreground">{block.content}</div>
                              </div>
                            )}
                            {block.type === 'note' && (
                              <div className="border-l-4 border-blue-400 bg-blue-50 py-2 pl-3 text-sm text-muted-foreground">
                                {block.content}
                              </div>
                            )}
                            {block.type === 'source' && (
                              <div className="border-t border-border pt-2 text-sm text-muted-foreground">
                                출처: {block.content}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                          아직 구성된 현황정보 블록이 없습니다.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
