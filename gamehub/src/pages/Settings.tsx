import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Download,
  Lock,
  Palette,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { GlassCard, SectionHeader } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/store/AppContext';
import type { PrivacyLevel, User } from '@/types';
import { cn } from '@/lib/utils';

type Section = 'profile' | 'privacy' | 'notifications' | 'account';

const SECTIONS: { key: Section; label: string; icon: typeof UserIcon }[] = [
  { key: 'profile', label: 'Profile', icon: UserIcon },
  { key: 'privacy', label: 'Privacy', icon: Lock },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'account', label: 'Account & Data', icon: Download },
];

export default function Settings() {
  const [section, setSection] = useState<Section>('profile');
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-5 text-2xl font-display text-white sm:text-3xl">Settings</h1>
      <div className="grid gap-5 md:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col scrollbar-thin" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={cn('flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                section === s.key ? 'bg-primary/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}
            >
              <s.icon className="h-4 w-4" aria-hidden /> {s.label}
            </button>
          ))}
        </nav>
        <div>
          {section === 'profile' && <ProfileSettings />}
          {section === 'privacy' && <PrivacySettings />}
          {section === 'notifications' && <NotificationSettings />}
          {section === 'account' && <AccountSettings />}
        </div>
      </div>
    </div>
  );
}

function ProfileSettings() {
  const { currentUser, updateProfile, toast, accent, setAccent } = useApp();
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? '');
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [statusMessage, setStatusMessage] = useState(currentUser?.statusMessage ?? '');
  if (!currentUser) return null;

  const accents = ['violet', 'cyan', 'rose', 'emerald'];
  const accentColor: Record<string, string> = { violet: '#7c5cff', cyan: '#22d3ee', rose: '#fb5d8a', emerald: '#34d399' };

  return (
    <GlassCard className="p-5">
      <SectionHeader title="Public Profile" icon={<UserIcon className="h-4 w-4" />} />
      <div className="mb-4 flex items-center gap-4">
        <Avatar seed={currentUser.avatar} name={currentUser.displayName} size="xl" status={currentUser.status} />
        <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Avatar upload opened', variant: 'default' })}>Change avatar</Button>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">Display name</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" maxLength={32} />
      </label>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">Status message</span>
        <input value={statusMessage} onChange={(e) => setStatusMessage(e.target.value)} className="input" maxLength={80} placeholder="What are you up to?" />
      </label>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">Bio</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={280} className="input h-auto resize-none py-2" />
        <span className="mt-1 block text-right text-xs text-slate-500 tabnums">{bio.length}/280</span>
      </label>

      <div className="mt-4">
        <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"><Palette className="h-4 w-4" /> Profile accent</span>
        <div className="flex gap-2">
          {accents.map((a) => (
            <button
              key={a}
              onClick={() => setAccent(a)}
              aria-label={`${a} accent`}
              aria-pressed={accent === a}
              className={cn('h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-110 cursor-pointer', accent === a ? 'ring-white' : 'ring-transparent')}
              style={{ background: accentColor[a] }}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => { updateProfile({ displayName, bio, statusMessage }); toast({ title: 'Profile saved', variant: 'success' }); }}>
          Save changes
        </Button>
      </div>
    </GlassCard>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        {description && <span className="block text-xs text-slate-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer', checked ? 'bg-primary' : 'bg-white/15')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

function PrivacySettings() {
  const { currentUser, updateProfile, toast } = useApp();
  const [privacy, setPrivacy] = useState<User['privacy']>(
    currentUser?.privacy ?? { profile: 'friends', activity: 'friends', clips: 'public' },
  );

  const levels: PrivacyLevel[] = ['public', 'friends', 'private'];
  const rows: { key: keyof typeof privacy; label: string }[] = [
    { key: 'profile', label: 'Who can see my profile' },
    { key: 'activity', label: 'Who can see my activity & online status' },
    { key: 'clips', label: 'Who can see my clips' },
  ];

  return (
    <GlassCard className="p-5">
      <SectionHeader title="Privacy Controls" icon={<Lock className="h-4 w-4" />} />
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-medium text-white">{r.label}</span>
            <select
              value={privacy[r.key]}
              onChange={(e) => setPrivacy((p) => ({ ...p, [r.key]: e.target.value as PrivacyLevel }))}
              aria-label={r.label}
              className="h-9 rounded-lg border border-white/10 bg-surface px-3 text-sm capitalize text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => { updateProfile({ privacy }); toast({ title: 'Privacy settings updated', variant: 'success' }); }}>Save</Button>
      </div>
    </GlassCard>
  );
}

function NotificationSettings() {
  const { toast } = useApp();
  const [prefs, setPrefs] = useState({ friendRequests: true, mentions: true, messages: true, events: true, tournaments: false, push: false });
  const set = (k: keyof typeof prefs) => (v: boolean) => setPrefs((p) => ({ ...p, [k]: v }));
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Notifications" icon={<Bell className="h-4 w-4" />} />
      <div className="divide-y divide-white/5">
        <Toggle checked={prefs.friendRequests} onChange={set('friendRequests')} label="Friend requests" />
        <Toggle checked={prefs.mentions} onChange={set('mentions')} label="Mentions & replies" />
        <Toggle checked={prefs.messages} onChange={set('messages')} label="Direct messages" />
        <Toggle checked={prefs.events} onChange={set('events')} label="Event invites & reminders" />
        <Toggle checked={prefs.tournaments} onChange={set('tournaments')} label="Tournament updates" />
        <Toggle checked={prefs.push} onChange={(v) => { set('push')(v); if (v) toast({ title: 'Browser push enabled', variant: 'success' }); }} label="Browser push notifications" description="Requires permission from your browser" />
      </div>
    </GlassCard>
  );
}

function AccountSettings() {
  const { deleteAccount, toast } = useApp();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const exportData = () => {
    const payload = { exportedAt: new Date().toISOString(), note: 'GameHub data export (GDPR Art. 20 portability).', account: { username: 'nova' } };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gamehub-data-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Data export downloaded', variant: 'success' });
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <SectionHeader title="Your Data" icon={<Download className="h-4 w-4" />} />
        <p className="mb-4 text-sm text-slate-400">
          Download a copy of your GameHub data, including your profile, clips, messages, and activity. You have
          the right to access and port your data at any time.
        </p>
        <Button variant="secondary" onClick={exportData}>
          <Download className="h-4 w-4" /> Request data export
        </Button>
      </GlassCard>

      <GlassCard className="border-danger/30 p-5">
        <SectionHeader title="Danger Zone" icon={<AlertTriangle className="h-4 w-4 text-danger" />} />
        <p className="mb-4 text-sm text-slate-400">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="h-4 w-4" /> Delete my account
        </Button>
      </GlassCard>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete account?">
        <p className="text-sm text-slate-300">
          This permanently deletes your profile, clips, messages, and tournament history. Type{' '}
          <span className="font-mono font-semibold text-danger">DELETE</span> to confirm.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="input mt-3"
          aria-label="Type DELETE to confirm"
          placeholder="DELETE"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={confirmText !== 'DELETE'}
            onClick={() => { deleteAccount(); toast({ title: 'Account deleted', variant: 'default' }); navigate('/login'); }}
          >
            Permanently delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
