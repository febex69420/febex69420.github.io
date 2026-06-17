import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Award,
  CalendarDays,
  Crown,
  Flame,
  Gamepad2,
  Link as LinkIcon,
  Lock,
  MessageCircle,
  Shield,
  Star,
  UserPlus,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Badge, GlassCard, ProgressBar, SectionHeader } from '@/components/ui/primitives';
import { clips as allClips, CURRENT_USER_ID, userById } from '@/data/mock';
import { useApp } from '@/store/AppContext';
import { compact, gradientFromSeed } from '@/lib/utils';
import type { Achievement, Badge as BadgeT, User } from '@/types';

const iconMap: Record<string, typeof Award> = {
  Award, Crown, Flame, Star, Shield, Trophy: Crown, Video: Gamepad2, Users: UserPlus,
  Moon: Star, TrendingUp: Flame, Zap: Flame,
};

export default function Profile() {
  const { userId } = useParams();
  const { currentUser, toast } = useApp();
  const user = userById(userId ?? CURRENT_USER_ID) ?? currentUser;
  const isSelf = !userId || userId === CURRENT_USER_ID;
  const [tab, setTab] = useState<'overview' | 'clips' | 'achievements'>('overview');

  if (!user) return null;
  const userClips = allClips.filter((c) => c.authorId === user.id);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Banner */}
      <div className="relative">
        <div
          className="h-40 w-full rounded-2xl ring-1 ring-white/10 sm:h-56"
          style={{ backgroundImage: gradientFromSeed(user.banner ?? user.avatar) }}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-base/80 to-transparent" />
        </div>
        <div className="px-4 sm:px-6">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="rounded-full ring-4 ring-base">
                <Avatar seed={user.avatar} name={user.displayName} size="xl" status={user.status} />
              </div>
              <div className="pb-1">
                <h1 className="flex items-center gap-2 text-2xl font-display text-white">
                  {user.displayName}
                  <Badge tone="primary">Lv {user.level}</Badge>
                </h1>
                <p className="text-sm text-slate-400">@{user.username}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {isSelf ? (
                <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Edit profile coming via Settings', variant: 'default' })}>
                  Edit Profile
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => toast({ title: `Friend request sent to ${user.displayName}`, variant: 'success' })}>
                    <UserPlus className="h-4 w-4" /> Add Friend
                  </Button>
                  <Button variant="secondary" size="sm">
                    <MessageCircle className="h-4 w-4" /> Message
                  </Button>
                </>
              )}
            </div>
          </div>

          {user.statusMessage && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-sm text-slate-300">
              <span className="h-2 w-2 rounded-full bg-success" /> {user.statusMessage}
            </p>
          )}
          {user.bio && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{user.bio}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" /> Joined {new Date(user.joinedAt).getFullYear()}
            </span>
            {user.socialLinks.map((l) => (
              <a
                key={l.platform}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-primary-soft hover:underline"
              >
                <LinkIcon className="h-4 w-4" /> {l.platform}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div className="mt-5 px-4 sm:px-6">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
          <span>Level {user.level}</span>
          <span className="tabnums">{compact(user.xp)} / {compact(user.xpToNext)} XP</span>
        </div>
        <ProgressBar value={user.xp / user.xpToNext} />
      </div>

      {/* Tabs */}
      <div className="mt-6 px-4 sm:px-6">
        <div role="tablist" className="flex gap-1 rounded-xl bg-white/5 p-1">
          {(['overview', 'clips', 'achievements'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors cursor-pointer ${
                tab === t ? 'bg-primary/20 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 px-4 sm:px-6">
        {tab === 'overview' && <Overview user={user} badges={user.badges} />}
        {tab === 'clips' && <ClipGallery clips={userClips} />}
        {tab === 'achievements' && <Achievements list={user.achievements} />}
      </div>
    </div>
  );
}

function Overview({ user, badges }: { user: User; badges: BadgeT[] }) {
  const stats = [
    { label: 'Clips Posted', value: user.stats.clipsPosted },
    { label: 'Total Likes', value: user.stats.totalLikes },
    { label: 'Tournaments Won', value: user.stats.tournamentsWon },
    { label: 'Sessions', value: user.stats.sessionsAttended },
    { label: 'Messages', value: user.stats.messagesSent },
    { label: 'Best Streak', value: user.stats.longestStreak },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <GlassCard className="p-4">
        <SectionHeader title="Statistics" />
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white/[0.03] p-3 text-center">
              <p className="tabnums text-xl font-semibold text-white">{compact(s.value)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <SectionHeader title="Badges" />
        <div className="flex flex-wrap gap-2">
          {badges.map((b) => {
            const Icon = iconMap[b.icon] ?? Award;
            return (
              <span key={b.id} className="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-200" title={b.description}>
                <Icon className="h-4 w-4 text-warning" aria-hidden /> {b.name}
              </span>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-4 md:col-span-2">
        <SectionHeader title="Favorite Games" icon={<Gamepad2 className="h-4 w-4" />} />
        <div className="flex flex-wrap gap-2">
          {user.favoriteGames.map((g) => (
            <Badge key={g} tone="accent">{g}</Badge>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

function ClipGallery({ clips }: { clips: typeof allClips }) {
  if (clips.length === 0) {
    return (
      <GlassCard className="p-8 text-center text-slate-400">
        <Lock className="mx-auto mb-2 h-6 w-6" /> No public clips yet.
      </GlassCard>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {clips.map((c) => (
        <motion.div
          key={c.id}
          whileHover={{ scale: 1.03 }}
          className="group relative aspect-[9/12] overflow-hidden rounded-xl ring-1 ring-white/10"
          style={{ backgroundImage: gradientFromSeed(c.thumbnail) }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-2">
            <p className="line-clamp-2 text-xs font-medium text-white">{c.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-300">
              <Flame className="h-3 w-3" /> {compact(c.likes)}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function Achievements({ list }: { list: Achievement[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((a) => {
        const Icon = iconMap[a.icon] ?? Award;
        const unlocked = !!a.unlockedAt;
        return (
          <GlassCard key={a.id} className={`flex items-center gap-3 p-4 ${unlocked ? '' : 'opacity-70'}`}>
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${unlocked ? 'bg-gradient-to-br from-primary to-accent' : 'bg-white/5'}`}>
              <Icon className={`h-6 w-6 ${unlocked ? 'text-white' : 'text-slate-500'}`} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-white">
                {a.name}
                {!unlocked && <Lock className="h-3.5 w-3.5 text-slate-500" aria-label="locked" />}
              </p>
              <p className="text-xs text-slate-400">{a.description}</p>
              {!unlocked && <ProgressBar value={a.progress} tone="accent" className="mt-2 h-1.5" />}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
