import { useEffect, useState } from 'react';
import { CalendarPlus, Check, Clock, HelpCircle, Repeat, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Badge, GlassCard } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { sessions as seedSessions, userById } from '@/data/mock';
import { useApp } from '@/store/AppContext';
import { cn, formatCountdown, msUntil } from '@/lib/utils';
import type { GameSession, RsvpState } from '@/types';

function Countdown({ iso }: { iso: string }) {
  const [ms, setMs] = useState(() => msUntil(iso));
  useEffect(() => {
    const t = setInterval(() => setMs(msUntil(iso)), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return <span className="tabnums text-accent-soft">{formatCountdown(ms)}</span>;
}

const rsvpConfig: { key: RsvpState; label: string; icon: typeof Check; tone: string }[] = [
  { key: 'going', label: 'Going', icon: Check, tone: 'bg-success/20 text-success border-success/40' },
  { key: 'maybe', label: 'Maybe', icon: HelpCircle, tone: 'bg-warning/20 text-warning border-warning/40' },
  { key: 'declined', label: "Can't", icon: X, tone: 'bg-danger/20 text-danger border-danger/40' },
];

export default function Events() {
  const { currentUser, toast } = useApp();
  const [sessions, setSessions] = useState<GameSession[]>(seedSessions);
  const [createOpen, setCreateOpen] = useState(false);

  const setRsvp = (sessionId: string, state: RsvpState) => {
    if (!currentUser) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, rsvps: { ...s.rsvps, [currentUser.id]: state } } : s)),
    );
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-white sm:text-3xl">Game Nights</h1>
          <p className="text-sm text-slate-400">Plan sessions, RSVP, and never miss a game.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> Schedule Session
        </Button>
      </div>

      <div className="space-y-4">
        {sessions
          .slice()
          .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
          .map((s) => {
            const host = userById(s.hostId);
            const myRsvp = currentUser ? s.rsvps[currentUser.id] ?? 'none' : 'none';
            const going = Object.entries(s.rsvps).filter(([, v]) => v === 'going');
            return (
              <GlassCard key={s.id} className="overflow-hidden">
                <div className="h-1.5 w-full" style={{ background: s.color }} />
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                        {s.title}
                        {s.recurring && s.recurring !== 'none' && (
                          <Badge tone="neutral"><Repeat className="h-3 w-3" /> {s.recurring}</Badge>
                        )}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-3 text-sm text-slate-400">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(s.startsAt).toLocaleString('en', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                        <Badge tone="primary">{s.game}</Badge>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Starts in</p>
                      <Countdown iso={s.startsAt} />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                    {host && <Avatar seed={host.avatar} name={host.displayName} size="xs" />}
                    <span>Hosted by {host?.displayName}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-400" aria-hidden />
                      <div className="flex -space-x-2">
                        {going.slice(0, 5).map(([id]) => {
                          const u = userById(id);
                          return u ? <Avatar key={id} seed={u.avatar} name={u.displayName} size="xs" /> : null;
                        })}
                      </div>
                      <span className="text-xs text-slate-400 tabnums">{going.length} going</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {rsvpConfig.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => { setRsvp(s.id, r.key); toast({ title: `RSVP: ${r.label}`, variant: 'success' }); }}
                        className={cn('flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition-all cursor-pointer',
                          myRsvp === r.key ? r.tone : 'border-white/10 text-slate-300 hover:bg-white/5')}
                      >
                        <r.icon className="h-4 w-4" /> {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </GlassCard>
            );
          })}
      </div>

      <CreateSessionModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(s) => { setSessions((p) => [...p, s]); toast({ title: 'Session scheduled', variant: 'success' }); }} />
    </div>
  );
}

function CreateSessionModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (s: GameSession) => void }) {
  const { currentUser } = useApp();
  const [title, setTitle] = useState('');
  const [game, setGame] = useState('Valorant');
  const [when, setWhen] = useState('');

  const submit = () => {
    if (!title.trim() || !currentUser) return;
    onCreate({
      id: Math.random().toString(36).slice(2),
      title: title.trim(),
      game,
      hostId: currentUser.id,
      startsAt: when ? new Date(when).toISOString() : new Date(Date.now() + 3600_000).toISOString(),
      durationMin: 120,
      inviteeIds: [],
      rsvps: { [currentUser.id]: 'going' },
      recurring: 'none',
      color: '#7c5cff',
    });
    setTitle('');
    setWhen('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Schedule a Session">
      <div className="space-y-4">
        <Field label="Session name">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday Ranked Grind" className="input" />
        </Field>
        <Field label="Game">
          <input value={game} onChange={(e) => setGame(e.target.value)} className="input" />
        </Field>
        <Field label="Date & time">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}
