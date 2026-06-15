import { ArrowRight, ClipboardList, ExternalLink, FileText, MapPin, Route, Trees, Users } from 'lucide-react';

interface PlatformContentProps {
  selectedItem: string;
}

const surveyPlatformUrl = import.meta.env.VITE_SURVEY_PLATFORM_URL || 'http://127.0.0.1:4174/';
const responsibleDepartmentToolUrl =
  import.meta.env.VITE_RESPONSIBLE_DEPARTMENT_TOOL_URL || 'http://127.0.0.1:4175/responsible-department';
const priorityManagementAreaToolUrl =
  import.meta.env.VITE_PRIORITY_MANAGEMENT_AREA_TOOL_URL || 'http://127.0.0.1:4175/priority-management-area';
const adaptationPathwayToolUrl =
  import.meta.env.VITE_ADAPTATION_PATHWAY_TOOL_URL || 'http://127.0.0.1:4175/adaptation-pathway';
const leadDepartmentToolUrl =
  import.meta.env.VITE_LEAD_DEPARTMENT_TOOL_URL || 'http://128.134.187.146:6080/living-lab/';

const leadTools = [
  { title: '주관부서 적응대책 지원도구', href: leadDepartmentToolUrl, icon: FileText, external: true },
  { title: '지역 리스크 우선순위 설문조사 도구', href: surveyPlatformUrl, icon: ClipboardList, external: true },
  { title: '중점관리구역 선정 지원도구', href: priorityManagementAreaToolUrl, icon: MapPin, external: true },
];

const responsibleTools = [
  { title: '사업소관부서 지원도구', href: responsibleDepartmentToolUrl, icon: Trees, external: true },
  { title: '사업 적응경로 지원도구', href: adaptationPathwayToolUrl, icon: Route, external: true, preparing: true },
];

function ToolLink({ tool }: { tool: (typeof leadTools)[number] & { preparing?: boolean } }) {
  const Icon = tool.icon;
  return (
    <a
      href={tool.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
        <Icon className="size-5" />
      </div>
      <span className="flex-1 text-sm font-extrabold text-slate-800">{tool.title}</span>
      {tool.preparing ? (
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">준비 중</span>
      ) : (
        <ExternalLink className="size-4 text-slate-400 transition group-hover:text-emerald-700" />
      )}
    </a>
  );
}

export function PlatformContent({ selectedItem }: PlatformContentProps) {
  if (selectedItem === 'citizen-science-platform') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm md:p-9">
        <p className="text-sm font-extrabold text-emerald-700">CITIZEN SCIENCE</p>
        <h2 className="mt-2 text-3xl font-extrabold text-slate-900">시민과학 데이터 수집 플랫폼</h2>
        <p className="mt-4 leading-7 text-slate-600">시민참여를 통해 지역의 기후환경 데이터를 수집하고 공유하는 플랫폼입니다.</p>
        <a href="https://livinglab.mangosystem.com/" target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-bold text-white">
          플랫폼 바로가기 <ExternalLink className="size-4" />
        </a>
      </section>
    );
  }

  if (selectedItem !== 'adaptation-support-tools') return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      <div className="bg-gradient-to-r from-[#073b52] to-[#087f72] p-7 text-white md:p-9">
        <p className="text-sm font-extrabold text-emerald-200">CORE ADAPTATION TOOLS</p>
        <h2 className="mt-2 text-3xl font-extrabold">적응대책 지원도구</h2>
        <p className="mt-4 max-w-3xl leading-7 text-slate-200">
          계획을 총괄하는 주관부서와 개별 사업을 실행하는 사업소관부서의 의사결정을 연결합니다.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href={leadDepartmentToolUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-extrabold text-[#073b52]">
            주관부서 핵심도구 <ExternalLink className="size-4" />
          </a>
          <a href={responsibleDepartmentToolUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-5 py-3 text-sm font-extrabold text-white">
            사업소관부서 핵심도구 <ArrowRight className="size-4" />
          </a>
        </div>
      </div>

      <div className="grid gap-6 p-7 md:p-9 lg:grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-6">
          <div className="grid size-12 place-items-center rounded-xl bg-blue-100 text-blue-700"><FileText className="size-6" /></div>
          <h3 className="mt-5 text-xl font-extrabold text-slate-900">주관부서 지원도구</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">지역 리스크 진단, 우선순위 설정과 계획 수립을 총괄하는 부서를 지원합니다.</p>
          <div className="mt-6 space-y-3">{leadTools.map((tool) => <ToolLink key={tool.title} tool={tool} />)}</div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6">
          <div className="grid size-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Users className="size-6" /></div>
          <h3 className="mt-5 text-xl font-extrabold text-slate-900">사업소관부서 지원도구</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">적응사업을 설계하고 이행실적과 적응효과를 평가하는 담당 부서를 지원합니다.</p>
          <div className="mt-6 space-y-3">{responsibleTools.map((tool) => <ToolLink key={tool.title} tool={tool} />)}</div>
        </div>
      </div>
    </section>
  );
}
