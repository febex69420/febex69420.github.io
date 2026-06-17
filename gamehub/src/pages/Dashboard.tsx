import { useMemo, useState, type ReactNode } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Check, GripVertical, LayoutGrid, RotateCcw } from 'lucide-react';
import { GlassCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/store/AppContext';
import type { WidgetKey } from '@/types';
import {
  ActivityWidget,
  ClipsWidget,
  ConversationsWidget,
  OnlineFriendsWidget,
  PollsWidget,
  SessionsWidget,
  StatsWidget,
  TournamentsWidget,
} from '@/features/dashboard/widgets';

const STORAGE = 'gamehub.dashboard.order';
const DEFAULT_ORDER: WidgetKey[] = [
  'stats',
  'sessions',
  'online-friends',
  'trending',
  'conversations',
  'new-clips',
  'tournaments',
  'polls',
  'activity',
];

const WIDGETS: Record<WidgetKey, { title: string; node: ReactNode; span?: boolean }> = {
  stats: { title: 'Your Stats', node: <StatsWidget /> },
  'online-friends': { title: 'Online Friends', node: <OnlineFriendsWidget /> },
  conversations: { title: 'Conversations', node: <ConversationsWidget /> },
  sessions: { title: 'Sessions', node: <SessionsWidget /> },
  notifications: { title: 'Notifications', node: <ActivityWidget /> },
  'new-clips': { title: 'New Clips', node: <ClipsWidget variant="new" /> },
  trending: { title: 'Trending Clips', node: <ClipsWidget variant="trending" /> },
  tournaments: { title: 'Tournaments', node: <TournamentsWidget /> },
  polls: { title: 'Polls', node: <PollsWidget /> },
  activity: { title: 'Activity', node: <ActivityWidget /> },
};

function loadOrder(): WidgetKey[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw) as WidgetKey[];
      const valid = parsed.filter((k) => k in WIDGETS);
      if (valid.length) return valid;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ORDER;
}

function WidgetCard({ wkey, editing }: { wkey: WidgetKey; editing: boolean }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={wkey}
      dragListener={false}
      dragControls={controls}
      className="list-none"
      whileDrag={{ scale: 1.02, zIndex: 30 }}
    >
      <GlassCard className="relative h-full p-4" hover={!editing}>
        {editing && (
          <button
            onPointerDown={(e) => controls.start(e)}
            aria-label={`Reorder ${WIDGETS[wkey].title}`}
            className="absolute right-3 top-3 z-10 cursor-grab touch-none rounded-lg bg-white/10 p-1.5 text-slate-300 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {WIDGETS[wkey].node}
      </GlassCard>
    </Reorder.Item>
  );
}

export default function Dashboard() {
  const { currentUser } = useApp();
  const [order, setOrder] = useState<WidgetKey[]>(loadOrder);
  const [editing, setEditing] = useState(false);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);

  const persist = (next: WidgetKey[]) => {
    setOrder(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const reset = () => persist(DEFAULT_ORDER);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-white sm:text-3xl">
            {greeting}, <span className="text-gradient">{currentUser?.displayName}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Here's what's happening with your crew.</p>
        </div>
        <div className="flex gap-2">
          {editing && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          )}
          <Button variant={editing ? 'primary' : 'secondary'} size="sm" onClick={() => setEditing((e) => !e)}>
            {editing ? <Check className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            {editing ? 'Done' : 'Customize'}
          </Button>
        </div>
      </div>

      {editing && (
        <p className="mb-3 rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary-soft">
          Drag the handle on each widget to rearrange your dashboard. Your layout is saved automatically.
        </p>
      )}

      <Reorder.Group
        axis="y"
        values={order}
        onReorder={persist}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {order.map((wkey) => (
          <WidgetCard key={wkey} wkey={wkey} editing={editing} />
        ))}
      </Reorder.Group>
    </div>
  );
}
