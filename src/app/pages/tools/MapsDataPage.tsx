import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { Layers, ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent } from '../../components/ui/card';

export function MapsDataPage() {
  const tools = [
    {
      id: 1,
      title: '기후변화 시나리오 데이터',
      description: '미래 기후변화 전망 데이터 (RCP 시나리오 기반)',
      format: 'GeoJSON, Shapefile',
      updateDate: '2024.12',
    },
    {
      id: 2,
      title: '취약성 평가 공간정보',
      description: '지역별 기후위기 취약성 평가를 위한 공간데이터',
      format: 'GeoJSON, CSV',
      updateDate: '2024.11',
    },
    {
      id: 3,
      title: '리스크 지도',
      description: '폭염, 한파, 홍수 등 기후위기 리스크 분포 지도',
      format: 'GeoTIFF, WMS',
      updateDate: '2024.10',
    },
    {
      id: 4,
      title: '인구 및 사회경제 데이터',
      description: '지역별 인구구조, 취약계층 분포 등 사회경제 데이터',
      format: 'CSV, Excel',
      updateDate: '2024.09',
    },
    {
      id: 5,
      title: '토지이용 현황 데이터',
      description: '토지피복, 토지이용계획 등 공간정보',
      format: 'Shapefile, GeoJSON',
      updateDate: '2024.08',
    },
    {
      id: 6,
      title: '기상관측 데이터',
      description: '과거 및 실시간 기상관측 데이터',
      format: 'CSV, JSON',
      updateDate: '2024.12',
    },
  ];

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
              <div className="w-16 h-16 bg-gradient-to-br from-blue-400 via-purple-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                <Layers className="size-8 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Maps & DATA</h1>
                <p className="text-lg text-gray-600 mt-1">적응대책 수립을 위한 데이터(지도)</p>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="font-bold text-gray-900 mb-2">개요</h2>
              <p className="text-gray-700 mb-4">
                지역의 현황 분석 및 지역 리스크 도출에 활용되는 데이터 및 지도를 제공합니다. 
                기후변화 시나리오, 취약성 평가, 리스크 분포 등 다양한 공간정보와 통계 데이터를 
                통해 효과적인 적응대책 수립을 지원합니다.
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>기후변화 전망 및 시나리오 데이터</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>지역별 취약성 및 리스크 평가 자료</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>인구·사회·경제 통계 데이터</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>토지이용 및 공간정보</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Tools List */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">제공 데이터 목록</h2>
            
            {tools.map((tool) => (
              <Card key={tool.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{tool.title}</h3>
                      <p className="text-gray-600 mb-3">{tool.description}</p>
                      
                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">형식:</span>
                          <span>{tool.format}</span>
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
                      <button className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center gap-2">
                        <ExternalLink className="size-4" />
                        상세보기
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-12 bg-white rounded-lg border p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">데이터 이용 안내</h2>
            <div className="space-y-4 text-gray-700">
              <div>
                <h3 className="font-bold mb-2">데이터 활용 방법</h3>
                <p className="text-sm">
                  제공되는 데이터는 GIS 소프트웨어(QGIS, ArcGIS 등)를 통해 활용할 수 있으며, 
                  일부 데이터는 엑셀이나 통계 프로그램에서도 사용 가능합니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">이용 제한</h3>
                <p className="text-sm">
                  데이터는 비영리 목적의 연구 및 정책 수립에 자유롭게 활용 가능합니다. 
                  상업적 이용 시 별도 승인이 필요할 수 있습니다.
                </p>
              </div>
              <div>
                <h3 className="font-bold mb-2">문의</h3>
                <p className="text-sm">
                  데이터 관련 문의사항은 서울시립대학교 기후위기 적응연구센터로 연락주시기 바랍니다.
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
