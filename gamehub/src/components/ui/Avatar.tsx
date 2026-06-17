import { cn, gradientFromSeed, initials } from '@/lib/utils';
import type { PresenceStatus } from '@/types';

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
} as const;

const statusColor: Record<PresenceStatus, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-slate-500',
};

interface AvatarProps {
  seed: string;
  name: string;
  size?: keyof typeof sizeMap;
  status?: PresenceStatus;
  className?: string;
}

export function Avatar({ seed, name, size = 'md', status, className }: AvatarProps) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full font-semibold text-white/90 ring-1 ring-white/10 select-none',
          sizeMap[size],
        )}
        style={{ backgroundImage: gradientFromSeed(seed) }}
        role="img"
        aria-label={`${name} avatar`}
      >
        {initials(name)}
      </div>
      {status && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-surface',
            size === 'xs' || size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5',
            statusColor[status],
            status === 'online' && 'animate-pulse-ring',
          )}
          aria-label={`status: ${status}`}
        />
      )}
    </div>
  );
}
