import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { LineChart, ArrowLeft, Download, Code } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent } from '../../components/ui/card';

export function AnalysisToolsPage() {
  const tools = [
    {
      id: 1,
      category: '엑셀 도구',
      title: '취약성 평가 분석 도구',
      description: '기후변화 취약성을 평가하고 지수를 산정하는 엑셀 기반 분석 도구',
      platform: 'Excel 2016 이상',
      level: '초급',
      updateDate: '2024.12',
    },
    {
      id: 2,
      category: '엑셀 도구',
      title: '적응사업 우선순위 평가 도구',
      description: '다양한 평가기준을 활용한 적응사업 우선순위 도출 템플릿',
      platform: 'Excel 2016 이상',
      level: '초급',
      updateDate: '2024.11',
    },
    {
      id: 3,
      category: '엑셀 도구',
      title: '비용편익 분석 템플릿',
      description: '적응사업의 경제성 분석을 위한 비용편익 분석 도구',
      platform: 'Excel 2019 이상',
      level: '중급',
      updateDate: '2024.10',
    },
    {
      id: 4,
      category: 'Python 도구',
      title: '기후데이터 시각화 패키지',
      description: '기후변화 시나리오 데이터를 분석하고 시각화하는 Python 패키지',
      platform: 'Python 3.8+',
      level: '중급',
      updateDate: '2024.12',
    },
    {
      id: 5,
      category: 'Python 도구',
      title: '공간분석 자동화 스크립트',
      description: 'GIS 데이터 전처리 및 공간분석을 자동화하는 Python 스크립트',
      platform: 'Python 3.9+',
      level: '고급',
      updateDate: '2024.11',
    },
    {
      id: 6,
      category: 'Python 도구',
      title: '리스크 지도 생성 도구',
      description: '취약성과 위험도 데이터를 활용한 리스크 지도 자동 생성 도구',
      platform: 'Python 3.8+',
      level: '중급',
      updateDate: '2024.10',
    },
    {
      id: 7,
      category: 'R 도구',
      title: '통계분석 패키지',
      description: '기후변화 영향 분석을 위한 R 기반 통계분석 패키지',
      platform: 'R 4.0+',
      level: '중급',
      updateDate: '2024.09',
    },
    {
      id: 8,
      category: 'Python 도구',
      title: '시계열 데이터 분석 도구',
      description: '기후 및 기상 시계열 데이터 분석 및 예측 도구',
      platform: 'Python 3.9+',
      level: '고급',
      updateDate: '2024.11',
    },
  ];

  const categories = ['전체', '엑셀 도구', 'Python 도구', 'R 도구'];
  const levels = ['전체', '초급', '중급', '고급'];

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
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 via-blue-400 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg">
                <LineChart className="size-8 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">분석도구</h1>
                <p className="text-lg text-gray-600 mt-1">적응사업의 평가를 위한 간단한 분석 도구</p>
              </div>
            </div>
            
            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-6">
              <h2 className="font-bold text-gray-900 mb-2">개요</h2>
              <p className="text-gray-700 mb-4">
                적응대책 수립과 이행평가에 필요한 다양한 분석 도구를 제공합니다. 
                엑셀 기반의 간편한 도구부터 Python, R을 활용한 고급 분석 도구까지 
                사용자의 수준과 목적에 맞는 도구를 선택하여 활용할 수 있습니다.
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-600 mt-1">•</span>
                  <span>별도 정보 및 지도를 생산하기 위한 분석 도구</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-600 mt-1">•</span>
                  <span>엑셀 기반 간편 분석 도구 (코딩 불필요)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-600 mt-1">•</span>
                  <span>Python/R 기반 고급 분석 도구 (소스코드 제공)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-600 mt-1">•</span>
                  <span>상세한 사용 매뉴얼 및 예제 데이터 포함</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">도구 유형</h3>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    className={`px-4 py-2 rounded-full text-sm transition-colors ${
                      category === '전체'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-white border border-gray-300 hover:border-cyan-600 hover:text-cyan-600'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">난이도</h3>
              <div className="flex flex-wrap gap-2">
                {levels.map((level) => (
                  <button
                    key={level}
                    className={`px-4 py-2 rounded-full text-sm transition-colors ${
                      level === '전체'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-white border border-gray-300 hover:border-cyan-600 hover:text-cyan-600'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tools List */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">분석도구 목록</h2>
            
            {tools.map((tool) => (
              <Card key={tool.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-3 py-1 bg-cyan-100 text-cyan-700 text-xs font-medium rounded-full">
                          {tool.category}
                        </span>
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                          tool.level === '초급' ? 'bg-green-100 text-green-700' :
                          tool.level === '중급' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {tool.level}
                        </span>
                      </div>
                      
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{tool.title}</h3>
                      <p className="text-gray-600 mb-3">{tool.description}</p>
                      
                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <Code className="size-4" />
                          <span>{tool.platform}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">갱신일:</span>
                          <span>{tool.updateDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <button className="px-4 py-2 bg-[#004494] text-white rounded hover:bg-[#003366] transition-colors flex items-center gap-2">
                        <Download className="size-4" />
                        다운로드
                      </button>
                      <button className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                        매뉴얼
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-12 bg-white rounded-lg border p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">분석도구 활용 안내</h2>
            <div className="grid md:grid-cols-2 gap-6 text-gray-700">
              <div>
                <h3 className="font-bold mb-2">엑셀 도구</h3>
                <p className="text-sm">
                  별도 프로그래밍 지식 없이 엑셀만으로 분석 가능합니다. 
                  데이터를 입력하면 자동으로 계산되며, 그래프와 표로 결과를 제공합니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">Python/R 도구</h3>
                <p className="text-sm">
                  고급 분석과 대용량 데이터 처리가 가능합니다. 
                  소스코드와 예제가 함께 제공되며, 사용자가 필요에 맞게 수정할 수 있습니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">설치 및 사용</h3>
                <p className="text-sm">
                  각 도구는 상세한 설치 가이드와 사용 매뉴얼을 포함하고 있습니다. 
                  예제 데이터를 활용하여 실습해 볼 수 있습니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">기술 지원</h3>
                <p className="text-sm">
                  도구 사용 중 문제가 발생하거나 추가 기능이 필요한 경우 
                  기술 지원을 받을 수 있습니다.
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
