import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { FileText, Database, TrendingUp, Users, BarChart3, Map } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';

export function PlatformPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {/* Hero Section */}
          <div className="bg-gradient-to-r from-[#004494] to-blue-600 text-white rounded-lg p-12 mb-8">
            <h1 className="text-4xl font-bold mb-4">기후위기 적응 플랫폼</h1>
            <p className="text-xl text-blue-100 mb-6">
              데이터 기반 기후 적응 의사결정 지원 통합 플랫폼
            </p>
            <Button size="lg" variant="secondary">
              플랫폼 바로가기 →
            </Button>
          </div>

          {/* Platform Features */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">플랫폼 주요 기능</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                      <Database className="size-8 text-[#004494]" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">기후 데이터 통합</h3>
                    <p className="text-sm text-gray-600">
                      국가 및 지역 기후 데이터를 통합하여 실시간으로 제공합니다
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                      <BarChart3 className="size-8 text-green-700" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">리스크 분석 도구</h3>
                    <p className="text-sm text-gray-600">
                      지역별 기후 리스크를 자동으로 분석하고 시각화합니다
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                      <Map className="size-8 text-purple-700" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">취약성 지도</h3>
                    <p className="text-sm text-gray-600">
                      GIS 기반 취약지역 및 취약계층 분포를 시각화합니다
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                      <FileText className="size-8 text-amber-700" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">대책 수립 지원</h3>
                    <p className="text-sm text-gray-600">
                      템플릿과 가이드를 제공하여 적응대책 수립을 지원합니다
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                      <TrendingUp className="size-8 text-red-700" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">이행 모니터링</h3>
                    <p className="text-sm text-gray-600">
                      대책 이행 현황을 추적하고 성과를 측정합니다
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                      <Users className="size-8 text-indigo-700" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">협업 공간</h3>
                    <p className="text-sm text-gray-600">
                      지자체, 전문가, 주민이 함께 협력할 수 있는 공간을 제공합니다
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Platform Modules */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">플랫폼 구성</h2>
            <div className="space-y-4">
              <div className="bg-white border rounded-lg p-6">
                <h3 className="font-bold text-lg mb-2">1. 기후정보 포털</h3>
                <p className="text-sm text-gray-600 mb-3">
                  기후변화 시나리오, 관측 데이터, 전망 정보 등 종합 기후정보 제공
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">기후 시나리오</span>
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">관측 데이터</span>
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">전망 정보</span>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-6">
                <h3 className="font-bold text-lg mb-2">2. 리스크 평가 모듈</h3>
                <p className="text-sm text-gray-600 mb-3">
                  지역별 기후 리스크를 평가하고 취약성을 진단하는 도구
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-green-50 text-green-700 text-xs rounded-full">영향 평가</span>
                  <span className="px-3 py-1 bg-green-50 text-green-700 text-xs rounded-full">취약성 진단</span>
                  <span className="px-3 py-1 bg-green-50 text-green-700 text-xs rounded-full">우선순위 분석</span>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-6">
                <h3 className="font-bold text-lg mb-2">3. 대책 관리 시스템</h3>
                <p className="text-sm text-gray-600 mb-3">
                  적응대책 수립부터 이행, 모니터링까지 전 과정을 관리
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">과제 관리</span>
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">예산 추적</span>
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">성과 측정</span>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-6">
                <h3 className="font-bold text-lg mb-2">4. 리빙랩 지원 도구</h3>
                <p className="text-sm text-gray-600 mb-3">
                  주민 참여형 적응대책 발굴 및 실행을 위한 리빙랩 운영 지원
                </p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs rounded-full">주민 참여</span>
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs rounded-full">현장 실험</span>
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs rounded-full">피드백 수집</span>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
            <h3 className="text-2xl font-bold text-gray-900 mb-3">플랫폼 이용 안내</h3>
            <p className="text-gray-700 mb-6">
              기후위기 적응 플랫폼은 지방자치단체 담당자를 위한 전문 도구입니다.<br />
              이용을 원하시면 관리자에게 문의하여 계정을 발급받으시기 바랍니다.
            </p>
            <div className="flex gap-3 justify-center">
              <Button size="lg">
                계정 신청하기
              </Button>
              <Button size="lg" variant="outline">
                데모 영상 보기
              </Button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
