import { ImageWithFallback } from './common/ImageWithFallback';
import { Database, BarChart3, Map, FileText, TrendingUp, Users, ExternalLink } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Link } from 'react-router';

interface PlatformContentProps {
  selectedItem: string;
}

const platformContentData: Record<string, { title: string; content: JSX.Element }> = {
  'citizen-science-platform': {
    title: '시민과학 데이터 수집 플랫폼',
    content: (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-[#004494] to-blue-600 text-white rounded-lg p-8">
          <h2 className="text-3xl font-bold mb-3">시민과학 데이터 수집 플랫폼</h2>
          <p className="text-lg text-blue-100 mb-4">
            시민 참여형 기후 데이터 수집 및 공유 플랫폼
          </p>
        </div>
        
        <p className="text-gray-700 leading-relaxed">
          시민과학 데이터 수집 플랫폼은 지방자치단체의 효과적인 기후 적응 대책 수립을 위한 
          통합 지원 시스템으로, 시민들이 직접 참여하여 기후변화 데이터를 수집하고 공유할 수 있습니다.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
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
        </div>

        <ImageWithFallback
          src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaWdpdGFsJTIwcGxhdGZvcm18ZW58MXx8fHwxNzcyNTM1NzI2fDA&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Digital Platform"
          className="w-full h-64 object-cover rounded-lg"
        />

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-3">플랫폼 바로가기</h3>
          <p className="text-gray-700 mb-4">
            시민과학 데이터 수집 플랫폼에서 더 많은 기능과 정보를 확인하세요.
          </p>
          <Link to="/platform">
            <Button size="lg" className="gap-2">
              플랫폼 페이지로 이동
              <ExternalLink className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    )
  },
  'adaptation-support-tools': {
    title: '적응대책 지원도구',
    content: (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg p-8">
          <h2 className="text-3xl font-bold mb-3">적응대책 지원도구</h2>
          <p className="text-lg text-green-100 mb-4">
            기후위기 적응대책 수립을 위한 의사결정 지원도구
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-3">지원도구 바로가기</h3>
          <p className="text-gray-700 mb-4">
            적응대책 수립을 위한 다양한 지원도구를 확인하고 활용하세요.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="http://128.134.187.146:6080/living-lab/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" className="gap-2">
                주관부서 적응대책 지원도구 바로가기
                <ExternalLink className="size-4" />
              </Button>
            </a>
            <a
              href="https://henjinic.github.io/testpage/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" variant="outline" className="gap-2 bg-white">
                사업소관부서 지원도구 바로가기
                <ExternalLink className="size-4" />
              </Button>
            </a>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-blue-200">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="size-6 text-blue-700" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">주관부서 도구 설명</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                적응대책 수립을 총괄하는 주관부서가 지역 현황과 기후위기 리스크를 검토하고,
                부문별 사업을 구성·관리할 수 있도록 지원합니다.
              </p>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                <li>• 지역 현황 및 기후위기 리스크 검토</li>
                <li>• 적응대책 세부사업 구성 및 관리</li>
                <li>• 부서별 추진 현황 종합 및 점검</li>
              </ul>
              <a
                href="http://127.0.0.1:4174/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="lg" variant="outline" className="gap-2">
                  독립 설문 플랫폼 바로가기
                  <ExternalLink className="size-4" />
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card className="border-emerald-200">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Users className="size-6 text-emerald-700" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">사업소관부서 도구 설명</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                개별 적응사업을 담당하는 사업소관부서가 사업 내용을 작성하고 추진 실적과
                성과를 체계적으로 관리할 수 있도록 지원합니다.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• 부서별 적응사업 계획 작성</li>
                <li>• 사업 추진 실적 및 성과 입력</li>
                <li>• 이행 현황 확인 및 결과 관리</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
};

export function PlatformContent({ selectedItem }: PlatformContentProps) {
  const content = platformContentData[selectedItem];
  
  if (!content) return null;

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
