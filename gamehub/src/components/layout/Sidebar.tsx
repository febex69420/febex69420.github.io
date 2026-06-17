import { NavLink } from 'react-router-dom';
import { Gamepad2, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav';

export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:shrink-0 border-r border-white/5 bg-surface/40 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow">
          <Gamepad2 className="h-5 w-5 text-white" aria-hidden />
        </div>
        <span className="font-display text-lg tracking-wider text-white">GameHub</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Primary">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focusable',
                isActive
                  ? 'bg-primary/15 text-white shadow-[inset_0_0_0_1px_rgba(124,92,255,0.4)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn('h-5 w-5 transition-colors', isActive && 'text-primary-soft')}
                  aria-hidden
                />
                {label}
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focusable',
              isActive ? 'bg-white/5 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <Settings className="h-5 w-5" aria-hidden />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
