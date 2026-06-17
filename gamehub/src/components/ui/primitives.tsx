import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// --- GlassCard -------------------------------------------------------------

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  strong?: boolean;
}

export function GlassCard({ className, hover, strong, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        strong ? 'glass-strong' : 'glass',
        'rounded-2xl shadow-card',
        hover && 'glass-hover',
        className,
      )}
      {...props}
    />
  );
}

// --- Badge / Chip ----------------------------------------------------------

const badgeTones = {
  primary: 'bg-primary/15 text-primary-soft border-primary/30',
  accent: 'bg-accent/15 text-accent-soft border-accent/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  neutral: 'bg-white/5 text-slate-300 border-white/10',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// --- Skeleton --------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

// --- ProgressBar -----------------------------------------------------------

export function ProgressBar({
  value,
  className,
  tone = 'primary',
}: {
  value: number; // 0..1
  className?: string;
  tone?: 'primary' | 'accent' | 'success';
}) {
  const tones = {
    primary: 'from-primary to-primary-soft',
    accent: 'from-accent to-accent-soft',
    success: 'from-success to-accent',
  };
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-white/10', className)}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500', tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

// --- EmptyState ------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-500">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --- SectionHeader ---------------------------------------------------------

export function SectionHeader({
  title,
  action,
  icon,
}: {
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}
