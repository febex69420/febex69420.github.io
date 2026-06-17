import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Hash,
  Lock,
  Megaphone,
  Pin,
  Plus,
  Send,
  Smile,
  Volume2,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/primitives';
import {
  CURRENT_USER_ID,
  dmThreads,
  servers,
  userById,
} from '@/data/mock';
import { useApp } from '@/store/AppContext';
import { cn, gradientFromSeed, timeAgo } from '@/lib/utils';
import type { Channel, Message } from '@/types';

const QUICK_EMOJI = ['🔥', '😂', '👀', '❤️', '💀', '🎮', '🏆', '👍'];
const CANNED = ['gg', 'lets gooo 🔥', 'omw', 'one sec', 'haha nice', 'down for that', 'clip it!'];

export default function Chat() {
  const { messages, sendMessage, reactToMessage } = useApp();
  const [activeServer, setActiveServer] = useState(servers[0]);
  const [activeChannelId, setActiveChannelId] = useState<string>(servers[0].channels[0].id);
  const [view, setView] = useState<'servers' | 'dms'>('servers');
  const [showChannels, setShowChannels] = useState(true); // mobile panel toggle
  const [typing, setTyping] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const channels = view === 'servers' ? activeServer.channels : [];
  const activeChannel: Channel | undefined =
    channels.find((c) => c.id === activeChannelId) ??
    (view === 'dms'
      ? { id: activeChannelId, serverId: null, name: 'Direct Message', type: 'text' }
      : undefined);

  const channelMessages = messages[activeChannelId] ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [channelMessages.length, typing]);

  const onSend = (content: string) => {
    sendMessage(activeChannelId, content);
    // Simulate a friend typing + replying (real-time feel)
    const friend = userById(view === 'dms' ? dmThreads.find((d) => d.id === activeChannelId)?.participantIds.find((p) => p !== CURRENT_USER_ID) ?? 'u2' : 'u2');
    if (friend) {
      setTimeout(() => setTyping(friend.displayName), 600);
      setTimeout(() => {
        setTyping(null);
        sendMessage(activeChannelId, CANNED[Math.floor(Math.random() * CANNED.length)]);
      }, 2200);
    }
  };

  const pinned = channelMessages.filter((m) => m.pinned);

  return (
    <div className="flex h-[calc(100dvh-9rem)] gap-3 lg:h-[calc(100dvh-7rem)]">
      {/* Server rail */}
      <div className="hidden w-16 shrink-0 flex-col items-center gap-2 rounded-2xl bg-surface/40 py-3 backdrop-blur-xl sm:flex">
        <RailButton active={view === 'dms'} onClick={() => { setView('dms'); setActiveChannelId(dmThreads[0].id); }} label="Direct Messages">
          <Avatar seed="dm" name="DM" size="sm" />
        </RailButton>
        <div className="h-px w-8 bg-white/10" />
        {servers.map((s) => (
          <RailButton
            key={s.id}
            active={view === 'servers' && activeServer.id === s.id}
            onClick={() => { setView('servers'); setActiveServer(s); setActiveChannelId(s.channels[0].id); }}
            label={s.name}
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl text-sm font-bold text-white" style={{ backgroundImage: gradientFromSeed(s.icon) }}>
              {s.name.slice(0, 2)}
            </span>
          </RailButton>
        ))}
        <button aria-label="Add server" className="grid h-10 w-10 place-items-center rounded-2xl bg-white/5 text-success hover:bg-success/10 cursor-pointer">
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Channels / DM list */}
      <aside className={cn('w-full shrink-0 flex-col rounded-2xl glass sm:flex sm:w-60', showChannels ? 'flex' : 'hidden sm:flex')}>
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="truncate font-display text-white">{view === 'dms' ? 'Direct Messages' : activeServer.name}</h2>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin p-2">
          {view === 'servers'
            ? channels.map((c) => (
                <ChannelRow
                  key={c.id}
                  channel={c}
                  active={c.id === activeChannelId}
                  onClick={() => { setActiveChannelId(c.id); setShowChannels(false); }}
                />
              ))
            : dmThreads.map((d) => {
                const other = d.isGroup ? null : userById(d.participantIds.find((p) => p !== CURRENT_USER_ID)!);
                const name = d.isGroup ? d.name! : other?.displayName ?? 'Unknown';
                return (
                  <button
                    key={d.id}
                    onClick={() => { setActiveChannelId(d.id); setShowChannels(false); }}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors cursor-pointer',
                      d.id === activeChannelId ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5')}
                  >
                    {other ? <Avatar seed={other.avatar} name={name} size="sm" status={other.status} /> : (
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-xs text-primary-soft">GC</span>
                    )}
                    <span className="flex-1 truncate">{name}</span>
                    {d.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">{d.unread}</span>}
                  </button>
                );
              })}
        </div>
      </aside>

      {/* Messages */}
      <section className={cn('min-w-0 flex-1 flex-col rounded-2xl glass', showChannels ? 'hidden sm:flex' : 'flex')}>
        <header className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <button onClick={() => setShowChannels(true)} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 sm:hidden cursor-pointer" aria-label="Back to channels">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <ChannelIcon channel={activeChannel} />
          <h3 className="font-semibold text-white">{activeChannel?.name}</h3>
          {activeChannel?.topic && <span className="hidden truncate border-l border-white/10 pl-2 text-sm text-slate-400 md:block">{activeChannel.topic}</span>}
        </header>

        {pinned.length > 0 && (
          <div className="flex items-center gap-2 border-b border-white/5 bg-warning/5 px-4 py-2 text-xs text-warning">
            <Pin className="h-3.5 w-3.5" /> {pinned.length} pinned message{pinned.length > 1 ? 's' : ''}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto scrollbar-thin p-4">
          {channelMessages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
              <Hash className="mb-2 h-10 w-10" />
              <p className="text-sm">This is the start of #{activeChannel?.name}. Say hi 👋</p>
            </div>
          )}
          {channelMessages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              grouped={i > 0 && channelMessages[i - 1].authorId === m.authorId}
              onReact={(emoji) => reactToMessage(activeChannelId, m.id, emoji)}
              pickerOpen={pickerFor === m.id}
              onTogglePicker={() => setPickerFor((p) => (p === m.id ? null : m.id))}
            />
          ))}
          <AnimatePresence>
            {typing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-2 py-1 text-xs text-slate-400">
                <span className="flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />
                  ))}
                </span>
                {typing} is typing…
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Composer channelName={activeChannel?.name ?? ''} onSend={onSend} />
      </section>
    </div>
  );
}

function RailButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('relative grid place-items-center rounded-2xl transition-all cursor-pointer', active && 'ring-2 ring-primary')}
    >
      {active && <span className="absolute -left-3 h-6 w-1 rounded-full bg-white" />}
      {children}
    </button>
  );
}

function ChannelIcon({ channel }: { channel?: Channel }) {
  if (!channel) return <Hash className="h-4 w-4 text-slate-400" aria-hidden />;
  if (channel.type === 'voice') return <Volume2 className="h-4 w-4 text-slate-400" aria-hidden />;
  if (channel.type === 'announcement') return <Megaphone className="h-4 w-4 text-slate-400" aria-hidden />;
  if (channel.private) return <Lock className="h-4 w-4 text-slate-400" aria-hidden />;
  return <Hash className="h-4 w-4 text-slate-400" aria-hidden />;
}

function ChannelRow({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors cursor-pointer',
        active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200')}
    >
      <ChannelIcon channel={channel} />
      <span className="flex-1 truncate">{channel.name}</span>
      {channel.type === 'voice' && channel.voiceMembers && channel.voiceMembers.length > 0 && (
        <Badge tone="success">{channel.voiceMembers.length}</Badge>
      )}
      {channel.unread ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
    </button>
  );
}

function MessageRow({
  message,
  grouped,
  onReact,
  pickerOpen,
  onTogglePicker,
}: {
  message: Message;
  grouped: boolean;
  onReact: (emoji: string) => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}) {
  const author = userById(message.authorId);
  const mine = message.authorId === CURRENT_USER_ID;
  return (
    <div className={cn('group relative flex gap-3 rounded-lg px-2 py-1 hover:bg-white/[0.03]', grouped ? 'mt-0' : 'mt-2')}>
      <div className="w-10 shrink-0">
        {!grouped && author && <Avatar seed={author.avatar} name={author.displayName} size="md" status={author.status} />}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span className={cn('text-sm font-semibold', mine ? 'text-primary-soft' : 'text-white')}>{author?.displayName}</span>
            <span className="text-[11px] text-slate-500">{timeAgo(message.createdAt)}</span>
            {message.pinned && <Pin className="h-3 w-3 text-warning" aria-label="pinned" />}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
          {renderContent(message.content)}
          {message.editedAt && <span className="ml-1 text-[10px] text-slate-500">(edited)</span>}
        </p>
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(r.emoji)}
                className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors cursor-pointer',
                  r.reactedByMe ? 'border-primary/50 bg-primary/15 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}
              >
                <span>{r.emoji}</span> <span className="tabnums">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute -top-3 right-2 hidden items-center gap-0.5 rounded-lg glass-strong p-0.5 group-hover:flex">
        <button onClick={onTogglePicker} aria-label="Add reaction" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 cursor-pointer">
          <Smile className="h-4 w-4" />
        </button>
      </div>
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute right-2 top-4 z-20 flex gap-1 rounded-xl glass-strong p-1.5 shadow-card"
          >
            {QUICK_EMOJI.map((e) => (
              <button key={e} onClick={() => { onReact(e); onTogglePicker(); }} className="rounded-md p-1 text-lg hover:bg-white/10 cursor-pointer">
                {e}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Highlight @mentions; content itself is rendered as React text (auto-escaped).
function renderContent(content: string) {
  return content.split(/(@\w+)/g).map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="rounded bg-primary/20 px-1 font-medium text-primary-soft">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Composer({ channelName, onSend }: { channelName: string; onSend: (c: string) => void }) {
  const [value, setValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  };

  return (
    <form onSubmit={submit} className="border-t border-white/5 p-3">
      <div className="flex items-end gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
        <button type="button" aria-label="Attach file" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer">
          <Plus className="h-5 w-5" />
        </button>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e);
          }}
          rows={1}
          placeholder={`Message #${channelName}`}
          aria-label={`Message ${channelName}`}
          className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        <div className="relative">
          <button type="button" onClick={() => setShowEmoji((s) => !s)} aria-label="Emoji" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer">
            <Smile className="h-5 w-5" />
          </button>
          <AnimatePresence>
            {showEmoji && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-12 right-0 flex gap-1 rounded-xl glass-strong p-2 shadow-card">
                {QUICK_EMOJI.map((em) => (
                  <button key={em} type="button" onClick={() => { setValue((v) => v + em); setShowEmoji(false); }} className="rounded-md p-1 text-lg hover:bg-white/10 cursor-pointer">{em}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button type="submit" disabled={!value.trim()} aria-label="Send message" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-white transition-all hover:brightness-110 disabled:opacity-40 cursor-pointer">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
