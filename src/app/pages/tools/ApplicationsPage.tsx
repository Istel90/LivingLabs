import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { Laptop, ArrowLeft, Download, Monitor } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent } from '../../components/ui/card';

export function ApplicationsPage() {
  const applications = [
    {
      id: 1,
      category: '계획수립부서용',
      title: '적응대책 수립 지원 시스템',
      description: '적응대책 수립 전 과정을 지원하는 통합 관리 시스템',
      features: ['계획 수립 단계별 가이드', '데이터 분석 및 시각화', '보고서 자동 생성'],
      platform: 'Windows 10/11, macOS',
      version: 'v3.2',
      updateDate: '2024.12',
    },
    {
      id: 2,
      category: '계획수립부서용',
      title: '기후위기 리스크 평가 도구',
      description: '지역별 기후위기 리스크를 평가하고 우선순위를 도출하는 프로그램',
      features: ['취약성 평가', '리스크 매핑', '시나리오 분석'],
      platform: 'Windows 10/11',
      version: 'v2.5',
      updateDate: '2024.11',
    },
    {
      id: 3,
      category: '계획수립부서용',
      title: '리빙랩 운영 관리 플랫폼',
      description: '리빙랩 기획부터 운영, 결과 관리까지 전 과정을 지원하는 웹 기반 플랫폼',
      features: ['참여자 관리', '회의록 작성', '의견 수렴 및 분석', '성과 관리'],
      platform: '웹 브라우저 (Chrome, Edge 권장)',
      version: 'v1.8',
      updateDate: '2024.12',
    },
    {
      id: 4,
      category: '사업소관부서용',
      title: '적응사업 이행점검 시스템',
      description: '적응사업의 이행 현황을 점검하고 성과를 평가하는 시스템',
      features: ['사업 진행상황 추적', '성과지표 관리', '이행점검 보고서 생성'],
      platform: 'Windows 10/11, 웹',
      version: 'v2.1',
      updateDate: '2024.11',
    },
    {
      id: 5,
      category: '사업소관부서용',
      title: '모니터링 데이터 수집 앱',
      description: '현장에서 모니터링 데이터를 수집하고 실시간으로 전송하는 모바일 앱',
      features: ['GPS 위치정보 기록', '사진 및 메모 첨부', '실시간 데이터 동기화'],
      platform: 'Android 9+, iOS 14+',
      version: 'v1.5',
      updateDate: '2024.10',
    },
    {
      id: 6,
      category: '사업소관부서용',
      title: '예산 및 성과 관리 도구',
      description: '적응사업 예산 집행과 성과를 통합 관리하는 프로그램',
      features: ['예산 계획 및 집행 관리', '성과지표 모니터링', '대시보드 제공'],
      platform: 'Windows 10/11',
      version: 'v1.2',
      updateDate: '2024.09',
    },
    {
      id: 7,
      category: '공통',
      title: '적응대책 통합 데이터베이스',
      description: '지자체 적응대책 관련 모든 데이터를 통합 관리하는 데이터베이스 시스템',
      features: ['데이터 통합 관리', '검색 및 조회', '권한별 접근 제어', 'API 제공'],
      platform: '서버 기반 (웹 접속)',
      version: 'v2.0',
      updateDate: '2024.12',
    },
    {
      id: 8,
      category: '공통',
      title: '시민참여 의견수렴 플랫폼',
      description: '시민들의 의견을 수렴하고 분석하는 온라인 플랫폼',
      features: ['설문조사 작성 및 배포', '의견 수렴 및 분석', '결과 시각화'],
      platform: '웹 브라우저',
      version: 'v1.6',
      updateDate: '2024.11',
    },
  ];

  const categories = ['전체', '계획수립부서용', '사업소관부서용', '공통'];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {/* Back Button */}
          <Link 
            to="/tools" 
            className="inline-flex items-center gap-2 text-[#004494] hover:underline mb-6"
          >
            <ArrowLeft className="size-4" />
            지원도구 목록으로 돌아가기
          </Link>

          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 via-teal-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
                <Laptop className="size-8 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">App or 프로그램</h1>
                <p className="text-lg text-gray-600 mt-1">지자체 사용자 대상의 개별 프로그램</p>
              </div>
            </div>
            
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6">
              <h2 className="font-bold text-gray-900 mb-2">개요</h2>
              <p className="text-gray-700 mb-4">
                지자체 담당자가 업무에 바로 활용할 수 있는 전용 애플리케이션과 프로그램을 제공합니다. 
                계획수립부서와 사업소관부서의 업무 특성에 맞춰 설계된 도구들로 
                효율적인 적응대책 수립과 이행을 지원합니다.
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>계획수립부서용: 적응대책 수립, 리스크 평가, 리빙랩 운영 관리</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>사업소관부서용: 이행점검, 모니터링, 성과 관리</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>데스크톱, 웹, 모바일 등 다양한 플랫폼 지원</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>사용자 매뉴얼 및 교육 자료 제공</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Category Filter */}
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  className={`px-4 py-2 rounded-full text-sm transition-colors ${
                    category === '전체'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-gray-300 hover:border-emerald-600 hover:text-emerald-600'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Applications List */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">프로그램 목록</h2>
            
            {applications.map((app) => (
              <Card key={app.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                          {app.category}
                        </span>
                        <span className="text-xs text-gray-500">{app.version}</span>
                      </div>
                      
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{app.title}</h3>
                      <p className="text-gray-600 mb-3">{app.description}</p>
                      
                      <div className="mb-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">주요 기능</h4>
                        <div className="flex flex-wrap gap-2">
                          {app.features.map((feature, index) => (
                            <span 
                              key={index}
                              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <Monitor className="size-4" />
                          <span>{app.platform}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">갱신일:</span>
                          <span>{app.updateDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 ml-4">
                      <button className="px-4 py-2 bg-[#004494] text-white rounded hover:bg-[#003366] transition-colors flex items-center gap-2 whitespace-nowrap">
                        <Download className="size-4" />
                        다운로드
                      </button>
                      <button className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors whitespace-nowrap">
                        사용 가이드
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-12 bg-white rounded-lg border p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">프로그램 활용 안내</h2>
            <div className="grid md:grid-cols-2 gap-6 text-gray-700">
              <div>
                <h3 className="font-bold mb-2">시스템 요구사항</h3>
                <p className="text-sm mb-2">
                  각 프로그램의 원활한 사용을 위해 다음 사양을 권장합니다:
                </p>
                <ul className="text-sm space-y-1 ml-4">
                  <li>• Windows 10/11 또는 macOS 11 이상</li>
                  <li>• RAM 8GB 이상</li>
                  <li>• 인터넷 연결 (일부 프로그램)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold mb-2">설치 및 라이선스</h3>
                <p className="text-sm">
                  모든 프로그램은 무료로 제공되며, 지자체 담당자는 별도 승인 없이 
                  다운로드하여 사용할 수 있습니다. 상업적 사용은 제한됩니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">교육 및 지원</h3>
                <p className="text-sm">
                  프로그램 사용을 위한 온라인 교육과 사용자 매뉴얼을 제공합니다. 
                  기술 지원이 필요한 경우 헬프데스크를 통해 문의할 수 있습니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">업데이트</h3>
                <p className="text-sm">
                  프로그램은 정기적으로 업데이트되며, 새로운 기능과 개선사항이 
                  지속적으로 추가됩니다. 자동 업데이트 기능을 활성화하는 것을 권장합니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
