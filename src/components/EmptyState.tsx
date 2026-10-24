import React from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onActionClick?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onActionClick,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 sm:p-14 text-center max-w-md mx-auto my-8 space-y-4 shadow-xs animate-in fade-in zoom-in duration-300">
      <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-indigo-50 to-indigo-100 text-indigo-600 flex items-center justify-center mx-auto ring-4 ring-indigo-50/60">
        <Icon className="w-8 h-8" />
      </div>

      <div className="space-y-1">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {actionLabel && (
        <div className="pt-2">
          {actionHref ? (
            <Link
              href={actionHref}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs"
            >
              <span>{actionLabel}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={onActionClick}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs"
            >
              <span>{actionLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
