import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { RightSidebar } from '../components/RightSidebar';
import { PlatformContent } from '../components/PlatformContent';
import { Layers, BookOpen, LineChart, Laptop } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent } from '../components/ui/card';
import { useState } from 'react';

export function ToolsPage() {
  const [platformSelectedItem, setPlatformSelectedItem] = useState('');

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-[1fr_280px] gap-6">
            <div>
              {platformSelectedItem ? (
                <PlatformContent selectedItem={platformSelectedItem} />
              ) : (
                <>
                  {/* Title Section */}
                  <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                      기후위기 적응대책 수립을 위한 의사결정 지원도구란?
                    </h1>
                    <p className="text-lg text-gray-600">개요설명 (작성필요)</p>
                  </div>

                  {/* Tools Grid */}
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Maps & DATA */}
                    <Link to="/tools/maps-data">
                      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                        <CardContent className="pt-6">
                          <div className="flex flex-col items-center text-center">
                            <div className="relative mb-6">
                              <div className="w-32 h-32 bg-gradient-to-br from-blue-400 via-purple-400 to-blue-600 rounded-lg flex items-center justify-center shadow-xl transform hover:scale-105 transition-transform">
                                <Layers className="size-16 text-white" strokeWidth={1.5} />
                              </div>
                            </div>
                            
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Maps & DATA</h3>
                            <p className="text-sm text-gray-700 font-medium mb-3">
                              적응대책 수립을 위한 데이터(지도)
                            </p>
                            
                            <ul className="text-sm text-gray-600 space-y-2 text-left w-full">
                              <li className="flex items-start gap-2">
                                <span className="text-blue-600 mt-1">−</span>
                                <span>지역의 현황 분석 및 지역 리스크 도출에 활용되는 데이터 및 지도</span>
                              </li>
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>

                    {/* 가이드라인 */}
                    <Link to="/tools/guidelines">
                      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                        <CardContent className="pt-6">
                          <div className="flex flex-col items-center text-center">
                            <div className="relative mb-6">
                              <div className="w-32 h-32 bg-gradient-to-br from-purple-400 via-pink-400 to-purple-600 rounded-lg flex items-center justify-center shadow-xl transform hover:scale-105 transition-transform">
                                <BookOpen className="size-16 text-white" strokeWidth={1.5} />
                              </div>
                            </div>
                            
                            <h3 className="text-xl font-bold text-gray-900 mb-3">가이드라인</h3>
                            <p className="text-sm text-gray-700 font-medium mb-3">
                              적응대책 수립을 위한 시민미디어터
                            </p>
                            
                            <ul className="text-sm text-gray-600 space-y-2 text-left w-full">
                              <li className="flex items-start gap-2">
                                <span className="text-purple-600 mt-1">−</span>
                                <span>적응대책 수립을 위한 리빙랩 가이드라인(리빙랩 결과를 적응대책에 반영하기 위한 방법 및 최소 기준)</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-purple-600 mt-1">−</span>
                                <span>개별 리빙랩을 위한 가이드라인(리빙랩 운영 및 계획을 위한 정보 제공 및 사례 설명)</span>
                              </li>
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>

                    {/* 분석도구 */}
                    <Link to="/tools/analysis">
                      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                        <CardContent className="pt-6">
                          <div className="flex flex-col items-center text-center">
                            <div className="relative mb-6">
                              <div className="w-32 h-32 bg-gradient-to-br from-cyan-400 via-blue-400 to-cyan-600 rounded-lg flex items-center justify-center shadow-xl transform hover:scale-105 transition-transform">
                                <LineChart className="size-16 text-white" strokeWidth={1.5} />
                              </div>
                            </div>
                            
                            <h3 className="text-xl font-bold text-gray-900 mb-3">분석도구</h3>
                            <p className="text-sm text-gray-700 font-medium mb-3">
                              적응사업의 평가를 위한 간단한 분석 도구(엑셀 및 파이썬)
                            </p>
                            
                            <ul className="text-sm text-gray-600 space-y-2 text-left w-full">
                              <li className="flex items-start gap-2">
                                <span className="text-cyan-600 mt-1">−</span>
                                <span>별도 정보 및 지도를 생산 하기 위한 분석 도구</span>
                              </li>
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>

                    {/* App or 프로그램 */}
                    <Link to="/tools/applications">
                      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                        <CardContent className="pt-6">
                          <div className="flex flex-col items-center text-center">
                            <div className="relative mb-6">
                              <div className="w-32 h-32 bg-gradient-to-br from-emerald-400 via-teal-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-xl transform hover:scale-105 transition-transform">
                                <Laptop className="size-16 text-white" strokeWidth={1.5} />
                              </div>
                            </div>
                            
                            <h3 className="text-xl font-bold text-gray-900 mb-3">App or 프로그램</h3>
                            <p className="text-sm text-gray-700 font-medium mb-3">
                              지자체 사용자 대상의 개별 프로그램
                            </p>
                            
                            <ul className="text-sm text-gray-600 space-y-2 text-left w-full">
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-600 mt-1">−</span>
                                <span>계획수립부서용</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-600 mt-1">−</span>
                                <span>사업소관부서용</span>
                              </li>
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </div>

                  {/* Additional Information */}
                  <div className="mt-12 bg-white rounded-lg border p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">지원도구 활용 안내</h2>
                    <div className="space-y-4 text-gray-700">
                      <p>
                        의사결정 지원도구는 지방자치단체가 기후위기 적응대책을 효과적으로 수립하고 이행할 수 있도록 
                        다양한 형태의 도구와 자료를 제공합니다.
                      </p>
                      <div className="grid md:grid-cols-2 gap-6 mt-6">
                        <div className="space-y-2">
                          <h3 className="font-bold text-lg">데이터 및 지도</h3>
                          <p className="text-sm text-gray-600">
                            지역 현황 분석과 리스크 평가에 필요한 공간정보와 통계 데이터를 제공합니다.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-bold text-lg">가이드라인</h3>
                          <p className="text-sm text-gray-600">
                            리빙랩 운영과 적응대책 수립 과정에서 참고할 수 있는 지침과 사례를 제공합니다.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-bold text-lg">분석도구</h3>
                          <p className="text-sm text-gray-600">
                            엑셀 및 파이썬 기반의 간단한 분석 도구로 사업 평가와 데이터 분석을 지원합니다.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-bold text-lg">전용 프로그램</h3>
                          <p className="text-sm text-gray-600">
                            계획수립부서와 사업소관부서를 위한 맞춤형 애플리케이션을 제공합니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <RightSidebar selectedItem={platformSelectedItem} onSelectItem={setPlatformSelectedItem} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}