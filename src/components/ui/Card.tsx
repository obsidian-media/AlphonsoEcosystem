import React from 'react';
interface CardProps {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
  onClick?: () => void;
}
export function Card({ children, className = '', elevated, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-[--surface-2] border border-[--border] rounded-[--radius-lg] ${elevated ? '' : ''} ${onClick ? 'cursor-pointer hover:bg-[--surface-3] transition-colors duration-[--duration-normal]' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 py-3 border-b border-[--border] ${className}`}>{children}</div>;
}
export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 py-3 ${className}`}>{children}</div>;
}