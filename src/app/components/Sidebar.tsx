import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SidebarProps {
  selectedItem: string;
  onSelectItem: (id: string) => void;
}

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

const treeData: TreeNode[] = [
  {
    id: '1',
    label: '1. 시작하기',
    children: [
      { id: '1-1', label: '지방 기후위기 적응대책 지원도구 개념' }
    ]
  },
  {
    id: '2',
    label: '2. 리빙랩을 통한 지방 기후위기 적응대책 지원'
  }
];

function TreeItem({ node, selectedItem, onSelectItem, level = 0 }: { 
  node: TreeNode; 
  selectedItem: string; 
  onSelectItem: (id: string) => void;
  level?: number;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedItem === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-2 px-3 cursor-pointer rounded transition-colors ${
          isSelected 
            ? 'bg-[#004494] text-white' 
            : 'hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={() => {
          if (hasChildren) {
            setIsOpen(!isOpen);
          }
          onSelectItem(node.id);
        }}
      >
        {hasChildren && (
          <span className="flex-shrink-0">
            {isOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </span>
        )}
        {!hasChildren && <span className="w-4" />}
        <span className="text-sm flex-1">{node.label}</span>
      </div>
      {hasChildren && isOpen && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              selectedItem={selectedItem}
              onSelectItem={onSelectItem}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ selectedItem, onSelectItem }: SidebarProps) {
  return (
    <aside className="bg-white border rounded-lg p-4 h-fit sticky top-8">
      <h2 className="font-bold text-lg mb-4 text-gray-900">목차</h2>
      <nav>
        {treeData.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            selectedItem={selectedItem}
            onSelectItem={onSelectItem}
          />
        ))}
      </nav>
    </aside>
  );
}