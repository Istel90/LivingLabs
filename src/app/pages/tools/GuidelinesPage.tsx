import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { BookOpen, ArrowLeft, Download, FileText } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent } from '../../components/ui/card';

export function GuidelinesPage() {
  const guidelines = [
    {
      id: 1,
      category: '리빙랩 운영',
      title: '리빙랩 기획 및 운영 가이드라인',
      description: '리빙랩의 기획, 구성, 운영 전반에 대한 단계별 가이드',
      pages: 45,
      version: 'v2.0',
      updateDate: '2024.12',
    },
    {
      id: 2,
      category: '리빙랩 운영',
      title: '시민참여 방법론 가이드',
      description: '효과적인 시민참여를 위한 다양한 방법론 및 사례',
      pages: 32,
      version: 'v1.5',
      updateDate: '2024.11',
    },
    {
      id: 3,
      category: '적응대책 반영',
      title: '리빙랩 결과의 적응대책 반영 가이드라인',
      description: '리빙랩 성과를 적응대책에 체계적으로 반영하기 위한 방법 및 최소 기준',
      pages: 28,
      version: 'v2.1',
      updateDate: '2024.12',
    },
    {
      id: 4,
      category: '적응대책 반영',
      title: '리빙랩 성과 평가 및 검증 매뉴얼',
      description: '리빙랩 결과의 타당성 검증 및 평가 절차',
      pages: 24,
      version: 'v1.0',
      updateDate: '2024.10',
    },
    {
      id: 5,
      category: '사례집',
      title: '국내 리빙랩 우수사례집',
      description: '국내 지자체 리빙랩 운영 우수사례 모음',
      pages: 68,
      version: 'v1.0',
      updateDate: '2024.09',
    },
    {
      id: 6,
      category: '사례집',
      title: '해외 기후적응 리빙랩 사례집',
      description: '유럽, 북미 등 해외 기후적응 리빙랩 사례 분석',
      pages: 52,
      version: 'v1.0',
      updateDate: '2024.08',
    },
    {
      id: 7,
      category: '퍼실리테이션',
      title: '리빙랩 퍼실리테이터 매뉴얼',
      description: '리빙랩 진행을 위한 퍼실리테이터 역량 및 기법',
      pages: 36,
      version: 'v1.2',
      updateDate: '2024.11',
    },
    {
      id: 8,
      category: '데이터 수집',
      title: '리빙랩 데이터 수집 및 분석 가이드',
      description: '리빙랩 과정에서의 데이터 수집 방법 및 분석 절차',
      pages: 40,
      version: 'v1.0',
      updateDate: '2024.10',
    },
  ];

  const categories = ['전체', '리빙랩 운영', '적응대책 반영', '사례집', '퍼실리테이션', '데이터 수집'];

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
              <div className="w-16 h-16 bg-gradient-to-br from-purple-400 via-pink-400 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                <BookOpen className="size-8 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">가이드라인</h1>
                <p className="text-lg text-gray-600 mt-1">적응대책 수립을 위한 시민참여 가이드</p>
              </div>
            </div>
            
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
              <h2 className="font-bold text-gray-900 mb-2">개요</h2>
              <p className="text-gray-700 mb-4">
                적응대책 수립을 위한 리빙랩 가이드라인과 개별 리빙랩 운영을 위한 실무 지침을 제공합니다. 
                리빙랩 결과를 적응대책에 효과적으로 반영하기 위한 방법론과 국내외 우수사례를 통해 
                실질적인 운영 노하우를 공유합니다.
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">•</span>
                  <span>리빙랩 결과를 적응대책에 반영하기 위한 방법 및 최소 기준</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">•</span>
                  <span>리빙랩 운영 및 계획을 위한 정보 제공</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">•</span>
                  <span>국내외 우수사례 분석 및 적용 방안</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">•</span>
                  <span>시민참여 방법론 및 퍼실리테이션 기법</span>
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
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-gray-300 hover:border-purple-600 hover:text-purple-600'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Guidelines List */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">가이드라인 목록</h2>
            
            {guidelines.map((guideline) => (
              <Card key={guideline.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                          {guideline.category}
                        </span>
                        <span className="text-xs text-gray-500">{guideline.version}</span>
                      </div>
                      
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{guideline.title}</h3>
                      <p className="text-gray-600 mb-3">{guideline.description}</p>
                      
                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4" />
                          <span>{guideline.pages} 페이지</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">갱신일:</span>
                          <span>{guideline.updateDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <button className="px-4 py-2 bg-[#004494] text-white rounded hover:bg-[#003366] transition-colors flex items-center gap-2">
                        <Download className="size-4" />
                        다운로드
                      </button>
                      <button className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                        미리보기
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-12 bg-white rounded-lg border p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">가이드라인 활용 안내</h2>
            <div className="space-y-4 text-gray-700">
              <div>
                <h3 className="font-bold mb-2">활용 방법</h3>
                <p className="text-sm">
                  각 가이드라인은 PDF 형식으로 제공되며, 지자체 담당자 및 리빙랩 운영자가 
                  실무에 바로 활용할 수 있도록 구성되어 있습니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">교육 및 컨설팅</h3>
                <p className="text-sm">
                  가이드라인 활용을 위한 교육 프로그램 및 전문가 컨설팅을 제공합니다. 
                  자세한 내용은 별도 문의 바랍니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">업데이트 안내</h3>
                <p className="text-sm">
                  가이드라인은 정기적으로 업데이트되며, 새로운 사례와 방법론이 지속적으로 추가됩니다.
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
