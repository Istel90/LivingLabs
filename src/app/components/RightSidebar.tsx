interface RightSidebarProps {
  selectedItem: string;
  onSelectItem: (id: string) => void;
}

const sidebarItems = [
  {
    id: 'citizen-science-platform',
    label: '시민과학 데이터 수집 플랫폼',
    externalUrl: 'https://livinglab.mangosystem.com/',
  },
  { id: 'adaptation-support-tools', label: '적응대책 지원도구' }
];

export function RightSidebar({ selectedItem, onSelectItem }: RightSidebarProps) {
  return (
    <aside className="bg-white border rounded-lg p-4 h-fit sticky top-8">
      <nav className="space-y-2">
        {sidebarItems.map((item) => {
          const className = `block py-3 px-4 cursor-pointer rounded transition-colors ${
              selectedItem === item.id 
                ? 'bg-[#004494] text-white' 
                : 'hover:bg-gray-100'
            }`;

          if (item.externalUrl) {
            return (
              <a
                key={item.id}
                href={item.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                <span className="text-sm font-medium">{item.label}</span>
              </a>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className={`${className} w-full text-left`}
              onClick={() => onSelectItem(item.id)}
            >
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
