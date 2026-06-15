import { ExternalLink, FlaskConical, Wrench } from 'lucide-react';
import { Link } from 'react-router';

interface RightSidebarProps {
  selectedItem: string;
  onSelectItem: (id: string) => void;
}

const sidebarItems = [
  {
    id: 'citizen-science-platform',
    label: '시민과학 데이터 수집 플랫폼',
    description: '시민참여 기반 지역 데이터 수집',
    externalUrl: 'https://livinglab.mangosystem.com/',
    icon: FlaskConical,
  },
  {
    id: 'adaptation-support-tools',
    label: '적응대책 지원도구',
    description: '수립 단계별 지원도구 살펴보기',
    internalUrl: '/tools#adaptation-support-tools',
    icon: Wrench,
  },
];

export function RightSidebar({ selectedItem, onSelectItem }: RightSidebarProps) {
  return (
    <aside className="sticky top-6 h-fit rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="mb-3 px-2 pb-2">
        <p className="text-xs font-extrabold tracking-wider text-emerald-700">QUICK LINKS</p>
        <h2 className="mt-1 font-extrabold text-slate-900">연계 플랫폼</h2>
      </div>
      <nav className="space-y-3">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const className = `group block w-full cursor-pointer rounded-xl border p-4 text-left transition-all ${
            selectedItem === item.id
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-md'
              : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50'
          }`;
          const content = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className={`grid size-9 place-items-center rounded-lg ${selectedItem === item.id ? 'bg-white/15' : 'bg-white text-emerald-700 shadow-sm'}`}>
                  <Icon className="size-4" />
                </div>
                {item.externalUrl && <ExternalLink className="size-4 opacity-60" />}
              </div>
              <p className="mt-4 text-sm font-extrabold leading-5">{item.label}</p>
              <p className={`mt-1 text-xs leading-5 ${selectedItem === item.id ? 'text-emerald-50' : 'text-slate-500'}`}>
                {item.description}
              </p>
            </>
          );

          return item.externalUrl ? (
            <a key={item.id} href={item.externalUrl} target="_blank" rel="noopener noreferrer" className={className}>
              {content}
            </a>
          ) : item.internalUrl ? (
            <Link key={item.id} to={item.internalUrl} className={className}>
              {content}
            </Link>
          ) : (
            <button key={item.id} type="button" className={className} onClick={() => onSelectItem(item.id)}>
              {content}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
