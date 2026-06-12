import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Type, FileText, Table as TableIcon, BarChart3, MapPin, FileBox, Plus } from 'lucide-react';
import * as api from '../../lib/api';
import { sectors } from '../../data/sectorMapping';
import type { ContentBlock } from '../../types/risk';

type BlockType = 'title' | 'text' | 'table' | 'chart' | 'map' | 'note' | 'source';

const blockTypes = [
  { type: 'title' as BlockType, label: '제목', icon: Type },
  { type: 'text' as BlockType, label: '본문', icon: FileText },
  { type: 'table' as BlockType, label: '표', icon: TableIcon },
  { type: 'chart' as BlockType, label: '그래프', icon: BarChart3 },
  { type: 'map' as BlockType, label: '지도 이미지', icon: MapPin },
  { type: 'note' as BlockType, label: '주석', icon: FileBox },
  { type: 'source' as BlockType, label: '출처', icon: FileText },
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

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<ContentBlock | null>(null);

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
    : risks.filter(r => r.sector === selectedSector);

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
            {selectedRisk ? (
              <Card className="p-4 bg-blue-50 border-blue-200">
                <div className="mb-2">
                  <span className="text-muted-foreground">선택된 리스크:</span>
                </div>
                <h3 className="mb-1">{selectedRisk.name}</h3>
                <div className="text-sm text-muted-foreground">
                  {selectedRisk.sector} &gt; {selectedRisk.subSector}
                </div>
              </Card>
            ) : (
              <Card className="p-4">
                <div className="text-muted-foreground">리스크를 선택하세요</div>
              </Card>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Content Block Menu */}
          <div className="col-span-2">
            <Card className="p-4">
              <h3 className="mb-4">콘텐츠 블록 추가</h3>
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
          </div>

          {/* Preview Area */}
          <div className="col-span-7">
            <Card className="p-8">
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
          </div>

          {/* Properties Panel */}
          <div className="col-span-3">
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
        </div>
      </div>
    </div>
  );
}
