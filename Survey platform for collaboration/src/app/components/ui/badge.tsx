import { HTMLAttributes } from 'react';

type BadgeStatus = 'pending' | 'in-progress' | 'completed' | 'revision' | 'confirmed';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus;
  children: React.ReactNode;
}

const statusStyles = {
  'pending': 'bg-gray-100 text-gray-700 border-gray-300',
  'in-progress': 'bg-blue-100 text-blue-700 border-blue-300',
  'completed': 'bg-green-100 text-green-700 border-green-300',
  'revision': 'bg-orange-100 text-orange-700 border-orange-300',
  'confirmed': 'bg-blue-900 text-white border-blue-900',
};

export function Badge({ status, className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded border ${statusStyles[status]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export const statusLabels = {
  'pending': '미작성',
  'in-progress': '작성중',
  'completed': '제출완료',
  'revision': '수정요청',
  'confirmed': '확정',
};
