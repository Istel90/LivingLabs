import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { mockProject } from '../../data/mockData';
import { CloudRain, Users, BarChart3, Shield, ArrowRight } from 'lucide-react';

interface HomePageProps {
  onSelectRole: (role: 'admin' | 'respondent') => void;
}

export function HomePage({ onSelectRole }: HomePageProps) {
  return (
    <div className="min-h-screen bg-[#f4f8f9]">
      {/* Hero Section */}
      <div className="bg-[#073f4d] text-white">
      <div className="max-w-7xl mx-auto px-8 pt-20 pb-16">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <CloudRain className="w-12 h-12 text-[#86efac]" />
            <h1 className="text-4xl">기후변화 리스크 설문 플랫폼</h1>
          </div>
          <p className="text-xl text-white/75 mb-8">
            현황정보 배포, 부서별 응답 수집, 결과 검토와 최종 요약까지 연결하는 협업 플랫폼
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#bbf7d0] border border-white/15">
            <Shield className="w-4 h-4" />
            <span>공공기관 전용 플랫폼</span>
          </div>
        </div>
      </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 -mt-10 pb-16">
        {/* Current Project Info */}
        <Card className="mb-12 p-8 bg-white/95 backdrop-blur shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-muted-foreground mb-2">현재 진행 중인 프로젝트</div>
              <h2 className="mb-2">{mockProject.name}</h2>
              <div className="flex items-center gap-6 text-muted-foreground">
                <span>{mockProject.region}</span>
                <span>설문 기간: {mockProject.startDate} ~ {mockProject.endDate}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl mb-1 text-primary">
                {Math.round((mockProject.submittedResponses / (mockProject.totalRisks * 2)) * 100)}%
              </div>
              <div className="text-muted-foreground">진행률</div>
            </div>
          </div>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-3 gap-6 mb-12">
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="mb-2">체계적 리스크 관리</h3>
            <p className="text-muted-foreground">
              부문별, 세부부문별 리스크를 구조화하여 관리하고 우선순위를 평가합니다.
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="mb-2">부서 간 협업</h3>
            <p className="text-muted-foreground">
              관련 부서에 리스크를 배정하고 전문가 의견을 수렴하여 종합 평가합니다.
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <CloudRain className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="mb-2">지도 기반 분석</h3>
            <p className="text-muted-foreground">
              지리정보와 현황정보를 통합하여 공간적 리스크 분포를 시각화합니다.
            </p>
          </Card>
        </div>

        {/* Role Selection */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center mb-8">역할 선택</h2>
          <div className="grid grid-cols-2 gap-6">
            <Card className="p-8 hover:shadow-xl transition-all hover:border-primary cursor-pointer group">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <h3 className="mb-3">주관부서 관리자</h3>
                <p className="text-muted-foreground mb-6">
                  리스크 관리, 부서 배정, 응답 결과 검토 및 확정
                </p>
                <ul className="text-sm text-muted-foreground mb-6 space-y-2">
                  <li>✓ 지역 리스크 작성 및 관리</li>
                  <li>✓ 관련 부서 배정</li>
                  <li>✓ 응답 결과 검토 및 확정</li>
                  <li>✓ 최종 우선순위 결정</li>
                </ul>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => onSelectRole('admin')}
                >
                  관리자로 시작하기
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all hover:border-primary cursor-pointer group">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-600/20 transition-colors">
                  <Users className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="mb-3">응답부서 담당자</h3>
                <p className="text-muted-foreground mb-6">
                  배정된 리스크에 대한 설문 응답 및 의견 제출
                </p>
                <ul className="text-sm text-muted-foreground mb-6 space-y-2">
                  <li>✓ 배정된 리스크 확인</li>
                  <li>✓ 현황정보 및 지도 확인</li>
                  <li>✓ 설문 응답 작성</li>
                  <li>✓ 응답 제출 및 수정</li>
                </ul>
                <Button
                  variant="outline"
                  className="w-full border-blue-600 text-blue-600 hover:bg-blue-50"
                  onClick={() => onSelectRole('respondent')}
                >
                  응답자로 시작하기
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border mt-16 py-8">
        <div className="max-w-7xl mx-auto px-8 text-center text-muted-foreground">
          <p>© 2026 기후변화 리스크 설문 플랫폼. 지자체 기후대응 업무 지원 시스템</p>
        </div>
      </div>
    </div>
  );
}
