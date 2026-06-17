import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  CURRENT_USER_ID,
  clips as seedClips,
  friends as seedFriends,
  messagesByChannel as seedMessages,
  notifications as seedNotifications,
  userById,
} from '@/data/mock';
import type { AppNotification, Clip, Friend, Message, Reaction, User } from '@/types';

const AUTH_KEY = 'gamehub.session';
const CONSENT_KEY = 'gamehub.consent';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'error';
}

interface AppState {
  // auth
  currentUser: User | null;
  login: (email?: string) => void;
  loginWithProvider: (provider: 'google' | 'discord') => void;
  logout: () => void;
  updateProfile: (patch: Partial<User>) => void;
  deleteAccount: () => void;

  // consent
  consent: 'accepted' | 'rejected' | null;
  setConsent: (c: 'accepted' | 'rejected') => void;

  // toasts
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  // notifications
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;

  // clips
  clips: Clip[];
  toggleLike: (clipId: string) => void;
  toggleSave: (clipId: string) => void;

  // friends
  friends: Friend[];
  acceptFriend: (userId: string) => void;
  toggleMute: (userId: string) => void;
  removeFriend: (userId: string) => void;

  // chat
  messages: Record<string, Message[]>;
  sendMessage: (channelId: string, content: string) => void;
  reactToMessage: (channelId: string, messageId: string, emoji: string) => void;

  // theme accent
  accent: string;
  setAccent: (a: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      return localStorage.getItem(AUTH_KEY) ? userById(CURRENT_USER_ID) ?? null : null;
    } catch {
      return null;
    }
  });
  const [consent, setConsentState] = useState<'accepted' | 'rejected' | null>(() => {
    try {
      return (localStorage.getItem(CONSENT_KEY) as 'accepted' | 'rejected') || null;
    } catch {
      return null;
    }
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>(seedNotifications);
  const [clips, setClips] = useState<Clip[]>(seedClips);
  const [friends, setFriends] = useState<Friend[]>(seedFriends);
  const [messages, setMessages] = useState<Record<string, Message[]>>(seedMessages);
  const [accent, setAccentState] = useState<string>('violet');

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...t, id }]);
      // auto-dismiss (toast-dismiss rule: 3-5s)
      setTimeout(() => dismissToast(id), 4000);
    },
    [dismissToast],
  );

  const login = useCallback((email?: string) => {
    void email;
    try {
      localStorage.setItem(AUTH_KEY, '1');
    } catch {
      /* ignore */
    }
    setCurrentUser(userById(CURRENT_USER_ID) ?? null);
  }, []);

  const loginWithProvider = useCallback(
    (provider: 'google' | 'discord') => {
      login();
      toast({ title: `Signed in with ${provider === 'google' ? 'Google' : 'Discord'}`, variant: 'success' });
    },
    [login, toast],
  );

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    setCurrentUser(null);
  }, []);

  const updateProfile = useCallback((patch: Partial<User>) => {
    setCurrentUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const deleteAccount = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    setCurrentUser(null);
  }, []);

  const setConsent = useCallback((c: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(CONSENT_KEY, c);
    } catch {
      /* ignore */
    }
    setConsentState(c);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x)));
  }, []);

  const toggleLike = useCallback((clipId: string) => {
    setClips((cs) =>
      cs.map((c) =>
        c.id === clipId
          ? { ...c, likedByMe: !c.likedByMe, likes: c.likes + (c.likedByMe ? -1 : 1) }
          : c,
      ),
    );
  }, []);

  const toggleSave = useCallback((clipId: string) => {
    setClips((cs) => cs.map((c) => (c.id === clipId ? { ...c, savedByMe: !c.savedByMe } : c)));
  }, []);

  const acceptFriend = useCallback(
    (userId: string) => {
      setFriends((fs) => fs.map((f) => (f.user.id === userId ? { ...f, state: 'friends' } : f)));
      toast({ title: 'Friend request accepted', variant: 'success' });
    },
    [toast],
  );

  const toggleMute = useCallback((userId: string) => {
    setFriends((fs) => fs.map((f) => (f.user.id === userId ? { ...f, muted: !f.muted } : f)));
  }, []);

  const removeFriend = useCallback((userId: string) => {
    setFriends((fs) => fs.filter((f) => f.user.id !== userId));
  }, []);

  const sendMessage = useCallback(
    (channelId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const m: Message = {
        id: Math.random().toString(36).slice(2),
        authorId: CURRENT_USER_ID,
        channelId,
        content: trimmed,
        createdAt: new Date().toISOString(),
        reactions: [],
      };
      setMessages((prev) => ({ ...prev, [channelId]: [...(prev[channelId] ?? []), m] }));
    },
    [],
  );

  const reactToMessage = useCallback((channelId: string, messageId: string, emoji: string) => {
    setMessages((prev) => {
      const list = prev[channelId] ?? [];
      return {
        ...prev,
        [channelId]: list.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          let reactions: Reaction[];
          if (existing) {
            reactions = m.reactions
              .map((r) =>
                r.emoji === emoji
                  ? { ...r, reactedByMe: !r.reactedByMe, count: r.count + (r.reactedByMe ? -1 : 1) }
                  : r,
              )
              .filter((r) => r.count > 0);
          } else {
            reactions = [...m.reactions, { emoji, count: 1, reactedByMe: true }];
          }
          return { ...m, reactions };
        }),
      };
    });
  }, []);

  const setAccent = useCallback((a: string) => setAccentState(a), []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  // Keep <html> theme-color/data in sync for a polished mobile chrome.
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  const value: AppState = {
    currentUser,
    login,
    loginWithProvider,
    logout,
    updateProfile,
    deleteAccount,
    consent,
    setConsent,
    toasts,
    toast,
    dismissToast,
    notifications,
    unreadCount,
    markAllRead,
    markRead,
    clips,
    toggleLike,
    toggleSave,
    friends,
    acceptFriend,
    toggleMute,
    removeFriend,
    messages,
    sendMessage,
    reactToMessage,
    accent,
    setAccent,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
