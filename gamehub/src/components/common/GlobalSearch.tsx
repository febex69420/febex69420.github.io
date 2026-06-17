import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clapperboard,
  Hash,
  Search,
  Trophy,
  User as UserIcon,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { clips, servers, tournaments, users, sessions } from '@/data/mock';

interface Result {
  id: string;
  label: string;
  sub: string;
  icon: 'user' | 'clip' | 'channel' | 'event' | 'tournament';
  to: string;
  seed?: string;
}

// Universal search across users, channels, clips, events, tournaments.
function buildIndex(): Result[] {
  const idx: Result[] = [];
  users.forEach((u) =>
    idx.push({ id: u.id, label: u.displayName, sub: `@${u.username}`, icon: 'user', to: `/profile/${u.id}`, seed: u.avatar }),
  );
  servers.forEach((s) =>
    s.channels.forEach((c) =>
      idx.push({ id: c.id, label: `#${c.name}`, sub: s.name, icon: 'channel', to: `/chat/${c.id}` }),
    ),
  );
  clips.forEach((c) => idx.push({ id: c.id, label: c.title, sub: c.game, icon: 'clip', to: '/clips' }));
  sessions.forEach((s) => idx.push({ id: s.id, label: s.title, sub: s.game, icon: 'event', to: '/events' }));
  tournaments.forEach((t) =>
    idx.push({ id: t.id, label: t.name, sub: t.game, icon: 'tournament', to: '/tournaments' }),
  );
  return idx;
}

const iconFor = {
  user: UserIcon,
  clip: Clapperboard,
  channel: Hash,
  event: Calendar,
  tournament: Trophy,
};

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const index = useMemo(buildIndex, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return index.slice(0, 6);
    return index.filter((r) => `${r.label} ${r.sub}`.toLowerCase().includes(term)).slice(0, 8);
  }, [q, index]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <Modal open={open} onClose={onClose} className="sm:max-w-xl">
      <div className="-m-2">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3">
          <Search className="h-5 w-5 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people, channels, clips, events…"
            aria-label="Search GameHub"
            className="h-12 flex-1 bg-transparent text-white placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-xs text-slate-400 sm:block">
            Esc
          </kbd>
        </div>

        <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto scrollbar-thin" role="listbox">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-400">
              No results for “{q}”.
            </li>
          )}
          {results.map((r) => {
            const Icon = iconFor[r.icon];
            return (
              <li key={`${r.icon}-${r.id}`}>
                <button
                  onClick={() => go(r.to)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 focusable cursor-pointer"
                >
                  {r.seed ? (
                    <Avatar seed={r.seed} name={r.label} size="sm" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-slate-300">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{r.label}</span>
                    <span className="block truncate text-xs text-slate-400">{r.sub}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">{r.icon}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
