import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, BellOff, Check, MessageCircle, Search, UserMinus, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, GlassCard } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { users } from '@/data/mock';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'online' | 'requests' | 'add';

export default function Friends() {
  const { friends, acceptFriend, toggleMute, removeFriend, toast } = useApp();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const accepted = friends.filter((f) => f.state === 'friends');
  const requests = friends.filter((f) => f.state === 'incoming');
  const online = accepted.filter((f) => f.user.status !== 'offline');

  const addResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const friendIds = new Set(friends.map((f) => f.user.id));
    return users.filter(
      (u) => u.id !== 'u1' && !friendIds.has(u.id) && (!q || `${u.displayName} ${u.username}`.toLowerCase().includes(q)),
    );
  }, [query, friends]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: accepted.length },
    { key: 'online', label: 'Online', count: online.length },
    { key: 'requests', label: 'Requests', count: requests.length },
    { key: 'add', label: 'Add Friend' },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-display text-white sm:text-3xl">Friends</h1>

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1 scrollbar-thin">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
              tab === t.key ? 'bg-primary/20 text-white' : 'text-slate-400 hover:text-white')}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabnums">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'add' && (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-xl glass px-3">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username…"
              aria-label="Search users"
              className="h-11 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            {addResults.map((u) => (
              <GlassCard key={u.id} className="flex items-center gap-3 p-3">
                <Avatar seed={u.avatar} name={u.displayName} size="md" status={u.status} />
                <Link to={`/profile/${u.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{u.displayName}</p>
                  <p className="truncate text-xs text-slate-400">@{u.username} · Lv {u.level}</p>
                </Link>
                <Button size="sm" onClick={() => toast({ title: `Friend request sent to ${u.displayName}`, variant: 'success' })}>
                  <UserPlus className="h-4 w-4" /> Add
                </Button>
              </GlassCard>
            ))}
          </div>
        </>
      )}

      {tab === 'requests' && (
        <div className="space-y-2">
          {requests.length === 0 ? (
            <EmptyState title="No pending requests" description="When someone adds you, it'll show up here." />
          ) : (
            requests.map((f) => (
              <GlassCard key={f.user.id} className="flex items-center gap-3 p-3">
                <Avatar seed={f.user.avatar} name={f.user.displayName} size="md" status={f.user.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{f.user.displayName}</p>
                  <p className="text-xs text-slate-400">wants to be your friend</p>
                </div>
                <Button size="sm" onClick={() => acceptFriend(f.user.id)}>
                  <Check className="h-4 w-4" /> Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeFriend(f.user.id)} aria-label="Decline">
                  <X className="h-4 w-4" />
                </Button>
              </GlassCard>
            ))
          )}
        </div>
      )}

      {(tab === 'all' || tab === 'online') && (
        <div className="space-y-2">
          {(tab === 'online' ? online : accepted).map((f) => (
            <GlassCard key={f.user.id} className="flex items-center gap-3 p-3" hover>
              <Avatar seed={f.user.avatar} name={f.user.displayName} size="md" status={f.user.status} />
              <Link to={`/profile/${f.user.id}`} className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium text-white">
                  {f.user.displayName}
                  {f.muted && <BellOff className="h-3.5 w-3.5 text-slate-500" aria-label="muted" />}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {f.playing ? <Badge tone="success">Playing {f.playing}</Badge> : f.user.statusMessage ?? 'Offline'}
                </p>
              </Link>
              <Button size="icon" variant="ghost" aria-label="Message">
                <MessageCircle className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="ghost" aria-label={f.muted ? 'Unmute' : 'Mute'} onClick={() => toggleMute(f.user.id)}>
                <BellOff className={cn('h-5 w-5', f.muted && 'text-warning')} />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Remove friend" onClick={() => { removeFriend(f.user.id); toast({ title: `Removed ${f.user.displayName}`, variant: 'default' }); }}>
                <UserMinus className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Block" onClick={() => { removeFriend(f.user.id); toast({ title: `Blocked ${f.user.displayName}`, variant: 'default' }); }}>
                <Ban className="h-5 w-5 text-danger" />
              </Button>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
