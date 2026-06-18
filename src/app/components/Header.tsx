import { ExternalLink, Globe, Menu, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from './ui/button';

const navigation = [
  { to: '/', label: '홈' },
  { to: '/adaptation-guide', label: '적응대책 수립 가이드' },
  { to: '/tools', label: '지원도구' },
  { to: '/about', label: 'About' },
];

const parentPlatformUrl = import.meta.env.VITE_PARENT_PLATFORM_URL || 'https://livinglab-web.vercel.app/';

interface HeaderProps {
  variant?: 'default' | 'hero';
}

export function Header({ variant = 'default' }: HeaderProps) {
  const location = useLocation();
  const isHero = variant === 'hero';

  return (
    <header className={isHero ? 'relative z-20 text-white' : 'border-b bg-white'}>
      {!isHero && <div className="bg-[#004494] text-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <Globe className="size-4" />
            <span className="text-sm">서울시립대학교</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-sm hover:underline">EN</button>
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
                <a
                  href={parentPlatformUrl}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 font-semibold text-white transition hover:bg-white/20"
                >
                  기후적응 리빙랩 플랫폼으로 돌아가기
                  <ExternalLink className="size-3.5" />
                </a>
                <button className="hover:text-white">EN</button>
                <button className="hover:text-white">Login</button>
              </div>
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
