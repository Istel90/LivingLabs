import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  Map,
  MapPin,
  Route,
  Sparkles,
  Sprout,
  Trees,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

const surveyPlatformUrl =
  import.meta.env.VITE_SURVEY_PLATFORM_URL || 'http://127.0.0.1:4174/';
const responsibleDepartmentToolUrl =
  import.meta.env.VITE_RESPONSIBLE_DEPARTMENT_TOOL_URL || 'http://127.0.0.1:4175/responsible-department';
const priorityManagementAreaToolUrl =
  import.meta.env.VITE_PRIORITY_MANAGEMENT_AREA_TOOL_URL || 'http://127.0.0.1:4175/priority-management-area';
const adaptationPathwayToolUrl =
  import.meta.env.VITE_ADAPTATION_PATHWAY_TOOL_URL || 'http://127.0.0.1:4175/adaptation-pathway';
const internalLeadDepartmentToolUrl = `${import.meta.env.BASE_URL}lead-department-tool`;
const leadDepartmentToolUrl =
  import.meta.env.VITE_LEAD_DEPARTMENT_TOOL_URL || internalLeadDepartmentToolUrl;

const tools = [
  {
    eyebrow: '지역 진단',
    title: '지역 리스크 우선순위',
    description: '지역 이해관계자의 판단을 모아 기후 리스크 우선순위를 도출합니다.',
    icon: ClipboardList,
    color: 'from-[#0b65a4] to-[#1583bd]',
    href: surveyPlatformUrl,
  },
  {
    eyebrow: '공간 분석',
    title: '중점관리구역 선정',
    description: '행정경계와 공간지표를 결합하여 우선 관리가 필요한 지역을 찾습니다.',
    icon: MapPin,
    color: 'from-[#087f72] to-[#10a37f]',
    href: priorityManagementAreaToolUrl,
  },
  {
    eyebrow: '사업 평가',
    title: '사업소관부서 지원도구',
    description: '적응사업을 지도에 디자인하고 이행량과 적응효과를 함께 평가합니다.',
    icon: Trees,
    color: 'from-[#34784d] to-[#58a15f]',
    href: responsibleDepartmentToolUrl,
  },
  {
    eyebrow: '경로 설계',
    title: '사업 적응경로 지원도구',
    description: '장기적인 기후변화에 대응하는 사업 추진 경로와 전환 시점을 설계합니다.',
    icon: Route,
    color: 'from-[#6956a8] to-[#8972c4]',
    href: adaptationPathwayToolUrl,
  },
];

const process = [
  ['01', '지역 이해', '기후·사회·공간 데이터를 통해 지역의 현재 상태를 이해합니다.'],
  ['02', '리스크 도출', '시민과 담당부서가 함께 우선 대응할 기후 리스크를 선정합니다.'],
  ['03', '사업 디자인', '지역에 필요한 적응사업의 위치, 유형과 목표 물량을 설계합니다.'],
  ['04', '효과 평가', '사업 이행량과 적응효과를 점검하고 다음 계획에 반영합니다.'],
];

export function HomePage() {
  return (
    <div className="min-h-screen bg-[#f3f7f8] text-slate-900">
      <main>
        <section className="relative overflow-hidden bg-[#073b52] text-white">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute -left-20 top-28 size-72 rounded-full bg-[#1fa784] blur-3xl" />
            <div className="absolute right-0 top-0 size-96 rounded-full bg-[#287eb5] blur-3xl" />
          </div>

          <Header variant="hero" />

          <div className="container relative mx-auto px-4 py-14 lg:pb-24 lg:pt-16">
            <div className="flex max-w-4xl flex-col justify-center">
              <div className="mb-5 flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-cyan-50 backdrop-blur">
                <Sparkles className="size-4 text-emerald-300" />
                데이터와 시민 참여로 만드는 지역 기후적응
              </div>
              <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.18] tracking-tight md:text-5xl">
                지역의 위험을 이해하고,
                <br />
                실행 가능한 <span className="text-emerald-300">적응사업</span>을 설계합니다
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-slate-200 md:text-lg">
                지방자치단체의 적응대책 수립부터 중점관리구역 선정, 사업 디자인과 효과평가까지
                하나의 흐름으로 연결하는 의사결정 지원 플랫폼입니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/tools"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-5 py-3 font-bold text-[#073b52] shadow-lg shadow-emerald-950/20 transition hover:-translate-y-0.5 hover:bg-emerald-300"
                >
                  지원도구 둘러보기
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/adaptation-guide"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-5 py-3 font-bold text-white backdrop-blur transition hover:bg-white/20"
                >
                  적응대책 수립 가이드
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto -mt-5 px-4">
          <div className="relative grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 md:grid-cols-4">
            {[
              ['통합 행정구역', '전국 시군구 기반', Map],
              ['지역별 기후조건', '일사량·태양고도 연계', BarChart3],
              ['시민참여 의사결정', '리스크 우선순위 도출', Users],
              ['사업 효과관리', '계획·이행·효과 연결', CheckCircle2],
            ].map(([title, description, Icon], index) => (
              <div key={title as string} className={`flex gap-3 p-5 ${index < 3 ? 'md:border-r' : ''}`}>
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="font-extrabold text-slate-900">{title as string}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{description as string}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-extrabold text-emerald-700">DECISION SUPPORT TOOLS</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">적응대책을 실행으로 연결하는 핵심 도구</h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-600">
                지역 진단부터 사업 효과평가까지 필요한 도구를 단계에 맞춰 활용하세요.
              </p>
            </div>
            <Link to="/tools" className="inline-flex items-center gap-2 font-bold text-[#0b65a4] hover:underline">
              전체 지원도구 보기
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {tools.map((tool) => (
              <a
                key={tool.title}
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className={`bg-gradient-to-br ${tool.color} p-5 text-white`}>
                  <div className="flex items-start justify-between">
                    <div className="grid size-12 place-items-center rounded-xl bg-white/15 backdrop-blur">
                      <tool.icon className="size-6" />
                    </div>
                    <ExternalLink className="size-4 opacity-70 transition group-hover:opacity-100" />
                  </div>
                  <p className="mt-7 text-xs font-bold text-white/75">{tool.eyebrow}</p>
                  <h3 className="mt-1 text-xl font-extrabold">{tool.title}</h3>
                </div>
                <div className="p-5">
                  <p className="min-h-16 text-sm leading-6 text-slate-600">{tool.description}</p>
                  <div className="mt-5 flex items-center gap-2 text-sm font-extrabold text-slate-800">
                    도구 실행하기
                    <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="container mx-auto grid gap-10 px-4 py-16 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="text-sm font-extrabold text-[#0b65a4]">ADAPTATION WORKFLOW</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight">지역 적응대책의 전 과정을 하나의 흐름으로</h2>
              <p className="mt-4 leading-7 text-slate-600">
                데이터 분석만으로 끝나지 않습니다. 지역의 목소리를 반영하고 사업을 공간에 배치한 뒤,
                이행 결과와 효과를 다시 평가하는 순환 구조를 지원합니다.
              </p>
              <a
                href={leadDepartmentToolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#073b52] px-5 py-3 font-bold text-white transition hover:bg-[#0b5570]"
              >
                주관부서 적응대책 지원도구
                <ExternalLink className="size-4" />
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {process.map(([number, title, description], index) => (
                <div key={number} className="relative rounded-2xl border border-slate-200 bg-[#f8faf9] p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <span className="text-3xl font-black text-emerald-600">{number}</span>
                    <span className="text-xs font-bold text-slate-400">STEP {index + 1}</span>
                  </div>
                  <h3 className="text-lg font-extrabold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid overflow-hidden rounded-2xl bg-[#073b52] text-white shadow-xl lg:grid-cols-[1.15fr_.85fr]">
            <div className="p-8 md:p-10">
              <FileText className="size-7 text-emerald-300" />
              <h2 className="mt-5 text-3xl font-extrabold">지역 기후적응, 어디서부터 시작해야 할까요?</h2>
              <p className="mt-4 max-w-2xl leading-7 text-slate-200">
                적응대책 수립 절차와 단계별 사례, 활용 가능한 지원도구를 가이드에서 확인할 수 있습니다.
              </p>
              <Link
                to="/adaptation-guide"
                className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-extrabold text-[#073b52] transition hover:bg-emerald-50"
              >
                적응대책 수립 가이드 열기
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid min-h-64 place-items-center bg-[linear-gradient(135deg,#0b5870,#148369)] p-8">
              <div className="relative grid size-48 place-items-center rounded-full border border-white/25">
                <div className="grid size-32 place-items-center rounded-full border border-white/25 bg-white/10">
                  <Sprout className="size-14 text-emerald-200" />
                </div>
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <span
                    key={item}
                    className="absolute grid size-8 place-items-center rounded-full bg-white text-xs font-black text-[#087f72] shadow"
                    style={{ transform: `rotate(${item * 60}deg) translateY(-96px) rotate(-${item * 60}deg)` }}
                  >
                    {item + 1}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
