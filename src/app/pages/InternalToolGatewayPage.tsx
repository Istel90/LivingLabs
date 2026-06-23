import { useLocation } from 'react-router';

const internalToolsOrigin =
  import.meta.env.VITE_INTERNAL_TOOLS_ORIGIN || 'http://127.0.0.1:5175';

const toolLabels: Record<string, string> = {
  '/priority-management-area': '중점관리구역 선정지원도구',
  '/responsible-department': '사업소관부서 지원도구',
  '/adaptation-pathway': '사업 적응경로 지원도구',
};

function resolveTitle(pathname: string) {
  const key = Object.keys(toolLabels).find((prefix) => pathname.startsWith(prefix));
  return key ? toolLabels[key] : '내부 지원도구';
}

export function InternalToolGatewayPage() {
  const location = useLocation();
  const toolUrl = `${internalToolsOrigin}${location.pathname}${location.search}${location.hash}`;
  const title = resolveTitle(location.pathname);

  return (
    <main className="fixed inset-0 bg-slate-950 text-white">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/75 px-3 py-2 text-xs font-bold shadow-lg backdrop-blur">
        <span>{title}</span>
        <a
          href={toolUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-slate-100 hover:bg-white/20"
        >
          직접 열기
        </a>
      </div>
      <iframe
        title={title}
        src={toolUrl}
        className="h-full w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write"
      />
    </main>
  );
}
