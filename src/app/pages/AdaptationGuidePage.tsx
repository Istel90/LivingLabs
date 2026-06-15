import { useState } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { CircularProcess } from '../components/CircularProcess';
import { RightSidebar } from '../components/RightSidebar';
import { PlatformContent } from '../components/PlatformContent';
import { BookOpen, ChevronDown, ChevronRight, Compass, Sparkles } from 'lucide-react';

const leadDepartmentToolUrl =
  import.meta.env.VITE_LEAD_DEPARTMENT_TOOL_URL || 'http://128.134.187.146:6080/living-lab/';
const responsibleDepartmentToolUrl =
  import.meta.env.VITE_RESPONSIBLE_DEPARTMENT_TOOL_URL || 'http://127.0.0.1:4175/responsible-department';

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

const treeData: TreeNode[] = [
  {
    id: '3',
    label: '적응대책의 수립 절차',
    children: [
      { id: '3-1', label: '1) 제2차 적응대책 종합평가' },
      {
        id: '3-2',
        label: '2) 지역 현황 및 기후변화 적응여건 분석',
        children: [
          { id: '3-2-1', label: '(1) 지역현황 및 특성 조사·분석' },
          { id: '3-2-2', label: '(2) 적응관련 상황계획 및 정책 계획 조사' },
          { id: '3-2-3', label: '(3) 기후변화 전망 및 영향 조사' },
          { id: '3-2-4', label: '(4) 기후위기 취약지역 및 취약계층 현황 조사' }
        ]
      },
      {
        id: '3-3',
        label: '3) 지역 리스크 도출',
        children: [
          { id: '3-3-1', label: '(1) 지역 리스크 도출 과정' },
          { id: '3-3-2', label: '(2) 지역 영향평가' },
          { id: '3-3-3', label: '(3) 국가 리스크 목록 검토' },
          { id: '3-3-4', label: '(4) 지역 취약성 평가' },
          { id: '3-3-5', label: '(5) 지역리스크 도출' },
          { id: '3-3-6', label: '(6) 중점관리구역 선정' }
        ]
      },
      { id: '3-4', label: '4) 제3차 적응대책 추진 방향 설정 및 분문별 세부이행과제 수립' },
      {
        id: '3-5',
        label: '5) 제3차 적응대책(안) 마련',
        children: [
          { id: '3-5-1', label: '(1) 과제 발굴 및 선정' },
          { id: '3-5-2', label: '(2) 기후위기 취약지역 단계적 강화 및 취약 계층 보호' }
        ]
      },
      { id: '3-6', label: '6) 적응대책 수립 확정' }
    ]
  },
  {
    id: '4',
    label: '4. 지방 기후위기 적응대책 이행점검의 기준 및 방법'
  }
];

function TreeItem({ node, selectedItem, onSelectItem, level = 0 }: { 
  node: TreeNode; 
  selectedItem: string; 
  onSelectItem: (id: string) => void;
  level?: number;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedItem === node.id;
  const isAlwaysOpen = node.id === '3'; // 3번 항목은 항상 열려있음

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1 rounded-xl px-3 py-2.5 transition-all ${
          isSelected 
            ? 'bg-gradient-to-r from-[#087f72] to-[#10a37f] text-white shadow-md shadow-emerald-900/10' 
            : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'
        }`}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={() => {
          if (hasChildren && !isAlwaysOpen) {
            setIsOpen(!isOpen);
          }
          onSelectItem(node.id);
        }}
      >
        {hasChildren && !isAlwaysOpen && (
          <span className="flex-shrink-0">
            {isOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </span>
        )}
        {(!hasChildren || isAlwaysOpen) && <span className="w-4" />}
        <span className="flex-1 text-sm leading-5">{node.label}</span>
      </div>
      {hasChildren && (isOpen || isAlwaysOpen) && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              selectedItem={selectedItem}
              onSelectItem={onSelectItem}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AdaptationSidebar({ selectedItem, onSelectItem }: { selectedItem: string; onSelectItem: (id: string) => void }) {
  return (
    <aside className="sticky top-6 h-fit rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 px-2 pb-4">
        <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Compass className="size-5" />
        </div>
        <div>
          <p className="font-extrabold text-slate-900">수립 절차 탐색</p>
          <p className="text-xs text-slate-500">단계를 선택해 내용을 확인하세요</p>
        </div>
      </div>
      <nav>
        {treeData.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            selectedItem={selectedItem}
            onSelectItem={onSelectItem}
          />
        ))}
      </nav>
    </aside>
  );
}

function AdaptationContent({ selectedItem, onSelectItem }: { selectedItem: string; onSelectItem: (id: string) => void }) {
  const contentMap: Record<string, { title: string; content: JSX.Element }> = {
    '3': {
      title: '적응대책의 수립 절차',
      content: (
        <div className="space-y-6">
          <p className="text-gray-700 leading-relaxed">
            지방 기후위기 적응대책 수립 절차는 6단계로 구성되어 있습니다. 각 단계는 순환적으로 연결되어 있으며, 
            지속적인 평가와 개선을 통해 효과적인 적응대책을 수립할 수 있습니다.
          </p>
          
          {/* Circular Process Diagram */}
          <div className="flex justify-center my-8">
            <div className="w-full max-w-md">
              <CircularProcess onStepClick={onSelectItem} />
            </div>
          </div>

          <div className="bg-blue-50 border-l-4 border-[#004494] p-4 rounded">
            <p className="text-sm text-gray-700">
              위 다이어그램은 적응대책 수립의 6단계 순환 구조를 나타냅니다. 
              각 단계를 클릭하면 해당 내용으로 이동합니다.
            </p>
          </div>
        </div>
      )
    },
    '3-1': {
      title: '1) 제2차 적응대책 종합평가',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            이전 차수의 적응대책이 어떻게 이행되었는지, 어떤 성과와 한계가 있었는지를 
            종합적으로 평가하는 단계입니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">평가 내용</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>세부 이행과제별 추진 실적 점검</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>목표 달성도 평가</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>이행 과정에서의 애로사항 및 개선점 도출</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>우수 사례 발굴 및 공유</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    '3-2': {
      title: '2) 지역 현황 및 기후변화 적응여건 분석',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            지역의 현황과 기후변화 적응 여건을 다각도로 분석하여 적응대책 수립의 기초 자료로 활용합니다.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-sm">지역현황 조사</h4>
              <p className="text-xs text-gray-600">
                인구, 산업, 토지이용, 인프라 등 지역의 사회경제적 특성 파악
              </p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-sm">정책 계획 검토</h4>
              <p className="text-xs text-gray-600">
                관련 상위 계획 및 타 부문 계획과의 연계성 분석
              </p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-sm">기후변화 전망</h4>
              <p className="text-xs text-gray-600">
                지역별 기후변화 시나리오 및 영향 예측
              </p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-sm">취약성 조사</h4>
              <p className="text-xs text-gray-600">
                기후위기에 취약한 지역과 계층 파악
              </p>
            </div>
          </div>
        </div>
      )
    },
    '3-2-1': {
      title: '(1) 지역현황 및 특성 조사·분석',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            지역의 자연환경, 사회경제적 여건, 인프라 현황 등을 종합적으로 조사하고 분석합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">조사 항목</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <h5 className="font-medium mb-1">자연환경</h5>
                <p className="text-xs text-gray-600">지형, 기후, 수자원, 생태계 등</p>
              </div>
              <div>
                <h5 className="font-medium mb-1">사회경제</h5>
                <p className="text-xs text-gray-600">인구구조, 산업구조, 경제수준 등</p>
              </div>
              <div>
                <h5 className="font-medium mb-1">인프라</h5>
                <p className="text-xs text-gray-600">교통, 에너지, 상하수도, 통신 등</p>
              </div>
              <div>
                <h5 className="font-medium mb-1">토지이용</h5>
                <p className="text-xs text-gray-600">용도지역, 개발현황, 보전지역 등</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    '3-2-2': {
      title: '(2) 적응관련 상황계획 및 정책 계획 조사',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            국가 및 지역의 기후변화 적응 관련 상위 계획과 타 부문 계획을 검토하여 
            정합성을 확보하고 시너지를 창출합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">검토 대상 계획</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>국가 기후위기 적응대책</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>시·도 기후위기 적응대책 (시·군·구의 경우)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>지역 환경보전계획</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>지속가능발전 기본계획</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>도시계획, 방재계획 등 관련 부문별 계획</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    '3-2-3': {
      title: '(3) 기후변화 전망 및 영향 조사',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            기후변화 시나리오를 활용하여 지역의 미래 기후를 전망하고, 
            이에 따른 분야별 영향을 예측합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">전망 및 영향 조사 방법</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>IPCC 기후변화 시나리오 활용 (SSP 시나리오 등)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>기상청 기후정보포털 등 공공 데이터 활용</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>기온, 강수, 극한기후 등 주요 기후 요소 변화 분석</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>분야별 영향 평가 (건강, 재해, 농업, 산림, 물관리, 생태계 등)</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    '3-2-4': {
      title: '(4) 기후위기 취약지역 및 취약계층 현황 조사',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            기후변화에 특히 취약한 지역과 계층을 파악하여 우선 지원 대상을 선정합니다.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-semibold mb-2">취약지역</h4>
              <ul className="space-y-1 text-xs text-gray-700">
                <li>• 침수 위험 지역</li>
                <li>• 산사태 위험 지역</li>
                <li>• 해안 침식 지역</li>
                <li>• 폭염 취약 지역</li>
                <li>• 한파 취약 지역</li>
              </ul>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-semibold mb-2">취약계층</h4>
              <ul className="space-y-1 text-xs text-gray-700">
                <li>• 노인</li>
                <li>• 영유아</li>
                <li>• 저소득층</li>
                <li>• 장애인</li>
                <li>• 옥외 근로자</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    '3-3': {
      title: '3) 지역 리스크 도출',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            지역의 기후 리스크를 체계적으로 파악하고 우선순위를 결정하는 단계입니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">리스크 도출 프로세스</h4>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-[#004494] text-white rounded-full flex items-center justify-center text-xs font-semibold">
                  1
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700">지역 영향평가 실시</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-[#004494] text-white rounded-full flex items-center justify-center text-xs font-semibold">
                  2
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700">국가 리스크 목록 검토</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-[#004494] text-white rounded-full flex items-center justify-center text-xs font-semibold">
                  3
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700">지역 취약성 평가</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-[#004494] text-white rounded-full flex items-center justify-center text-xs font-semibold">
                  4
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700">최종 지역 리스크 목록 도출</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    '3-3-1': {
      title: '(1) 지역 리스크 도출 과정',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            지역의 기후 리스크를 도출하기 위한 체계적인 과정을 수행합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">주요 절차</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>기후위험 목록 작성 (홍수, 가뭄, 폭염, 한파, 태풍 등)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>부문별 노출도 평가 (인구, 자산, 인프라 등)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>취약성 지표 개발 및 평가</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>리스크 매트릭스를 활용한 우선순위 결정</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    '3-3-2': {
      title: '(2) 지역 영향평가',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            기후변화가 지역의 각 부문에 미치는 영향을 정량적·정성적으로 평가합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">부문별 영향 평가</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-1">건강</h5>
                <p className="text-xs text-gray-600">온열질환, 감염병 등</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-1">재해</h5>
                <p className="text-xs text-gray-600">홍수, 산사태 등</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-1">농업</h5>
                <p className="text-xs text-gray-600">작물 생산성, 병해충 등</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-1">물관리</h5>
                <p className="text-xs text-gray-600">수자원 가용량, 수질 등</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-1">산림</h5>
                <p className="text-xs text-gray-600">산림 생태계, 산불 등</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-1">생태계</h5>
                <p className="text-xs text-gray-600">생물다양성, 외래종 등</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    '3-3-3': {
      title: '(3) 국가 리스크 목록 검토',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            국가 기후위기 적응대책에서 제시한 국가 차원의 기후 리스크 목록을 검토하고, 
            지역에 해당하는 리스크를 선별합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">검토 내용</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>국가 주요 기후 리스크 목록 확인</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>지역 해당 여부 판단</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>국가 대책과의 연계성 검토</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>국가-지역 간 역할 분담 명확화</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    '3-3-4': {
      title: '(4) 지역 취약성 평가',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            기후 리스크에 대한 지역의 취약성을 정량적으로 평가하여 우선 대응 대상을 선정합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">취약성 평가 지표</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <h5 className="font-medium mb-1">민감도 (Sensitivity)</h5>
                <p className="text-xs text-gray-600">
                  기후 변화에 얼마나 민감하게 반응하는가
                </p>
              </div>
              <div>
                <h5 className="font-medium mb-1">노출도 (Exposure)</h5>
                <p className="text-xs text-gray-600">
                  기후 위험에 얼마나 노출되어 있는가
                </p>
              </div>
              <div>
                <h5 className="font-medium mb-1">적응능력 (Adaptive Capacity)</h5>
                <p className="text-xs text-gray-600">
                  대응하고 적응할 수 있는 능력은 어느 정도인가
                </p>
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 pt-2">
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">사례</h4>
            </div>
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">지원도구 예시</h4>
              <a
                href={leadDepartmentToolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-[#004494] font-medium hover:underline"
              >
                주관부서의사결정 지원도구
              </a>
            </div>
          </div>
        </div>
      )
    },
    '3-3-5': {
      title: '(5) 지역리스크 도출',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            앞선 분석을 종합하여 최종적으로 지역의 우선 대응 리스크 목록을 도출합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">우선순위 결정 기준</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>발생 가능성 (빈도)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>피해 규모 (강도)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>취약성 수준</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>지역 주민의 인식 및 수요</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>대응 가능성 및 시급성</span>
              </li>
            </ul>
          </div>
          <div className="grid md:grid-cols-2 gap-4 pt-2">
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">사례</h4>
            </div>
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">지원도구 예시</h4>
              <a
                href={leadDepartmentToolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-[#004494] font-medium hover:underline"
              >
                주관부서의사결정 지원도구
              </a>
            </div>
          </div>
        </div>
      )
    },
    '3-3-6': {
      title: '(6) 중점관리구역 선정',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            지역리스크와 취약성 평가 결과를 종합하여 우선적으로 관리하고 지원할 중점관리구역을 선정합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">중점관리구역 선정 기준</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>기후 리스크의 발생 가능성과 피해 규모</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>지역 및 취약계층의 노출도와 취약성</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>대응 시급성과 관리 필요성</span>
              </li>
            </ul>
          </div>
          <div className="grid md:grid-cols-2 gap-4 pt-2">
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">사례</h4>
            </div>
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">지원도구 예시</h4>
              <a
                href={leadDepartmentToolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-[#004494] font-medium hover:underline"
              >
                주관부서의사결정 지원도구
              </a>
            </div>
          </div>
        </div>
      )
    },
    '3-4': {
      title: '4) 제3차 적응대책 추진 방향 설정 및 분문별 세부이행과제 수립',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            도출된 리스크를 기반으로 적응대책의 비전, 목표, 추진 방향을 설정하고, 
            분야별 세부 이행과제를 개발합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">1. 비전 및 목표 설정</h4>
            <p className="text-sm text-gray-700 mb-2">
              지역의 기후 적응 비전과 중장기 목표를 명확히 설정합니다.
            </p>
          </div>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">2. 추진 전략 수립</h4>
            <ul className="space-y-1 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>부문별 추진 방향 설정</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>우선순위 리스크별 대응 전략 마련</span>
              </li>
            </ul>
          </div>
          <div className="grid md:grid-cols-2 gap-4 pt-2">
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">사례</h4>
            </div>
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">지원도구 예시</h4>
              <a
                href={responsibleDepartmentToolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-[#004494] font-medium hover:underline"
              >
                소관부서의사결정 지원도구
              </a>
            </div>
          </div>
        </div>
      )
    },
    '3-5': {
      title: '5) 제3차 적응대책(안) 마련',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            수립된 이행과제를 종합하여 적응대책 계획서(안)를 작성하고, 
            이해관계자 의견을 수렴합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">계획서 구성</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>제1장. 수립 배경 및 목적</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>제2장. 지역 현황 및 기후변화 전망</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>제3장. 기후 리스크 평가</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>제4장. 비전 및 목표</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>제5장. 부문별 세부 이행과제</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>제6장. 이행 및 관리 방안</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    '3-5-1': {
      title: '(1) 과제 발굴 및 선정',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            다양한 이해관계자의 참여를 통해 적응 과제를 발굴하고, 
            우선순위에 따라 최종 과제를 선정합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">과제 발굴 방법</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>주민 설문조사 및 의견 수렴</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>전문가 자문 및 워크숍</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>리빙랩 운영을 통한 현장 기반 과제 도출</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>타 지역 우수 사례 벤치마킹</span>
              </li>
            </ul>
          </div>
          <div className="grid md:grid-cols-2 gap-4 pt-2">
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">사례</h4>
            </div>
            <div className="bg-white border rounded-lg p-5 min-h-32">
              <h4 className="font-semibold text-lg text-gray-900">지원도구 예시</h4>
              <a
                href={responsibleDepartmentToolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-[#004494] font-medium hover:underline"
              >
                소관부서의사결정 지원도구
              </a>
            </div>
          </div>
        </div>
      )
    },
    '3-5-2': {
      title: '(2) 기후위기 취약지역 단계적 강화 및 취약 계층 보호',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            취약지역과 취약계층을 보호하기 위한 맞춤형 대책을 마련합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">주요 대책</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>취약지역 인프라 강화</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>취약계층 지원 프로그램 운영</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>조기 경보 시스템 구축</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>쿨링센터, 온열질환 예방 등 지원 시설 확충</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    '3-6': {
      title: '6) 적응대책 수립 확정',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            마련된 적응대책안을 검토하고 최종 확정합니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">확정 절차</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>관계 부서 협의 및 조정</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>주민 공청회 개최</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>관련 위원회 심의</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>최종안 확정 및 공표</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    '4': {
      title: '4. 지방 기후위기 적응대책 이행점검의 기준 및 방법',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">
            수립된 적응대책의 이행상황을 점검하기 위한 기준과 방법을 제시합니다. 
            정기적인 점검과 평가를 통해 적응대책의 실효성을 높일 수 있습니다.
          </p>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3">이행점검 체계</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>연차별 이행 점검 실시</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>성과지표 모니터링</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>환류 체계 구축</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>차기 대책 수립 시 반영</span>
              </li>
            </ul>
          </div>
        </div>
      )
    }
  };

  const content = contentMap[selectedItem] || contentMap['3'];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5">
      <div className="border-b border-slate-100 bg-gradient-to-r from-[#073b52] to-[#0b6574] px-7 py-7 text-white md:px-9">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-200">
          <BookOpen className="size-4" />
          ADAPTATION GUIDE
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{content.title}</h1>
      </div>
      <div className="guide-content prose max-w-none p-7 md:p-9 [&_.bg-white.border]:rounded-2xl [&_.bg-white.border]:border-slate-200 [&_.bg-white.border]:bg-slate-50/70 [&_.bg-white.border]:shadow-sm [&_.bg-gray-50]:bg-emerald-50/60 [&_h4]:text-slate-900 [&_h5]:text-slate-800 [&_a]:text-emerald-700">
        {content.content}
      </div>
    </div>
  );
}

export function AdaptationGuidePage() {
  const [selectedItem, setSelectedItem] = useState('3');
  const [platformSelectedItem, setPlatformSelectedItem] = useState('');

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f7f8]">
      <Header />
      
      <main className="flex-1">
        <section className="relative overflow-hidden bg-[#073b52] text-white">
          <div className="absolute -left-20 top-0 size-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 top-0 size-80 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="container relative mx-auto px-4 py-10 md:py-12">
            <div className="flex max-w-3xl items-start gap-4">
              <div className="mt-1 grid size-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10">
                <Sparkles className="size-6 text-emerald-300" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-300">LOCAL CLIMATE ADAPTATION</p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">적응대책 수립 가이드</h1>
                <p className="mt-3 leading-7 text-slate-200">
                  지역 현황 진단부터 적응사업 확정까지, 단계별 절차와 활용 가능한 지원도구를 확인하세요.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-8">
          <div className="grid items-start gap-6 xl:grid-cols-[290px_minmax(0,1fr)_250px]">
            <AdaptationSidebar selectedItem={selectedItem} onSelectItem={setSelectedItem} />
            {platformSelectedItem ? (
              <PlatformContent selectedItem={platformSelectedItem} />
            ) : (
              <AdaptationContent selectedItem={selectedItem} onSelectItem={setSelectedItem} />
            )}
            <RightSidebar selectedItem={platformSelectedItem} onSelectItem={setPlatformSelectedItem} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
