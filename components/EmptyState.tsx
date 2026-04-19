import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
    tone?: 'emerald' | 'amber' | 'sky';
  };
  className?: string;
}

const ACTION_TONES = {
  emerald: 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-500 focus-visible:ring-emerald-400/60',
  amber: 'text-amber-400 border-amber-500/20 hover:bg-amber-500 hover:text-slate-950 hover:border-amber-500 focus-visible:ring-amber-400/60',
  sky: 'text-sky-400 border-sky-500/20 hover:bg-sky-500 hover:text-slate-950 hover:border-sky-500 focus-visible:ring-sky-400/60',
} as const;

export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  className = '',
}: EmptyStateProps) {
  const toneKey = action?.tone ?? 'emerald';
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-6 rounded-[2rem] border-2 border-dashed border-slate-800/60 bg-slate-900/30 ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-slate-600" aria-hidden="true" />
      </div>
      <p className="text-sm font-black text-slate-300 tracking-tight">{title}</p>
      {subtitle && (
        <p className="mt-1.5 text-[11px] text-slate-500 font-medium max-w-[260px] leading-relaxed">
          {subtitle}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-5 px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-widest border bg-transparent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${ACTION_TONES[toneKey]}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
