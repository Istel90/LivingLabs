import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { internalToolsOrigin } from '../toolUrls';

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

  useEffect(() => {
    window.location.replace(toolUrl);
  }, [toolUrl]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <div className="rounded-2xl border border-white/15 bg-white/10 p-6 text-center shadow-xl backdrop-blur">
        <p className="text-sm font-bold text-slate-300">{title}</p>
        <h1 className="mt-2 text-xl font-extrabold">지원도구로 이동 중입니다.</h1>
        <a href={toolUrl} className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-extrabold text-slate-900">
          이동이 안 되면 열기
        </a>
      </div>
    </main>
  );
}
