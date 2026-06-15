import { Globe, Menu, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from './ui/button';

const navigation = [
  { to: '/', label: '홈' },
  { to: '/adaptation-guide', label: '적응대책 수립 가이드' },
  { to: '/tools', label: '지원도구' },
  { to: '/about', label: 'About' },
];

export function Header() {
  const location = useLocation();

  return (
    <header className="border-b bg-white">
      <div className="bg-[#004494] text-white">
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
      </div>

      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded bg-[#004494] font-bold text-white">
              KR
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">지방 기후위기 적응대책 리빙랩 지원 플랫폼</h1>
              <p className="text-xs text-gray-600">리빙랩 지원도구</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <input
                type="text"
                placeholder="Search..."
                className="w-64 rounded-md border py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-[#004494]"
              />
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            </div>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-5" />
            </Button>
          </div>
        </div>

        <nav className="border-t">
          <ul className="flex items-center gap-1 py-2">
            {navigation.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`rounded px-4 py-2 text-sm transition-colors ${
                    location.pathname === item.to ? 'bg-[#e6f0ff] text-[#004494]' : 'hover:bg-gray-100'
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
