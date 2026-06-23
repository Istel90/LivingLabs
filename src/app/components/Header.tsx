import { ExternalLink, Globe, Menu, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { clearPlatformHandoffs } from '../../../shared/services/platformHandoffs.js';
import { Button } from './ui/button';

const navigation = [
  { to: '/', label: '홈' },
  { to: '/adaptation-guide', label: '적응대책 수립 가이드' },
  { to: '/tools', label: '지원도구' },
  { to: '/about', label: 'About' },
];

const parentPlatformUrl = import.meta.env.VITE_PARENT_PLATFORM_URL || 'https://livinglab-web.vercel.app/';
const vworldProxyUrl = import.meta.env.VITE_VWORLD_PROXY_URL || 'http://127.0.0.1:5176/vworld-data';

function createDevResetUrl() {
  const url = new URL(vworldProxyUrl, window.location.origin);
  url.pathname = '/dev-reset';
  url.search = '';
  return url.toString();
}

interface HeaderProps {
  variant?: 'default' | 'hero';
}

export function Header({ variant = 'default' }: HeaderProps) {
  const location = useLocation();
  const isHero = variant === 'hero';

  const resetDevelopmentState = async () => {
    const ok = window.confirm('개발용 임시 초기화를 실행할까요?\n중점관리구역 요청, 사업 전달, 검토 응답 저장값을 모두 비웁니다.');
    if (!ok) return;

    try {
      const [proxyResult, supabaseOk] = await Promise.all([
        fetch(createDevResetUrl(), { method: 'POST' }).then((response) => response.ok).catch(() => false),
        clearPlatformHandoffs(),
      ]);
      if (!proxyResult && !supabaseOk) throw new Error('reset failed');
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.alert('개발용 저장값을 초기화했습니다. 열린 도구 페이지는 새로고침해 주세요.');
    } catch (error) {
      console.error(error);
      window.alert('초기화에 실패했습니다. VWorld Data Proxy(5176)가 켜져 있는지 확인해 주세요.');
    }
  };

  return (
    <header className={isHero ? 'relative z-20 text-white' : 'border-b bg-white'}>
      {!isHero && <div className="bg-[#004494] text-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <Globe className="size-4" />
            <span className="text-sm">서울시립대학교</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-sm hover:underline">Login</button>
          </div>
        </div>
      </div>}

      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            {!isHero && (
              <div className="flex size-12 items-center justify-center rounded bg-[#004494] font-bold text-white">
                KR
              </div>
            )}
            <div>
              <h1 className={`text-lg font-bold leading-tight ${isHero ? 'text-white' : ''}`}>지방 기후위기 적응대책 리빙랩 지원 플랫폼</h1>
              <p className={`text-xs ${isHero ? 'text-slate-300' : 'text-gray-600'}`}>리빙랩 지원도구</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <input
                type="text"
                placeholder="Search..."
                className={`w-64 rounded-md border py-2 pl-10 pr-4 focus:outline-none focus:ring-2 ${
                  isHero
                    ? 'border-white/20 bg-white/10 text-white placeholder:text-white/60 focus:ring-white/30'
                    : 'focus:ring-[#004494]'
                }`}
              />
              <Search className={`absolute left-3 top-1/2 size-4 -translate-y-1/2 ${isHero ? 'text-white/60' : 'text-gray-400'}`} />
            </div>
            {isHero && (
              <div className="hidden items-center gap-4 text-sm text-white/80 md:flex">
                <button
                  type="button"
                  onClick={resetDevelopmentState}
                  className="inline-flex items-center rounded-full border border-orange-200/40 bg-orange-500/20 px-3.5 py-2 font-semibold text-orange-50 transition hover:bg-orange-500/35"
                >
                  개발 초기화
                </button>
                <a
                  href={parentPlatformUrl}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 font-semibold text-white transition hover:bg-white/20"
                >
                  기후적응 리빙랩 플랫폼으로 돌아가기
                  <ExternalLink className="size-3.5" />
                </a>
                <button className="hover:text-white">Login</button>
              </div>
            )}
            {!isHero && (
              <button
                type="button"
                onClick={resetDevelopmentState}
                className="hidden rounded-full border border-orange-200 bg-orange-50 px-3.5 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100 md:inline-flex"
              >
                개발 초기화
              </button>
            )}
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-5" />
            </Button>
          </div>
        </div>

        <nav className={isHero ? 'border-t border-white/10' : 'border-t'}>
          <ul className={`flex items-center ${isHero ? 'gap-2 py-3' : 'gap-1 py-2'}`}>
            {navigation.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`transition-colors ${
                    location.pathname === item.to
                      ? isHero
                        ? 'rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-[#073b52] shadow-sm'
                        : 'rounded bg-[#e6f0ff] px-4 py-2 text-sm text-[#004494]'
                      : isHero
                        ? 'rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-[15px] font-semibold text-white/85 hover:bg-white/15 hover:text-white'
                        : 'rounded px-4 py-2 text-sm hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
