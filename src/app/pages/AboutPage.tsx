import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { RightSidebar } from '../components/RightSidebar';
import { PlatformContent } from '../components/PlatformContent';
import { useState } from 'react';
import { Building2, Compass, Sparkles } from 'lucide-react';

export function AboutPage() {
  const [platformSelectedItem, setPlatformSelectedItem] = useState('');

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f7f8]">
      <main className="flex-1">
        <section className="relative overflow-hidden bg-[#073b52] text-white">
          <div className="absolute -left-20 top-10 size-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 top-0 size-96 rounded-full bg-sky-500/20 blur-3xl" />
          <Header variant="hero" />
          <div className="container relative mx-auto px-4 py-10 md:py-14">
            <div className="max-w-4xl">
              <div className="flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
                <Sparkles className="size-4" />
                ABOUT PLATFORM
              </div>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                지역 기후적응 의사결정을 연결하는 리빙랩 지원 플랫폼
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
                지역 현황 진단, 시민참여 기반 리스크 검토, 적응사업 디자인과 효과평가를 하나의 흐름으로 연결하기 위한 연구·시연 플랫폼입니다.
              </p>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div>
              {platformSelectedItem ? (
                <PlatformContent selectedItem={platformSelectedItem} />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
                  <div className="border-b border-slate-100 bg-gradient-to-r from-[#073b52] to-[#0b6574] px-7 py-7 text-white">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-200">
                      <Compass className="size-4" />
                      PLATFORM OVERVIEW
                    </div>
                    <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">플랫폼 소개</h2>
                  </div>
                  <div className="space-y-6 p-7 md:p-9">
                    <p className="max-w-3xl leading-7 text-slate-600">
                      본 플랫폼은 지방자치단체가 기후위기 적응대책을 수립하고, 지역 리스크를 검토하며,
                      실제 적응사업의 위치와 효과를 함께 평가할 수 있도록 구성한 리빙랩 기반 의사결정 지원 환경입니다.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                          <Building2 className="size-5" />
                        </div>
                        <h3 className="text-lg font-extrabold text-slate-900">운영 주체</h3>
                        <p className="mt-2 leading-6 text-slate-600">
                          서울시립대학교 융합환경계획연구실에서 기후적응 리빙랩과 의사결정 지원도구의 연구·시연을 위해 구축합니다.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                          <Compass className="size-5" />
                        </div>
                        <h3 className="text-lg font-extrabold text-slate-900">구성 방향</h3>
                        <p className="mt-2 leading-6 text-slate-600">
                          행정경계, 공간 데이터, 시민참여 설문, 사업 디자인 도구를 연계해 계획 수립부터 효과관리까지 이어지는 구조를 지향합니다.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
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
