import React from 'react';

export const PostCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs animate-pulse flex flex-col justify-between">
      <div className="h-48 bg-slate-200 w-full" />
      <div className="p-5 space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-4 w-20 bg-slate-200 rounded-full" />
          <div className="h-3 w-16 bg-slate-200 rounded-md" />
        </div>
        <div className="h-5 bg-slate-200 rounded-md w-3/4" />
        <div className="space-y-1.5 pt-1">
          <div className="h-3 bg-slate-200 rounded-md w-full" />
          <div className="h-3 bg-slate-200 rounded-md w-2/3" />
        </div>
        <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
          <div className="h-3 w-24 bg-slate-200 rounded-md" />
          <div className="h-3 w-16 bg-slate-200 rounded-md" />
        </div>
      </div>
    </div>
  );
};
