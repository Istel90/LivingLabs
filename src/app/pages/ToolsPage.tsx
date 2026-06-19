import { useEffect } from 'react';
import {
  ArrowRight,
  BookOpen,
  Layers,
  Laptop,
  LineChart,
  Sparkles,
} from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { PlatformContent } from '../components/PlatformContent';
import { RightSidebar } from '../components/RightSidebar';

const categories = [
  {
    title: 'Maps & DATA',
    subtitle: '적응대책 수립을 위한 데이터와 지도',
    description: '지역 현황 분석 및 지역 리스크 도출에 활용되는 공간정보와 통계 데이터를 제공합니다.',
    href: '/tools/maps-data',
    icon: Layers,
    color: 'from-[#176fa0] to-[#239bc1]',
  },
  {
    title: '가이드라인',
    subtitle: '적응대책 수립을 위한 지침과 사례',
    description: '리빙랩 운영부터 적응대책 반영까지 단계별 방법과 참고자료를 제공합니다.',
    href: '/tools/guidelines',
    icon: BookOpen,
    color: 'from-[#6855a5] to-[#9273c9]',
  },
  {
    title: '분석도구',
    subtitle: '데이터 기반 의사결정 분석',
    description: '적응사업 평가와 공간 데이터 생성을 위한 분석 기능을 제공합니다.',
    href: '/tools/analysis',
    icon: LineChart,
    color: 'from-[#087f72] to-[#11a98a]',
  },
  {
    title: 'App or 프로그램',
    subtitle: '업무별 실행 지원도구',
    description: '주관부서와 사업소관부서가 활용하는 맞춤형 실행 도구를 제공합니다.',
    href: '/tools/applications',
    icon: Laptop,
    color: 'from-[#34784d] to-[#62a45d]',
  },
];

export function ToolsPage() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    requestAnimationFrame(() => {
      document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.hash]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f7f8]">
      <main className="flex-1">
        <section className="relative overflow-hidden bg-[#073b52] text-white">
          <div className="absolute -left-20 top-10 size-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 top-0 size-96 rounded-full bg-sky-500/20 blur-3xl" />
          <Header variant="hero" />
          <div className="container relative mx-auto px-4 py-9 md:py-11">
            <div className="max-w-4xl">
              <div className="flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
                <Sparkles className="size-4" />
                DECISION SUPPORT TOOLS
              </div>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                기후위기 적응대책을 실행으로 연결하는 지원도구
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
                지역 진단과 계획 수립부터 사업 디자인, 이행 및 효과평가까지 필요한 데이터와 도구를 한곳에서 확인하세요.
              </p>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-10">
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_250px]">
            <div>
              <section>
                <div className="mb-7">
                  <p className="text-sm font-extrabold text-emerald-700">TOOL CATEGORIES</p>
                  <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">필요한 지원도구를 찾아보세요</h2>
                  <p className="mt-3 leading-7 text-slate-600">목적과 업무 단계에 맞는 데이터, 지침, 분석도구와 프로그램을 제공합니다.</p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {categories.map((category) => (
                    <Link
                      key={category.title}
                      to={category.href}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                    >
                      <div className={`bg-gradient-to-br ${category.color} p-6 text-white`}>
                        <div className="flex items-start justify-between">
                          <div className="grid size-12 place-items-center rounded-xl bg-white/15">
                            <category.icon className="size-6" />
                          </div>
                          <ArrowRight className="size-5 opacity-70 transition group-hover:translate-x-1 group-hover:opacity-100" />
                        </div>
                        <h3 className="mt-7 text-2xl font-extrabold">{category.title}</h3>
                        <p className="mt-1 text-sm font-bold text-white/75">{category.subtitle}</p>
                      </div>
                      <div className="p-6">
                        <p className="leading-7 text-slate-600">{category.description}</p>
                        <p className="mt-5 text-sm font-extrabold text-slate-900">자세히 보기</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>

              <section id="adaptation-support-tools" className="mt-12 scroll-mt-8">
                <PlatformContent selectedItem="adaptation-support-tools" />
              </section>
            </div>

            <RightSidebar selectedItem="" onSelectItem={() => undefined} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
