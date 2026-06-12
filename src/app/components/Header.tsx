import { Search, Globe, Menu } from 'lucide-react';
import { Button } from './ui/button';
import { Link, useLocation } from 'react-router';

export function Header() {
  const location = useLocation();

  return (
    <header className="border-b bg-white">
      {/* Top bar with EU branding */}
      <div className="bg-[#004494] text-white">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Globe className="size-4" />
              <span className="text-sm">서울시립대학교</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-sm hover:underline">EN</button>
            <button className="text-sm hover:underline">Login</button>
          </div>
        </div>
      </div>

      {/* Main navigation */}
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#004494] rounded flex items-center justify-center text-white font-bold">
                KR
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">지방 기후위기 적응대책 리빙랩 지원 플랫폼</h1>
                <p className="text-xs text-gray-600">리빙랩 지원도구</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                className="pl-10 pr-4 py-2 border rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-[#004494]"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            </div>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-5" />
            </Button>
          </div>
        </div>

        {/* Navigation menu */}
        <nav className="border-t">
          <ul className="flex items-center gap-1 py-2">
            <li>
              <Link 
                to="/" 
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  location.pathname === '/' 
                    ? 'bg-[#e6f0ff] text-[#004494]' 
                    : 'hover:bg-gray-100'
                }`}
              >
                홈
              </Link>
            </li>
            <li>
              <Link 
                to="/adaptation-guide" 
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  location.pathname === '/adaptation-guide' 
                    ? 'bg-[#e6f0ff] text-[#004494]' 
                    : 'hover:bg-gray-100'
                }`}
              >
                적응대책 수립 가이드
              </Link>
            </li>
            <li>
              <Link 
                to="/tools" 
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  location.pathname === '/tools' 
                    ? 'bg-[#e6f0ff] text-[#004494]' 
                    : 'hover:bg-gray-100'
                }`}
              >
                지원도구
              </Link>
            </li>
            <li>
              <Link 
                to="/cases" 
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  location.pathname === '/cases' 
                    ? 'bg-[#e6f0ff] text-[#004494]' 
                    : 'hover:bg-gray-100'
                }`}
              >
                사례
              </Link>
            </li>
            <li>
              <Link 
                to="/about" 
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  location.pathname === '/about' 
                    ? 'bg-[#e6f0ff] text-[#004494]' 
                    : 'hover:bg-gray-100'
                }`}
              >
                About
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}