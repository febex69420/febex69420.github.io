import { Crown, Trophy } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, GlassCard, SectionHeader } from '@/components/ui/primitives';
import { tournaments, userById } from '@/data/mock';
import { cn } from '@/lib/utils';
import type { BracketMatch, BracketTeam, Tournament } from '@/types';

export default function Tournaments() {
  const t = tournaments[0];
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-warning to-rose shadow-glow">
          <Trophy className="h-6 w-6 text-white" aria-hidden />
        </span>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display text-white sm:text-3xl">
            {t.name}
            <Badge tone={t.status === 'live' ? 'danger' : 'neutral'}>{t.status === 'live' ? '● LIVE' : t.status}</Badge>
          </h1>
          <p className="text-sm text-slate-400">{t.game} · single elimination · {t.teams.length} teams</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Bracket tournament={t} />
        </div>
        <div className="space-y-4">
          <Standings tournament={t} />
        </div>
      </div>
    </div>
  );
}

function Bracket({ tournament }: { tournament: Tournament }) {
  const rounds = Array.from(new Set(tournament.matches.map((m) => m.round))).sort();
  const teamById = (id: string | null) => (id ? tournament.teams.find((tm) => tm.id === id) : undefined);
  const roundName = (r: number, total: number) =>
    r === total ? 'Final' : r === total - 1 ? 'Semifinals' : `Round ${r}`;

  return (
    <GlassCard className="overflow-x-auto p-4 scrollbar-thin">
      <SectionHeader title="Bracket" />
      <div className="flex gap-6">
        {rounds.map((r) => (
          <div key={r} className="flex min-w-[200px] flex-1 flex-col justify-around gap-4">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
              {roundName(r, rounds.length)}
            </p>
            {tournament.matches
              .filter((m) => m.round === r)
              .map((m) => (
                <MatchCard key={m.id} match={m} teamA={teamById(m.teamAId)} teamB={teamById(m.teamBId)} />
              ))}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function MatchCard({ match, teamA, teamB }: { match: BracketMatch; teamA?: BracketTeam; teamB?: BracketTeam }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <TeamRow team={teamA} score={match.scoreA} winner={match.winnerId === teamA?.id} />
      <div className="h-px bg-white/10" />
      <TeamRow team={teamB} score={match.scoreB} winner={match.winnerId === teamB?.id} />
    </div>
  );
}

function TeamRow({ team, score, winner }: { team?: BracketTeam; score?: number; winner?: boolean }) {
  if (!team) {
    return <div className="flex items-center px-3 py-2.5 text-sm text-slate-600">TBD</div>;
  }
  const lead = userById(team.memberIds[0]);
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2.5', winner && 'bg-success/10')}>
      {lead && <Avatar seed={lead.avatar} name={team.name} size="xs" />}
      <span className={cn('flex-1 truncate text-sm', winner ? 'font-semibold text-white' : 'text-slate-300')}>{team.name}</span>
      {winner && <Crown className="h-3.5 w-3.5 text-warning" aria-label="winner" />}
      <span className={cn('tabnums text-sm', winner ? 'text-success' : 'text-slate-400')}>{score ?? '–'}</span>
    </div>
  );
}

function Standings({ tournament }: { tournament: Tournament }) {
  const ranked = [...tournament.teams].sort((a, b) => a.seed - b.seed);
  return (
    <GlassCard className="p-4">
      <SectionHeader title="Leaderboard" icon={<Trophy className="h-4 w-4" />} />
      <ul className="space-y-2">
        {ranked.map((team, i) => {
          const lead = userById(team.memberIds[0]);
          return (
            <li key={team.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5">
              <span className={cn('grid h-7 w-7 place-items-center rounded-lg text-sm font-bold tabnums',
                i === 0 ? 'bg-warning/20 text-warning' : 'bg-white/5 text-slate-400')}>
                {i + 1}
              </span>
              {lead && <Avatar seed={lead.avatar} name={team.name} size="sm" />}
              <span className="flex-1 truncate text-sm font-medium text-white">{team.name}</span>
              <span className="text-xs text-slate-500 tabnums">Seed {team.seed}</span>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
