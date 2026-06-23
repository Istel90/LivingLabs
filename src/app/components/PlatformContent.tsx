import {
  ArrowRight,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  MapPin,
  Route,
  Trees,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  adaptationPathwayToolUrl,
  citizenSciencePlatformUrl,
  leadDepartmentToolUrl,
  priorityManagementAreaToolUrl,
  responsibleDepartmentToolUrl,
  surveyPlatformUrl,
} from '../toolUrls';

interface PlatformContentProps {
  selectedItem: string;
}

type ToolNode = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  icon: typeof FileText;
  external?: boolean;
  muted?: boolean;
};

type WorkflowNode = {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof FileText;
  href?: string;
  external?: boolean;
  passive?: boolean;
};

const supportTools: ToolNode[] = [
  {
    id: 'citizen-data',
    title: '시민 데이터 수집 지원도구',
    subtitle: '기존·신규 시민참여 데이터 수집',
    href: citizenSciencePlatformUrl,
    icon: ClipboardList,
    external: true,
  },
  {
    id: 'risk-survey',
    title: '지역 리스크 우선순위 설문조사 지원도구',
    subtitle: '시민·이해관계자 기반 지역 리스크 우선순위',
    href: surveyPlatformUrl,
    icon: Users,
    external: true,
  },
  {
    id: 'priority-area',
    title: '중점관리구역 선정 지원도구',
    subtitle: '리스크 격자 분석, 대안 후보지, 필지 후보 도출',
    href: priorityManagementAreaToolUrl,
    icon: MapPin,
  },
  {
    id: 'lead-plan',
    title: '적응계획 수립 지원도구',
    subtitle: '주관부서 검토, 대안 결정, 사업 공간배치 권유',
    href: leadDepartmentToolUrl,
    icon: FileText,
  },
  {
    id: 'responsible-placement',
    title: '적응사업 공간계획 지원도구',
    subtitle: '사업소관부서 배치 검토·수정과 이행·효과 평가',
    href: responsibleDepartmentToolUrl,
    icon: Trees,
  },
  {
    id: 'adaptation-pathway',
    title: '사업 적응경로 지원도구',
    subtitle: '단계별 사업 경로와 물량 권유 흐름',
    href: adaptationPathwayToolUrl,
    icon: Route,
    muted: true,
  },
];

const workflowNodes: WorkflowNode[] = [
  supportTools[0],
  {
    id: 'common-data',
    title: '공통 데이터 서버/로컬',
    subtitle: '침수구역, 기온, 그늘막 등 공통 현황 데이터',
    icon: Database,
    passive: true,
  },
  supportTools[2],
  supportTools[3],
  supportTools[4],
];

const workflowStepNumbers: Record<string, number> = {
  'citizen-data': 1,
  'risk-survey': 2,
  'priority-area': 3,
  'lead-plan': 4,
  'responsible-placement': 5,
};

function isExternalUrl(href: string) {
  return /^https?:\/\//.test(href);
}

function LinkBadge({ href, children }: { href: string; children: ReactNode }) {
  const external = isExternalUrl(href);
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold text-white transition hover:bg-white/25"
    >
      {children}
      {external ? <ExternalLink className="size-3" /> : <ArrowRight className="size-3" />}
    </a>
  );
}

function ToolListLink({ tool }: { tool: ToolNode }) {
  const Icon = tool.icon;
  const external = tool.external || isExternalUrl(tool.href);
  return (
    <a
      href={tool.href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#16708a] hover:shadow-md"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e7f4f7] text-[#12647c]">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-slate-900">{tool.title}</span>
        <span className="mt-1 block text-xs font-semibold text-slate-500">{tool.subtitle}</span>
      </span>
      {tool.muted ? (
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">준비 중</span>
      ) : external ? (
        <ExternalLink className="size-4 text-slate-400 transition group-hover:text-[#12647c]" />
      ) : (
        <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#12647c]" />
      )}
    </a>
  );
}

function WorkflowStep({ node, index, showConnector = true }: { node: WorkflowNode; index: number; showConnector?: boolean }) {
  const Icon = node.icon;
  const visibleStepNumber = workflowStepNumbers[node.id];
  const card = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className={`grid size-10 place-items-center rounded-lg ${node.passive ? 'bg-white text-[#2e6e7c]' : 'bg-white/15'}`}>
          <Icon className="size-5" />
        </span>
        {node.passive ? null : (
          <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-extrabold text-white">
            0{visibleStepNumber}
          </span>
        )}
      </span>
      <span>
        <strong className="block text-base leading-6">{node.title}</strong>
        <small className={`mt-2 block text-xs leading-5 ${node.passive ? 'text-slate-500' : 'text-sky-50/80'}`}>{node.subtitle}</small>
      </span>
    </>
  );

  const className = node.passive
    ? 'relative flex h-full min-h-[164px] flex-col justify-between rounded-xl border border-[#b7dce5] bg-white p-3.5 text-slate-700 shadow-sm'
    : 'group relative flex h-full min-h-[164px] flex-col justify-between rounded-xl border border-[#1f7891]/20 bg-[#146b84] p-3.5 text-white shadow-sm transition hover:-translate-y-1 hover:bg-[#0f5f76] hover:shadow-lg';

  const connector = showConnector && index < workflowNodes.length - 1 ? (
    <span className="pointer-events-none absolute -right-5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-[#b7dce5] bg-white p-1 text-[#12647c] lg:grid">
      <ArrowRight className="size-4" />
    </span>
  ) : null;

  if (!node.href) {
    return (
      <div className={className}>
        {card}
        {connector}
      </div>
    );
  }

  const external = node.external || isExternalUrl(node.href);
  return (
    <a href={node.href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className={className}>
      {card}
      {connector}
    </a>
  );
}

function FlowArrow({ tone = 'base' }: { tone?: 'base' | 'feedback' }) {
  const colorClass = tone === 'feedback' ? 'text-[#e6462e]' : 'text-[#12647c]';
  return (
    <div className={`hidden items-center justify-center ${colorClass} lg:flex`} aria-hidden="true">
      <span className="h-0.5 flex-1 rounded-full bg-current" />
      <ArrowRight className="-ml-1 size-5 shrink-0" />
    </div>
  );
}

function FlowArrowPair({ tone = 'base' }: { tone?: 'base' | 'feedback' }) {
  const colorClass = tone === 'feedback' ? 'text-[#e6462e]' : 'text-[#12647c]';
  return (
    <div className={`hidden flex-col justify-center gap-2 ${colorClass} lg:flex`} aria-hidden="true">
      <div className="flex items-center">
        <span className="h-0.5 flex-1 rounded-full bg-current" />
        <ArrowRight className="-ml-1 size-5 shrink-0" />
      </div>
      <div className="flex items-center">
        <ArrowRight className="-mr-1 size-5 shrink-0 rotate-180" />
        <span className="h-0.5 flex-1 rounded-full bg-current" />
      </div>
    </div>
  );
}

export function PlatformContent({ selectedItem }: PlatformContentProps) {
  if (selectedItem === 'citizen-science-platform') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm md:p-9">
        <p className="text-sm font-extrabold text-emerald-700">CITIZEN SCIENCE</p>
        <h2 className="mt-2 text-3xl font-extrabold text-slate-900">시민 데이터 수집 플랫폼</h2>
        <p className="mt-4 leading-7 text-slate-600">
          시민참여를 통해 지역의 기후환경 데이터를 수집하고 공유하는 플랫폼입니다.
        </p>
        <a
          href="https://livinglab.mangosystem.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-bold text-white"
        >
          플랫폼 바로가기
          <ExternalLink className="size-4" />
        </a>
      </section>
    );
  }

  if (selectedItem !== 'adaptation-support-tools') return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      <div className="bg-gradient-to-r from-[#073b52] via-[#0e6376] to-[#10846f] p-7 text-white md:p-9">
        <p className="text-sm font-extrabold text-emerald-200">CORE ADAPTATION TOOLS</p>
        <h2 className="mt-2 text-3xl font-extrabold">적응대책 지원도구</h2>
        <p className="mt-4 max-w-4xl leading-7 text-slate-100">
          시민 데이터 수집, 공통 현황 데이터, 중점관리구역 선정, 주관부서 계획 수립,
          사업소관부서 공간배치까지 이어지는 적응대책 의사결정 흐름입니다.
        </p>
      </div>

      <div className="space-y-8 p-6 md:p-8">
        <div className="rounded-2xl border border-[#b7dce5] bg-[#f4fafb] p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold tracking-wide text-[#12647c]">WORKFLOW MAP</p>
              <h3 className="mt-1 text-xl font-extrabold text-slate-900">중점관리구역 기반의 기후위기 적응계획 수립 지원 체계</h3>
            </div>
            <LinkBadge href={leadDepartmentToolUrl}>주관부서 중심 검토</LinkBadge>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="min-w-[980px]">
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_20px_minmax(0,1fr)_20px_minmax(0,1fr)_24px_minmax(0,1fr)] lg:items-stretch">
                <WorkflowStep node={workflowNodes[0]} index={0} showConnector={false} />
                <FlowArrow />
                <WorkflowStep node={workflowNodes[1]} index={1} showConnector={false} />
                <FlowArrow />
                <WorkflowStep node={workflowNodes[2]} index={2} showConnector={false} />
                <FlowArrow />
                <WorkflowStep node={workflowNodes[3]} index={3} showConnector={false} />
                <FlowArrowPair tone="feedback" />
                <WorkflowStep node={workflowNodes[4]} index={4} showConnector={false} />
              </div>

              <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_20px_minmax(0,1fr)_20px_minmax(0,1fr)_24px_minmax(0,1fr)] lg:items-stretch">
                <a
                  href={supportTools[1].href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full min-h-[164px] flex-col justify-between rounded-xl border border-[#12647c]/30 bg-[#146b84] p-3.5 text-white shadow-sm transition hover:-translate-y-1 hover:bg-[#0f5f76] hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-extrabold">
                      <Users className="size-4 shrink-0" />
                      지역 리스크 우선순위 설문조사 지원도구
                    </div>
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-extrabold text-white">
                      02
                    </span>
                  </div>
                  <div className="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-extrabold">
                    지역 리스크 우선순위
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold tracking-wide text-[#12647c]">ALL SUPPORT LINKS</p>
              <h3 className="mt-1 text-xl font-extrabold text-slate-900">지원도구 바로가기</h3>
            </div>
            <span className="text-xs font-bold text-slate-500">{supportTools.length}개 연결</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {supportTools.map((tool) => (
              <ToolListLink key={tool.id} tool={tool} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
