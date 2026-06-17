import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, LogOut, Search, Settings, User as UserIcon } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { GlobalSearch } from '@/components/common/GlobalSearch';
import { useApp } from '@/store/AppContext';
import { userById } from '@/data/mock';
import { cn, timeAgo } from '@/lib/utils';

function useClickOutside<T extends HTMLElement>(onOut: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOut]);
  return ref;
}

function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const navigate = useNavigate();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        className="relative grid h-11 w-11 place-items-center rounded-xl text-slate-300 transition-colors hover:bg-white/5 hover:text-white focusable cursor-pointer"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white tabnums">
            {unreadCount}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-2xl p-2 shadow-card"
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <h3 className="text-sm font-semibold text-white">Notifications</h3>
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-primary-soft hover:underline cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            </div>
            <ul className="max-h-80 space-y-0.5 overflow-y-auto scrollbar-thin">
              {notifications.map((n) => {
                const actor = n.actorId ? userById(n.actorId) : undefined;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => {
                        markRead(n.id);
                        setOpen(false);
                        if (n.href) navigate(n.href);
                      }}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/5 cursor-pointer',
                        !n.read && 'bg-primary/5',
                      )}
                    >
                      {actor ? (
                        <Avatar seed={actor.avatar} name={actor.displayName} size="sm" />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-primary-soft">
                          <Bell className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-white">{n.title}</span>
                        <span className="block truncate text-xs text-slate-400">{n.body}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-500 tabnums">
                        {timeAgo(n.createdAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { currentUser, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  if (!currentUser) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-white/5 focusable cursor-pointer"
      >
        <Avatar seed={currentUser.avatar} name={currentUser.displayName} size="sm" status={currentUser.status} />
        <span className="hidden text-sm font-medium text-white sm:block">{currentUser.displayName}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute right-0 z-50 mt-2 w-52 rounded-2xl p-1.5 shadow-card"
          >
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/5 cursor-pointer"
            >
              <UserIcon className="h-4 w-4" aria-hidden /> My Profile
            </Link>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/5 cursor-pointer"
            >
              <Settings className="h-4 w-4" aria-hidden /> Settings
            </Link>
            <div className="my-1 h-px bg-white/10" />
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10 cursor-pointer"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Topbar() {
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd/Ctrl+K opens universal search (keyboard-shortcuts rule).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-white/5 bg-base/70 px-4 backdrop-blur-xl sm:px-6">
      <button
        onClick={() => setSearchOpen(true)}
        className="flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-left text-sm text-slate-500 transition-colors hover:bg-white/5 focusable cursor-pointer sm:max-w-xs"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="flex-1 truncate">Search…</span>
        <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] sm:block">⌘K</kbd>
      </button>
      <div className="flex-1" />
      <NotificationBell />
      <UserMenu />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
