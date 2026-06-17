// ---------------------------------------------------------------------------
// GameHub domain model
// These types mirror the production database schema documented in DESIGN.md.
// ---------------------------------------------------------------------------

export type ID = string;

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type PrivacyLevel = 'public' | 'friends' | 'private';

export interface Badge {
  id: ID;
  name: string;
  description: string;
  /** lucide icon name */
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

export interface Achievement {
  id: ID;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: string; // ISO; undefined = locked
  progress: number; // 0..1
}

export interface UserStats {
  clipsPosted: number;
  totalLikes: number;
  tournamentsWon: number;
  sessionsAttended: number;
  messagesSent: number;
  longestStreak: number;
}

export interface SocialLink {
  platform: 'twitch' | 'youtube' | 'steam' | 'twitter' | 'discord' | 'website';
  url: string;
}

export interface User {
  id: ID;
  username: string;
  displayName: string;
  avatar: string; // gradient seed or url
  banner?: string;
  bio?: string;
  status: PresenceStatus;
  statusMessage?: string;
  level: number;
  xp: number;
  xpToNext: number;
  favoriteGames: string[];
  socialLinks: SocialLink[];
  badges: Badge[];
  achievements: Achievement[];
  stats: UserStats;
  privacy: {
    profile: PrivacyLevel;
    activity: PrivacyLevel;
    clips: PrivacyLevel;
  };
  theme: string; // accent theme key
  joinedAt: string;
  streak: number;
}

export type RelationshipState = 'friends' | 'incoming' | 'outgoing' | 'blocked' | 'none';

export interface Friend {
  user: User;
  state: RelationshipState;
  muted?: boolean;
  playing?: string; // current game activity
}

// --- Chat ------------------------------------------------------------------

export interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface Message {
  id: ID;
  authorId: ID;
  channelId: ID;
  content: string;
  createdAt: string;
  editedAt?: string;
  replyToId?: ID;
  reactions: Reaction[];
  attachments?: { type: 'image' | 'file' | 'gif'; url: string; name?: string }[];
  pinned?: boolean;
  mentions?: ID[];
}

export type ChannelType = 'text' | 'voice' | 'announcement';

export interface Channel {
  id: ID;
  serverId: ID | null; // null = DM / group
  name: string;
  type: ChannelType;
  topic?: string;
  private?: boolean;
  unread?: number;
  voiceMembers?: ID[];
}

export interface Server {
  id: ID;
  name: string;
  icon: string;
  ownerId: ID;
  memberCount: number;
  channels: Channel[];
}

export interface DirectThread {
  id: ID;
  participantIds: ID[];
  isGroup: boolean;
  name?: string;
  lastMessageAt: string;
  unread: number;
}

// --- Clips -----------------------------------------------------------------

export interface ClipComment {
  id: ID;
  authorId: ID;
  content: string;
  createdAt: string;
  likes: number;
}

export interface Clip {
  id: ID;
  authorId: ID;
  title: string;
  game: string;
  thumbnail: string; // gradient seed
  durationSec: number;
  views: number;
  likes: number;
  likedByMe: boolean;
  savedByMe: boolean;
  tags: string[];
  createdAt: string;
  comments: ClipComment[];
}

export type ClipSort = 'trending' | 'newest' | 'most-liked' | 'recommended';

// --- Events & Tournaments --------------------------------------------------

export type RsvpState = 'going' | 'maybe' | 'declined' | 'none';

export interface GameSession {
  id: ID;
  title: string;
  game: string;
  hostId: ID;
  startsAt: string;
  durationMin: number;
  inviteeIds: ID[];
  rsvps: Record<ID, RsvpState>;
  recurring?: 'none' | 'weekly' | 'daily';
  color: string;
}

export interface BracketTeam {
  id: ID;
  name: string;
  memberIds: ID[];
  seed: number;
}

export interface BracketMatch {
  id: ID;
  round: number;
  teamAId: ID | null;
  teamBId: ID | null;
  scoreA?: number;
  scoreB?: number;
  winnerId?: ID | null;
}

export interface Tournament {
  id: ID;
  name: string;
  game: string;
  status: 'upcoming' | 'live' | 'completed';
  teams: BracketTeam[];
  matches: BracketMatch[];
  startsAt: string;
}

// --- Notifications & Polls -------------------------------------------------

export type NotificationType =
  | 'friend_request'
  | 'message'
  | 'mention'
  | 'reaction'
  | 'comment'
  | 'event_invite'
  | 'tournament'
  | 'voice'
  | 'achievement'
  | 'announcement';

export interface AppNotification {
  id: ID;
  type: NotificationType;
  actorId?: ID;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

export interface Poll {
  id: ID;
  question: string;
  options: { id: ID; label: string; votes: number }[];
  votedOptionId?: ID;
  closesAt?: string;
}

export interface ActivityItem {
  id: ID;
  actorId: ID;
  verb: string;
  target: string;
  createdAt: string;
  icon: string;
}

export type WidgetKey =
  | 'online-friends'
  | 'conversations'
  | 'sessions'
  | 'notifications'
  | 'new-clips'
  | 'trending'
  | 'tournaments'
  | 'polls'
  | 'activity'
  | 'stats';
