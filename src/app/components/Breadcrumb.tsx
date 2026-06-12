import { ChevronRight, Home } from 'lucide-react';

export function Breadcrumb() {
  return (
    <nav className="bg-gray-50 border-b">
      <div className="container mx-auto px-4 py-3">
        <ol className="flex items-center gap-2 text-sm">
          <li className="flex items-center gap-2">
            <Home className="size-4" />
            <a href="#" className="text-[#004494] hover:underline">
              Home
            </a>
          </li>
          <ChevronRight className="size-4 text-gray-400" />
          <li className="flex items-center gap-2">
            <a href="#" className="text-[#004494] hover:underline">
              Knowledge
            </a>
          </li>
          <ChevronRight className="size-4 text-gray-400" />
          <li className="flex items-center gap-2">
            <a href="#" className="text-[#004494] hover:underline">
              Tools
            </a>
          </li>
          <ChevronRight className="size-4 text-gray-400" />
          <li className="text-gray-600">지방 기후위기 적응대책 위한 리빙랩 지원 도구</li>
        </ol>
      </div>
    </nav>
  );
}