import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CalendarClock,
  Clapperboard,
  Flame,
  MessageCircle,
  Trophy,
  Users,
  Vote,
  Zap,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, ProgressBar, SectionHeader } from '@/components/ui/primitives';
import {
  activity,
  clips,
  dmThreads,
  friends,
  polls,
  sessions,
  tournaments,
  userById,
} from '@/data/mock';
import { useApp } from '@/store/AppContext';
import { compact, formatCountdown, gradientFromSeed, msUntil, timeAgo } from '@/lib/utils';

function useCountdown(iso: string) {
  const [ms, setMs] = useState(() => msUntil(iso));
  useEffect(() => {
    const t = setInterval(() => setMs(msUntil(iso)), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return ms;
}

export function OnlineFriendsWidget() {
  const online = friends.filter((f) => f.state === 'friends' && f.user.status !== 'offline');
  return (
    <div>
      <SectionHeader
        title="Online Friends"
        icon={<Users className="h-4 w-4" />}
        action={<Link to="/friends" className="text-xs text-primary-soft hover:underline">All</Link>}
      />
      <ul className="space-y-1">
        {online.map((f) => (
          <li key={f.user.id}>
            <Link
              to={`/profile/${f.user.id}`}
              className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/5 cursor-pointer"
            >
              <Avatar seed={f.user.avatar} name={f.user.displayName} size="sm" status={f.user.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{f.user.displayName}</span>
                <span className="block truncate text-xs text-slate-400">
                  {f.playing ? `Playing ${f.playing}` : f.user.statusMessage ?? 'Online'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SessionsWidget() {
  const next = sessions[0];
  const ms = useCountdown(next.startsAt);
  return (
    <div>
      <SectionHeader
        title="Upcoming Sessions"
        icon={<CalendarClock className="h-4 w-4" />}
        action={<Link to="/events" className="text-xs text-primary-soft hover:underline">Calendar</Link>}
      />
      <div className="rounded-xl bg-white/[0.03] p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-white">{next.title}</span>
          <Badge tone="primary">{next.game}</Badge>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
          <span className="tabnums text-accent-soft">{formatCountdown(ms)}</span>
          <span>·</span>
          <span>{Object.values(next.rsvps).filter((r) => r === 'going').length} going</span>
        </div>
        <div className="mt-3 flex -space-x-2">
          {next.inviteeIds.slice(0, 5).map((id) => {
            const u = userById(id);
            return u ? <Avatar key={id} seed={u.avatar} name={u.displayName} size="xs" /> : null;
          })}
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {sessions.slice(1).map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-white/5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 truncate text-slate-300">{s.title}</span>
            <span className="text-xs text-slate-500">{timeAgo(s.startsAt).replace('-', '')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConversationsWidget() {
  return (
    <div>
      <SectionHeader
        title="Recent Conversations"
        icon={<MessageCircle className="h-4 w-4" />}
        action={<Link to="/chat" className="text-xs text-primary-soft hover:underline">Open</Link>}
      />
      <ul className="space-y-1">
        {dmThreads.map((t) => {
          const other = t.isGroup ? null : userById(t.participantIds.find((p) => p !== 'u1')!);
          const name = t.isGroup ? t.name! : other?.displayName ?? 'Unknown';
          return (
            <li key={t.id}>
              <Link to="/chat" className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 cursor-pointer">
                {other ? (
                  <Avatar seed={other.avatar} name={name} size="sm" status={other.status} />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-full" style={{ backgroundImage: gradientFromSeed(name) }}>
                    <Users className="h-4 w-4 text-white/90" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{name}</span>
                  <span className="block text-xs text-slate-500">{timeAgo(t.lastMessageAt)}</span>
                </span>
                {t.unread > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white tabnums">
                    {t.unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ClipsWidget({ variant }: { variant: 'new' | 'trending' }) {
  const list = variant === 'trending'
    ? [...clips].sort((a, b) => b.views - a.views).slice(0, 4)
    : [...clips].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 4);
  return (
    <div>
      <SectionHeader
        title={variant === 'trending' ? 'Trending Clips' : 'New Clips'}
        icon={variant === 'trending' ? <Flame className="h-4 w-4" /> : <Clapperboard className="h-4 w-4" />}
        action={<Link to="/clips" className="text-xs text-primary-soft hover:underline">Feed</Link>}
      />
      <div className="grid grid-cols-2 gap-2">
        {list.map((c) => (
          <Link
            key={c.id}
            to="/clips"
            className="group relative aspect-video overflow-hidden rounded-xl ring-1 ring-white/10"
            style={{ backgroundImage: gradientFromSeed(c.thumbnail) }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-2">
              <p className="line-clamp-1 text-xs font-medium text-white">{c.title}</p>
              <p className="flex items-center gap-1 text-[10px] text-slate-300">
                <Flame className="h-3 w-3" /> {compact(c.views)} views
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function TournamentsWidget() {
  const t = tournaments[0];
  return (
    <div>
      <SectionHeader
        title="Tournaments"
        icon={<Trophy className="h-4 w-4" />}
        action={<Link to="/tournaments" className="text-xs text-primary-soft hover:underline">Bracket</Link>}
      />
      <Link to="/tournaments" className="block rounded-xl bg-white/[0.03] p-3 hover:bg-white/5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-white">{t.name}</span>
          <Badge tone={t.status === 'live' ? 'danger' : 'neutral'}>{t.status === 'live' ? '● LIVE' : t.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-400">{t.teams.length} teams · {t.game}</p>
      </Link>
    </div>
  );
}

export function PollsWidget() {
  const [poll, setPoll] = useState(polls[0]);
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  const vote = (optionId: string) => {
    if (poll.votedOptionId) return;
    setPoll((p) => ({
      ...p,
      votedOptionId: optionId,
      options: p.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
    }));
  };
  return (
    <div>
      <SectionHeader title="Active Poll" icon={<Vote className="h-4 w-4" />} />
      <p className="mb-2 text-sm font-medium text-white">{poll.question}</p>
      <ul className="space-y-2">
        {poll.options.map((o) => {
          const pct = total ? o.votes / total : 0;
          const mine = poll.votedOptionId === o.id;
          return (
            <li key={o.id}>
              <button
                onClick={() => vote(o.id)}
                disabled={!!poll.votedOptionId}
                className="relative w-full overflow-hidden rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 disabled:cursor-default cursor-pointer"
              >
                <span className="relative z-10 flex items-center justify-between">
                  <span className={mine ? 'font-semibold text-white' : 'text-slate-300'}>{o.label}</span>
                  {poll.votedOptionId && <span className="tabnums text-xs text-slate-400">{Math.round(pct * 100)}%</span>}
                </span>
                {poll.votedOptionId && (
                  <span className="absolute inset-y-0 left-0 z-0 bg-primary/20" style={{ width: `${pct * 100}%` }} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ActivityWidget() {
  return (
    <div>
      <SectionHeader title="Recent Activity" icon={<Activity className="h-4 w-4" />} />
      <ul className="space-y-3">
        {activity.map((a) => {
          const u = userById(a.actorId);
          return (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              {u && <Avatar seed={u.avatar} name={u.displayName} size="xs" />}
              <p className="flex-1 text-slate-300">
                <span className="font-medium text-white">{u?.displayName}</span> {a.verb}{' '}
                <span className="text-primary-soft">{a.target}</span>
                <span className="ml-1 text-xs text-slate-500">· {timeAgo(a.createdAt)}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StatsWidget() {
  const { currentUser } = useApp();
  if (!currentUser) return null;
  const items = [
    { label: 'Clips', value: currentUser.stats.clipsPosted, icon: Clapperboard },
    { label: 'Likes', value: currentUser.stats.totalLikes, icon: Flame },
    { label: 'Wins', value: currentUser.stats.tournamentsWon, icon: Trophy },
    { label: 'Streak', value: currentUser.streak, icon: Zap },
  ];
  return (
    <div>
      <SectionHeader title="Your Stats" icon={<Zap className="h-4 w-4" />} />
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
          <span>Level {currentUser.level}</span>
          <span className="tabnums">{compact(currentUser.xp)} / {compact(currentUser.xpToNext)} XP</span>
        </div>
        <ProgressBar value={currentUser.xp / currentUser.xpToNext} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className="rounded-xl bg-white/[0.03] p-3">
            <it.icon className="mb-1 h-4 w-4 text-primary-soft" aria-hidden />
            <p className="tabnums text-lg font-semibold text-white">{compact(it.value)}</p>
            <p className="text-xs text-slate-400">{it.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
