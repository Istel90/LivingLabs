import { FileText, Users, TrendingUp } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { ImageWithFallback } from './common/ImageWithFallback';

interface MainContentProps {
  selectedItem: string;
}

// Content data for each section
const contentData: Record<string, { title: string; content: JSX.Element }> = {
  '1': {
    title: '1. 시작하기',
    content: (
      <div className="space-y-6">
        <p className="text-gray-700 leading-relaxed">
          지방 기후위기 적응대책 위한 리빙랩 지원 도구는 지방자치단체가 기후변화에 효과적으로 대응하고 
          적응 대책을 수립할 수 있도록 지원하는 종합 플랫폼입니다.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                  <FileText className="size-6 text-[#004494]" />
                </div>
                <h3 className="font-semibold mb-2">체계적 접근</h3>
                <p className="text-sm text-gray-600">
                  과학적 근거 기반의 체계적인 적응대책 수립 지원
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                  <Users className="size-6 text-green-700" />
                </div>
                <h3 className="font-semibold mb-2">주민 참여</h3>
                <p className="text-sm text-gray-600">
                  리빙랩 방식의 주민 참여형 대책 수립
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                  <TrendingUp className="size-6 text-purple-700" />
                </div>
                <h3 className="font-semibold mb-2">지속적 관리</h3>
                <p className="text-sm text-gray-600">
                  이행점검 및 평가를 통한 지속적 개선
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  },
  '1-1': {
    title: '지방 기후위기 적응대책 지원도구 개념',
    content: (
      <div className="space-y-4">
        <p className="text-gray-700 leading-relaxed">
          지방 기후위기 적응대책 지원도구는 「기후위기 대응을 위한 탄소중립·녹색성장 기본법」 제38조에 따라 
          지방자치단체가 수립하는 적응대책의 효율성과 실효성을 높이기 위한 지원 시스템입니다.
        </p>
        <div className="bg-blue-50 border-l-4 border-[#004494] p-4 rounded">
          <h4 className="font-semibold mb-2">주요 목적</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2">
              <span className="text-[#004494]">•</span>
              <span>지역 특성에 맞는 기후위기 적응대책 수립 지원</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#004494]">•</span>
              <span>과학적 데이터와 분석 도구 제공</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#004494]">•</span>
              <span>주민 참여형 리빙랩 운영 방법론 제공</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#004494]">•</span>
              <span>적응대책 이행 모니터링 및 평가 체계 구축</span>
            </li>
          </ul>
        </div>
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1616443586071-cd1f0a65ef5e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjbGltYXRlJTIwY2hhbmdlJTIwZW52aXJvbm1lbnR8ZW58MXx8fHwxNzcyNTM1NzI2fDA&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Climate adaptation"
          className="w-full h-64 object-cover rounded-lg"
        />
      </div>
    )
  },
  '2': {
    title: '2. 리빙랩을 통한 지방 기후위기 적응대책 지원',
    content: (
      <div className="space-y-6">
        <p className="text-gray-700 leading-relaxed">
          리빙랩(Living Lab)은 실제 생활공간에서 사용자가 직접 참여하여 문제를 발견하고 해결하는 
          혁신 방법론입니다. 지방 기후위기 적응대책 수립에서 리빙랩은 지역주민과 이해관계자가 
          함께 기후변화 문제를 진단하고 맞춤형 해결책을 개발하는 핵심 도구로 활용됩니다.
        </p>

        <div className="bg-gradient-to-r from-blue-50 to-green-50 border rounded-lg p-6">
          <h3 className="font-bold text-xl mb-3 text-gray-900">리빙랩의 핵심 원칙</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h4 className="font-semibold mb-1">시민 중심</h4>
                <p className="text-sm text-gray-700">
                  지역주민이 문제 정의부터 해결책 개발까지 전 과정에 참여
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div>
                <h4 className="font-semibold mb-1">현장 기반</h4>
                <p className="text-sm text-gray-700">
                  실제 생활환경에서 문제를 파악하고 솔루션을 테스트
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div>
                <h4 className="font-semibold mb-1">다자간 협력</h4>
                <p className="text-sm text-gray-700">
                  주민, 전문가, 행정, 기업 등 다양한 주체의 협업
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div>
                <h4 className="font-semibold mb-1">공동 창조</h4>
                <p className="text-sm text-gray-700">
                  모든 참여자가 함께 지식을 생산하고 혁신을 창출
                </p>
              </div>
            </div>
          </div>
        </div>

        <ImageWithFallback
          src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb21tdW5pdHklMjBtZWV0aW5nfGVufDF8fHx8MTc3MjUzNTcyNnww&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Community Meeting"
          className="w-full h-64 object-cover rounded-lg"
        />

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <Users className="size-8 text-[#004494]" />
                </div>
                <h3 className="font-bold text-lg mb-2">지역주민 참여</h3>
                <p className="text-sm text-gray-600">
                  기후변화 체감도 조사, 취약지역 발굴, 대책 아이디어 제안
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <FileText className="size-8 text-green-700" />
                </div>
                <h3 className="font-bold text-lg mb-2">전문가 자문</h3>
                <p className="text-sm text-gray-600">
                  기후과학 데이터 해석, 적응대책 타당성 검토, 기술 자문
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                  <TrendingUp className="size-8 text-purple-700" />
                </div>
                <h3 className="font-bold text-lg mb-2">정책 반영</h3>
                <p className="text-sm text-gray-600">
                  리빙랩 결과를 공식 적응대책에 반영하여 실행 가능성 제고
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h3 className="font-bold text-xl mb-4 text-gray-900">리빙랩 운영 단계</h3>
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-500 text-white rounded-lg flex items-center justify-center font-bold">
                1단계
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-2">문제 탐색 및 정의</h4>
                <p className="text-sm text-gray-700 mb-2">
                  지역주민과 함께 기후변화로 인한 문제를 발굴하고 우선순위를 설정합니다.
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li className="flex gap-2">
                    <span className="text-blue-500">•</span>
                    <span>주민 설문조사 및 인터뷰</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-500">•</span>
                    <span>현장 답사 및 관찰</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-500">•</span>
                    <span>워크숍을 통한 문제 도출</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-green-500 text-white rounded-lg flex items-center justify-center font-bold">
                2단계
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-2">해결책 공동 개발</h4>
                <p className="text-sm text-gray-700 mb-2">
                  참여자들이 협력하여 실현 가능한 적응대책 아이디어를 개발합니다.
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    <span>아이디어 브레인스토밍</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    <span>전문가 자문 및 피드백</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    <span>프로토타입 설계</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-500 text-white rounded-lg flex items-center justify-center font-bold">
                3단계
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-2">실험 및 테스트</h4>
                <p className="text-sm text-gray-700 mb-2">
                  현장에서 소규모로 대책을 시범 운영하고 효과를 검증합니다.
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li className="flex gap-2">
                    <span className="text-purple-500">•</span>
                    <span>시범사업 실시</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-purple-500">•</span>
                    <span>모니터링 및 데이터 수집</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-purple-500">•</span>
                    <span>참여자 피드백 수렴</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-orange-500 text-white rounded-lg flex items-center justify-center font-bold">
                4단계
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-2">평가 및 확산</h4>
                <p className="text-sm text-gray-700 mb-2">
                  결과를 평가하고 성공적인 대책을 확대 적용합니다.
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li className="flex gap-2">
                    <span className="text-orange-500">•</span>
                    <span>성과 평가 및 분석</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-orange-500">•</span>
                    <span>정책 반영 및 제도화</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-orange-500">•</span>
                    <span>다른 지역으로 확산</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-bold text-lg mb-3 text-gray-900">리빙랩 지원 시스템</h3>
          <p className="text-gray-700 mb-4">
            본 플랫폼은 리빙랩 운영의 전 과정을 체계적으로 지원합니다:
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-[#004494]">온라인 협업 도구</h4>
              <p className="text-sm text-gray-600">
                화상회의, 공유 문서, 설문조사 등 협업 기능 제공
              </p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-[#004494]">데이터 시각화</h4>
              <p className="text-sm text-gray-600">
                기후 데이터와 취약성 정보를 이해하기 쉽게 시각화
              </p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-[#004494]">운영 가이드</h4>
              <p className="text-sm text-gray-600">
                단계별 리빙랩 운영 매뉴얼 및 체크리스트 제공
              </p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-[#004494]">사례 공유</h4>
              <p className="text-sm text-gray-600">
                국내외 우수 리빙랩 사례 데이터베이스 제공
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  },
  '2-1': {
    title: '지방 기후위기 적응대책 수립 기본원칙',
    content: (
      <div className="space-y-4">
        <div className="bg-white border rounded-lg p-5">
          <h4 className="font-semibold mb-3">1. 과학적 근거 기반</h4>
          <p className="text-sm text-gray-700">
            기후변화 시나리오와 과학적 데이터를 바탕으로 객관적이고 신뢰성 있는 적응대책을 수립합니다.
          </p>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <h4 className="font-semibold mb-3">2. 지역 특성 반영</h4>
          <p className="text-sm text-gray-700">
            각 지역의 지리적, 사회경제적 특성과 기후위기 취약성을 고려한 맞춤형 대책을 마련합니다.
          </p>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <h4 className="font-semibold mb-3">3. 이해관계자 참여</h4>
          <p className="text-sm text-gray-700">
            지역 주민, 전문가, 관련 부처 등 다양한 이해관계자의 의견을 수렴하고 협력을 강화합니다.
          </p>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <h4 className="font-semibold mb-3">4. 통합적 접근</h4>
          <p className="text-sm text-gray-700">
            온실가스 감축(완화)과 기후변화 적응을 통합적으로 고려하며, 
            지속가능발전목표(SDGs)와의 연계를 추구합니다.
          </p>
        </div>
      </div>
    )
  },
  '2-2': {
    title: '지방 기후위기 적응대책 수립 절차',
    content: (
      <div className="space-y-4">
        <p className="text-gray-700 leading-relaxed">
          적응대책 수립은 체계적이고 순차적인 절차를 따라 진행됩니다.
        </p>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold text-sm">
              1
            </div>
            <div>
              <h4 className="font-medium mb-1">이전 대책 평가</h4>
              <p className="text-sm text-gray-600">
                제2차 적응대책의 이행 성과와 한계를 종합적으로 평가합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold text-sm">
              2
            </div>
            <div>
              <h4 className="font-medium mb-1">현황 분석</h4>
              <p className="text-sm text-gray-600">
                지역의 기후변화 현황과 적응 여건을 면밀히 조사·분석합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold text-sm">
              3
            </div>
            <div>
              <h4 className="font-medium mb-1">리스크 도출</h4>
              <p className="text-sm text-gray-600">
                지역의 기후 리스크를 체계적으로 파악하고 우선순위를 설정합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold text-sm">
              4
            </div>
            <div>
              <h4 className="font-medium mb-1">대책 수립</h4>
              <p className="text-sm text-gray-600">
                분문별 세부 이행과제를 개발하고 구체적인 실행 계획을 마련합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold text-sm">
              5
            </div>
            <div>
              <h4 className="font-medium mb-1">확정 및 공표</h4>
              <p className="text-sm text-gray-600">
                수립된 적응대책을 최종 확정하고 공표합니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  },
  'platform': {
    title: '플랫폼',
    content: (
      <div className="space-y-6">
        <p className="text-gray-700 leading-relaxed">
          지방 기후위기 적응대책 리빙랩 지원 플랫폼은 지방자치단체의 효과적인 기후 적응 대책 수립을 
          위한 통합 지원 시스템입니다.
        </p>
        <div className="bg-gradient-to-r from-blue-50 to-green-50 border rounded-lg p-6">
          <h3 className="font-semibold text-xl mb-4 text-gray-900">플랫폼 비전</h3>
          <p className="text-gray-700 leading-relaxed">
            과학적 데이터와 주민 참여를 결합한 리빙랩 방식으로 지역 맞춤형 기후 적응 솔루션을 
            제공하여 기후위기에 회복력 있는 지역사회를 만듭니다.
          </p>
        </div>
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaWdpdGFsJTIwcGxhdGZvcm18ZW58MXx8fHwxNzcyNTM1NzI2fDA&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Digital Platform"
          className="w-full h-64 object-cover rounded-lg"
        />
      </div>
    )
  },
  'platform-1': {
    title: '플랫폼 소개',
    content: (
      <div className="space-y-4">
        <p className="text-gray-700 leading-relaxed">
          본 플랫폼은 지방자치단체가 기후위기에 체계적으로 대응할 수 있도록 설계된 종합 지원 시스템입니다.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3 text-[#004494]">데이터 기반 의사결정</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>기후변화 시나리오 및 전망 데이터</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>지역별 취약성 평가 도구</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>리스크 분석 및 시각화</span>
              </li>
            </ul>
          </div>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3 text-[#004494]">리빙랩 운영 지원</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>주민 참여 방법론 제공</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>협업 도구 및 커뮤니케이션 기능</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>의견 수렴 및 피드백 시스템</span>
              </li>
            </ul>
          </div>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3 text-[#004494]">정책 수립 지원</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>단계별 가이드라인</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>과제 도출 및 관리 도구</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>우수 사례 데이터베이스</span>
              </li>
            </ul>
          </div>
          <div className="bg-white border rounded-lg p-5">
            <h4 className="font-semibold mb-3 text-[#004494]">이행 모니터링</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>성과지표 관리</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>진행상황 추적</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#004494]">•</span>
                <span>평가 및 환류 체계</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    )
  },
  'platform-2': {
    title: '주요 기능',
    content: (
      <div className="space-y-4">
        <p className="text-gray-700 leading-relaxed">
          플랫폼은 기후 적응 대책 수립의 전 과정을 지원하는 다양한 기능을 제공합니다.
        </p>
        <div className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-[#004494] p-4 rounded">
            <h4 className="font-semibold mb-2">1. 기후 데이터 분석 시스템</h4>
            <p className="text-sm text-gray-700">
              지역별 기후변화 시나리오, 과거 기후 데이터, 미래 전망 등을 제공하며, 
              사용자 친화적인 시각화 도구로 데이터를 쉽게 이해할 수 있습니다.
            </p>
          </div>
          <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded">
            <h4 className="font-semibold mb-2">2. 취약성 평가 도구</h4>
            <p className="text-sm text-gray-700">
              지역의 기후 취약성을 체계적으로 평가하고, 취약지역 및 취약계층을 식별하여 
              우선순위를 설정할 수 있도록 지원합니다.
            </p>
          </div>
          <div className="bg-purple-50 border-l-4 border-purple-600 p-4 rounded">
            <h4 className="font-semibold mb-2">3. 리빙랩 협업 공간</h4>
            <p className="text-sm text-gray-700">
              주민, 전문가, 공무원이 함께 소통하고 협업할 수 있는 온라인 공간을 제공하며, 
              의견 수렴, 투표, 토론 등 다양한 참여 기능을 지원합니다.
            </p>
          </div>
          <div className="bg-orange-50 border-l-4 border-orange-600 p-4 rounded">
            <h4 className="font-semibold mb-2">4. 정책 과제 관리 시스템</h4>
            <p className="text-sm text-gray-700">
              적응대책 과제를 체계적으로 관리하고, 이행 진도를 추적하며, 
              성과를 평가할 수 있는 통합 관리 시스템을 제공합니다.
            </p>
          </div>
          <div className="bg-teal-50 border-l-4 border-teal-600 p-4 rounded">
            <h4 className="font-semibold mb-2">5. 지식 공유 네트워크</h4>
            <p className="text-sm text-gray-700">
              다른 지자체의 우수 사례, 전문가 지식, 연구 자료 등을 공유하고 
              학습할 수 있는 네트워크를 구축합니다.
            </p>
          </div>
        </div>
      </div>
    )
  },
  'platform-3': {
    title: '사용 방법',
    content: (
      <div className="space-y-4">
        <p className="text-gray-700 leading-relaxed">
          플랫폼을 효과적으로 활용하여 기후 적응 대책을 수립하는 방법을 안내합니다.
        </p>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold">
              1
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">회원 가입 및 로그인</h4>
              <p className="text-sm text-gray-600">
                지자체 담당자는 회원 가입 후 소속 기관 정보를 등록하여 플랫폼에 접근할 수 있습니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold">
              2
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">지역 설정 및 프로젝트 생성</h4>
              <p className="text-sm text-gray-600">
                담당 지역을 설정하고 새로운 적응대책 수립 프로젝트를 생성합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold">
              3
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">기후 데이터 조회 및 분석</h4>
              <p className="text-sm text-gray-600">
                지역의 기후변화 데이터를 조회하고, 분석 도구를 활용하여 리스크를 파악합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold">
              4
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">리빙랩 운영</h4>
              <p className="text-sm text-gray-600">
                주민 참여형 리빙랩을 개설하고, 참여자를 초대하여 의견을 수렴합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold">
              5
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">과제 수립 및 등록</h4>
              <p className="text-sm text-gray-600">
                도출된 과제를 시스템에 등록하고, 세부 이행 계획을 작성합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-[#004494] text-white rounded-full flex items-center justify-center font-semibold">
              6
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">모니터링 및 평가</h4>
              <p className="text-sm text-gray-600">
                과제 이행 상황을 주기적으로 점검하고, 성과를 평가하여 개선합니다.
              </p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 border rounded-lg p-4 mt-4">
          <p className="text-sm text-gray-700">
            <strong>도움말:</strong> 각 메뉴별로 상세한 사용 가이드가 제공되며, 
            문의사항이 있을 경우 플랫폼 내 고객지원 센터를 통해 지원을 받을 수 있습니다.
          </p>
        </div>
      </div>
    )
  }
};

export function MainContent({ selectedItem }: MainContentProps) {
  const content = contentData[selectedItem] || contentData['1'];

  return (
    <div className="bg-white border rounded-lg p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {content.title}
      </h1>
      <div className="prose max-w-none">
        {content.content}
      </div>
    </div>
  );
}
