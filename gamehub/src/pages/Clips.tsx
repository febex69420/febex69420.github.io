import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bookmark,
  Heart,
  MessageCircle,
  Play,
  Search,
  Share2,
  Upload,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { POPULAR_GAMES, userById } from '@/data/mock';
import { useApp } from '@/store/AppContext';
import { cn, compact, formatDuration, gradientFromSeed, timeAgo } from '@/lib/utils';
import type { Clip, ClipComment, ClipSort } from '@/types';

const SORTS: { key: ClipSort; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'newest', label: 'Newest' },
  { key: 'most-liked', label: 'Most Liked' },
  { key: 'recommended', label: 'For You' },
];

export default function Clips() {
  const { clips, toggleLike, toggleSave, toast } = useApp();
  const [sort, setSort] = useState<ClipSort>('trending');
  const [game, setGame] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [commentsFor, setCommentsFor] = useState<Clip | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const feed = useMemo(() => {
    let list = [...clips];
    if (game !== 'all') list = list.filter((c) => c.game === game);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => `${c.title} ${c.game} ${c.tags.join(' ')}`.toLowerCase().includes(q));
    }
    switch (sort) {
      case 'newest':
        return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      case 'most-liked':
        return list.sort((a, b) => b.likes - a.likes);
      case 'trending':
        return list.sort((a, b) => b.views + b.likes * 3 - (a.views + a.likes * 3));
      default:
        return list.sort(() => Math.random() - 0.5);
    }
  }, [clips, sort, game, query]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-white sm:text-3xl">Clip Vault</h1>
          <p className="text-sm text-slate-400">Your crew's best plays, all in one feed.</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" /> Upload Clip
        </Button>
      </div>

      {/* Controls */}
      <div className="sticky top-16 z-30 mb-4 space-y-3 rounded-2xl glass p-3">
        <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clips, games, tags…"
            aria-label="Search clips"
            className="h-10 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex gap-1 rounded-xl bg-white/5 p-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={sort === s.key}
                onClick={() => setSort(s.key)}
                className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                  sort === s.key ? 'bg-primary/20 text-white' : 'text-slate-400 hover:text-white')}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select
            value={game}
            onChange={(e) => setGame(e.target.value)}
            aria-label="Filter by game"
            className="ml-auto h-9 rounded-lg border border-white/10 bg-surface px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">All games</option>
            {POPULAR_GAMES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Vertical snap feed */}
      {feed.length === 0 ? (
        <p className="py-16 text-center text-slate-400">No clips match your filters.</p>
      ) : (
        <div className="mx-auto flex max-w-md snap-y snap-mandatory flex-col gap-4">
          {feed.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onLike={() => toggleLike(clip.id)}
              onSave={() => { toggleSave(clip.id); toast({ title: clip.savedByMe ? 'Removed from saved' : 'Saved to your vault', variant: 'success' }); }}
              onComment={() => setCommentsFor(clip)}
              onShare={() => toast({ title: 'Link copied to clipboard', variant: 'success' })}
            />
          ))}
        </div>
      )}

      <CommentsModal clip={commentsFor} onClose={() => setCommentsFor(null)} />
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

function ClipCard({
  clip,
  onLike,
  onSave,
  onComment,
  onShare,
}: {
  clip: Clip;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
  onShare: () => void;
}) {
  const author = userById(clip.authorId);
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      className="relative aspect-[9/16] w-full snap-start overflow-hidden rounded-3xl ring-1 ring-white/10"
      style={{ backgroundImage: gradientFromSeed(clip.thumbnail) }}
    >
      <div className="absolute inset-0 grid place-items-center">
        <button aria-label={`Play ${clip.title}`} className="grid h-16 w-16 place-items-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/30 transition-transform hover:scale-105 cursor-pointer">
          <Play className="h-7 w-7 translate-x-0.5 text-white" fill="currentColor" />
        </button>
      </div>

      <div className="absolute left-3 top-3 flex items-center gap-2">
        <Badge tone="primary">{clip.game}</Badge>
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-xs text-white tabnums backdrop-blur-md">{formatDuration(clip.durationSec)}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pr-16">
        {author && (
          <Link to={`/profile/${author.id}`} className="mb-2 flex items-center gap-2 cursor-pointer">
            <Avatar seed={author.avatar} name={author.displayName} size="sm" status={author.status} />
            <span className="text-sm font-semibold text-white">@{author.username}</span>
            <span className="text-xs text-slate-300">· {timeAgo(clip.createdAt)}</span>
          </Link>
        )}
        <h3 className="text-base font-medium text-white">{clip.title}</h3>
        <div className="mt-1 flex flex-wrap gap-1">
          {clip.tags.map((t) => (
            <span key={t} className="text-xs text-accent-soft">#{t}</span>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400 tabnums">{compact(clip.views)} views</p>
      </div>

      {/* Action rail */}
      <div className="absolute bottom-4 right-3 flex flex-col items-center gap-4">
        <ActionButton label="Like" active={clip.likedByMe} onClick={onLike} count={clip.likes}>
          <Heart className={cn('h-6 w-6', clip.likedByMe && 'fill-rose text-rose')} />
        </ActionButton>
        <ActionButton label="Comments" onClick={onComment} count={clip.comments.length}>
          <MessageCircle className="h-6 w-6" />
        </ActionButton>
        <ActionButton label="Save" active={clip.savedByMe} onClick={onSave}>
          <Bookmark className={cn('h-6 w-6', clip.savedByMe && 'fill-warning text-warning')} />
        </ActionButton>
        <ActionButton label="Share" onClick={onShare}>
          <Share2 className="h-6 w-6" />
        </ActionButton>
      </div>
    </motion.article>
  );
}

function ActionButton({
  label,
  onClick,
  active,
  count,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="flex flex-col items-center gap-1 text-white transition-transform active:scale-90 cursor-pointer"
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/20">
        {children}
      </span>
      {count !== undefined && <span className="text-xs font-medium tabnums">{compact(count)}</span>}
    </button>
  );
}

function CommentsModal({ clip, onClose }: { clip: Clip | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [local, setLocal] = useState<ClipComment[]>([]);
  const { currentUser, toast } = useApp();

  // Load this clip's comments whenever a new clip opens.
  useEffect(() => {
    setLocal(clip?.comments ?? []);
    setText('');
  }, [clip]);

  const add = () => {
    if (!text.trim() || !currentUser) return;
    setLocal((l) => [
      { id: Math.random().toString(36).slice(2), authorId: currentUser.id, content: text.trim(), createdAt: new Date().toISOString(), likes: 0 },
      ...l,
    ]);
    setText('');
    toast({ title: 'Comment posted', variant: 'success' });
  };

  return (
    <Modal open={!!clip} onClose={onClose} title={`Comments · ${local.length}`}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button onClick={add} disabled={!text.trim()}>Post</Button>
        </div>
        <ul className="max-h-80 space-y-3 overflow-y-auto scrollbar-thin">
          {local.map((c) => {
            const u = userById(c.authorId);
            return (
              <li key={c.id} className="flex gap-3">
                {u && <Avatar seed={u.avatar} name={u.displayName} size="sm" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-white">{u?.displayName}</span>{' '}
                    <span className="text-xs text-slate-500">{timeAgo(c.createdAt)}</span>
                  </p>
                  <p className="text-sm text-slate-300">{c.content}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const [drag, setDrag] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Upload a Clip">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); toast({ title: 'Clip queued for processing', description: 'Thumbnail will generate automatically.', variant: 'success' }); onClose(); }}
        className={cn('flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          drag ? 'border-primary bg-primary/10' : 'border-white/15')}
      >
        <Upload className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
        <p className="text-sm text-slate-300">Drag & drop a video here, or</p>
        <label className="mt-2 cursor-pointer text-sm font-medium text-primary-soft hover:underline">
          browse files
          <input type="file" accept="video/*" className="sr-only" onChange={() => { toast({ title: 'Clip queued for processing', variant: 'success' }); onClose(); }} />
        </label>
        <p className="mt-3 text-xs text-slate-500">MP4, WebM, MOV up to 500MB · max 3 min</p>
      </div>
    </Modal>
  );
}
