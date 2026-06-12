import { HTMLAttributes, ReactNode } from 'react';

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export function Table({ className = '', children, ...props }: TableProps) {
  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className={`w-full ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

interface TableHeaderProps {
  children: ReactNode;
}

export function TableHeader({ children }: TableHeaderProps) {
  return (
    <thead className="bg-muted">
      {children}
    </thead>
  );
}

interface TableBodyProps {
  children: ReactNode;
}

export function TableBody({ children }: TableBodyProps) {
  return (
    <tbody className="divide-y divide-border">
      {children}
    </tbody>
  );
}

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
}

export function TableRow({ className = '', children, ...props }: TableRowProps) {
  return (
    <tr className={`hover:bg-muted/50 ${className}`} {...props}>
      {children}
    </tr>
  );
}

interface TableHeadProps {
  children: ReactNode;
  className?: string;
}

export function TableHead({ className = '', children }: TableHeadProps) {
  return (
    <th className={`px-4 py-3 text-left text-muted-foreground ${className}`}>
      {children}
    </th>
  );
}

interface TableCellProps {
  children: ReactNode;
  className?: string;
}

export function TableCell({ className = '', children }: TableCellProps) {
  return (
    <td className={`px-4 py-3 ${className}`}>
      {children}
    </td>
  );
}
