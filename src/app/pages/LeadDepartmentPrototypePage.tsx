import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Database, Layers, MapPin, Route, Trees } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import {
  getLeadDepartmentGateway,
  type LeadDepartmentSnapshot,
} from '../lib/adapters/leadDepartmentData';

const statusLabels = {
  draft: '검토중',
  active: '진행중',
  completed: '완료',
};

export function LeadDepartmentPrototypePage() {
  const [snapshot, setSnapshot] = useState<LeadDepartmentSnapshot | null>(null);
  const [selectedSector, setSelectedSector] = useState('전체');

  useEffect(() => {
    getLeadDepartmentGateway().getSnapshot().then(setSnapshot);
  }, []);

  const sectors = useMemo(() => {
    if (!snapshot) return ['전체'];
    return ['전체', ...Array.from(new Set(snapshot.scenarios.map((scenario) => scenario.sector)))];
  }, [snapshot]);

  const scenarios = useMemo(() => {
    if (!snapshot) return [];
    return selectedSector === '전체'
      ? snapshot.scenarios
      : snapshot.scenarios.filter((scenario) => scenario.sector === selectedSector);
  }, [snapshot, selectedSector]);

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="container mx-auto px-4 py-16 text-slate-600">주관부서 지원도구를 불러오는 중입니다.</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f7f8]">
      <Header />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-[#073b52] text-white">
          <div className="absolute -left-24 top-12 size-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 top-0 size-96 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="container relative mx-auto px-4 py-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-extrabold text-emerald-200">
                  <Route className="size-4" />
                  LEAD DEPARTMENT SUPPORT TOOL
                </p>
                <h1 className="mt-5 text-3xl font-extrabold leading-tight md:text-5xl">
                  주관부서 적응대책 지원도구
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">
                  원본 Java/PostGIS 기반 도구의 핵심 흐름을 현재 플랫폼 안에서 시연할 수 있도록 옮긴
                  정적 프로토타입입니다. 데이터 호출부는 나중에 Supabase 또는 Java API로 교체할 수 있게
                  게이트웨이로 분리했습니다.
                </p>
              </div>

              <div className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-2xl bg-emerald-400/20 text-emerald-100">
                    <MapPin className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-emerald-100">현재 대상지역</p>
                    <p className="text-xl font-extrabold">{snapshot.region.name}</p>
                  </div>
                </div>
                <p className="mt-4 rounded-2xl bg-white/10 p-3 text-sm text-slate-200">
                  {snapshot.region.extentLabel} · 중심좌표 {snapshot.region.center.join(', ')}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-8">
          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-slate-900">1. 지역 및 부문</h2>
                <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
                  대상지역
                  <select className="rounded-xl border border-slate-200 px-3 py-2" value={snapshot.region.code} readOnly>
                    <option>{snapshot.region.name}</option>
                  </select>
                </label>
                <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
                  부문 필터
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2"
                    value={selectedSector}
                    onChange={(event) => setSelectedSector(event.target.value)}
                  >
                    {sectors.map((sector) => (
                      <option key={sector}>{sector}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-slate-900">2. 지도 레이어</h2>
                <div className="mt-4 space-y-3">
                  {snapshot.layers.map((layer) => (
                    <div key={layer.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-slate-800">{layer.name}</span>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${layer.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                          {layer.enabled ? '표시' : '대기'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{layer.source}</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">통합 지도 시연 영역</h2>
                  <p className="text-sm text-slate-500">행정경계, 리스크 지수, 사업 후보지를 한 화면에서 검토합니다.</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                  API 교체 가능 구조
                </span>
              </div>

              <div className="relative min-h-[520px] bg-[#d8f0ef]">
                <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(#0f766e_1px,transparent_1px)] [background-size:22px_22px]" />
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 540" role="img" aria-label="주관부서 지원도구 지도 목업">
                  <path d="M150 120 L365 70 L560 120 L700 240 L555 395 L315 450 L130 325 Z" fill="#ecfeff" stroke="#0f766e" strokeWidth="6" opacity="0.95" />
                  <path d="M95 360 C220 300 295 292 405 230 S620 165 760 96" fill="none" stroke="#38bdf8" strokeWidth="18" opacity="0.65" />
                  <path d="M360 72 L380 445 M150 122 L555 395 M560 122 L315 450" stroke="#64748b" strokeWidth="2" opacity="0.35" />
                  <circle cx="365" cy="285" r="42" fill="#f59e0b" opacity="0.72" />
                  <circle cx="272" cy="250" r="14" fill="#059669" opacity="0.85" />
                  <circle cx="550" cy="230" r="22" fill="#e11d48" opacity="0.65" />
                  <circle cx="485" cy="375" r="18" fill="#10b981" opacity="0.75" />
                </svg>
                <div className="absolute left-6 top-6 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
                  <p className="text-xs font-bold text-slate-500">선택 지역</p>
                  <p className="font-extrabold text-slate-900">{snapshot.region.name}</p>
                </div>
                <div className="absolute bottom-6 left-6 right-6 grid gap-3 md:grid-cols-3">
                  {snapshot.indicators.slice(0, 3).map((indicator) => (
                    <div key={indicator.label} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur">
                      <p className="text-xs font-bold text-slate-500">{indicator.label}</p>
                      <p className="mt-1 text-2xl font-extrabold text-slate-900">{indicator.value}</p>
                      <p className="mt-1 text-xs text-slate-500">{indicator.caption}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-slate-900">의사결정 지표</h2>
                <div className="mt-4 grid gap-3">
                  {snapshot.indicators.map((indicator) => (
                    <div key={indicator.label} className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-bold text-slate-500">{indicator.label}</p>
                      <p className="text-2xl font-extrabold text-slate-900">{indicator.value}</p>
                      <p className="text-xs text-slate-500">{indicator.caption}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-slate-900">시나리오 사업</h2>
                <div className="mt-4 space-y-3">
                  {scenarios.map((scenario) => (
                    <article key={scenario.id} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-extrabold text-slate-900">{scenario.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{scenario.sector} · {scenario.intervention}</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                          {statusLabels[scenario.status]}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                        <Trees className="size-4 text-emerald-700" />
                        <strong>{scenario.quantity.toLocaleString()}</strong>{scenario.unit}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <InfoCard icon={<Database className="size-5" />} title="현재 저장 방식" body="정적 프로토타입 데이터 게이트웨이를 사용합니다. 시연 중에는 JSON/GeoJSON으로 대체 가능합니다." />
            <InfoCard icon={<Activity className="size-5" />} title="Supabase 전환" body="동일한 화면에서 게이트웨이 구현만 바꿔 응답·사업·지표 데이터를 원격 DB로 저장할 수 있습니다." />
            <InfoCard icon={<Layers className="size-5" />} title="Java API 전환" body="전문업체 단계에서는 원본 Java/PostGIS/GeoServer API 계약에 맞춰 게이트웨이를 교체합니다." />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function InfoCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</div>
      <h3 className="mt-4 font-extrabold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}
