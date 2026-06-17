import type {
  ActivityItem,
  AppNotification,
  Clip,
  DirectThread,
  Friend,
  GameSession,
  Message,
  Poll,
  Server,
  Tournament,
  User,
} from '@/types';

// ---------------------------------------------------------------------------
// Seed data. In production this is served by the API; here it powers an
// in-memory data layer so the GitHub Pages build is fully interactive.
// ---------------------------------------------------------------------------

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();
const ahead = (min: number) => new Date(now + min * 60_000).toISOString();

const baseBadges = (...names: string[]) =>
  names.map((n, i) => ({
    id: `badge-${n}`,
    name: n,
    description: `${n} badge`,
    icon: ['Award', 'Crown', 'Flame', 'Star', 'Shield'][i % 5],
    tier: (['gold', 'silver', 'bronze', 'platinum'] as const)[i % 4],
  }));

const baseAchievements = () => [
  { id: 'a1', name: 'First Blood', description: 'Post your first clip', icon: 'Video', progress: 1, unlockedAt: ago(9000) },
  { id: 'a2', name: 'Social Butterfly', description: 'Add 10 friends', icon: 'Users', progress: 1, unlockedAt: ago(4000) },
  { id: 'a3', name: 'Night Owl', description: 'Join a 2am session', icon: 'Moon', progress: 1, unlockedAt: ago(800) },
  { id: 'a4', name: 'Champion', description: 'Win a tournament', icon: 'Trophy', progress: 0.6 },
  { id: 'a5', name: 'Viral', description: 'Get 10k clip views', icon: 'TrendingUp', progress: 0.34 },
  { id: 'a6', name: 'Streak Master', description: '30-day activity streak', icon: 'Flame', progress: 0.5 },
];

export const CURRENT_USER_ID = 'u1';

export const users: User[] = [
  {
    id: 'u1',
    username: 'nova',
    displayName: 'Nova',
    avatar: 'nova-seed',
    banner: 'nova-banner',
    bio: 'Comp FPS player, clip hoarder, and your friendly neighbourhood shotcaller. GG always.',
    status: 'online',
    statusMessage: 'Queuing ranked — join up',
    level: 42,
    xp: 6800,
    xpToNext: 8000,
    favoriteGames: ['Valorant', 'Apex Legends', 'Rocket League'],
    socialLinks: [
      { platform: 'twitch', url: 'https://twitch.tv/nova' },
      { platform: 'steam', url: 'https://steamcommunity.com/id/nova' },
    ],
    badges: baseBadges('Founder', 'MVP', 'Clipmaster'),
    achievements: baseAchievements(),
    stats: { clipsPosted: 48, totalLikes: 9120, tournamentsWon: 3, sessionsAttended: 76, messagesSent: 14200, longestStreak: 21 },
    privacy: { profile: 'friends', activity: 'friends', clips: 'public' },
    theme: 'violet',
    joinedAt: ago(60 * 24 * 400),
    streak: 14,
  },
  mkUser('u2', 'pixel', 'Pixel', 'online', 'Building in Fortnite', 38, ['Fortnite', 'Minecraft'], 'Playing Fortnite'),
  mkUser('u3', 'reaper', 'Reaper', 'dnd', 'In a match — do not disturb', 51, ['CS2', 'Valorant'], 'Playing CS2'),
  mkUser('u4', 'mira', 'Mira', 'idle', 'brb making tea', 29, ['Stardew Valley', 'Zelda'], undefined),
  mkUser('u5', 'jolt', 'Jolt', 'online', 'LFG ranked', 35, ['Apex Legends', 'Overwatch 2'], 'Playing Apex Legends'),
  mkUser('u6', 'echo', 'Echo', 'offline', undefined, 22, ['League of Legends'], undefined),
  mkUser('u7', 'byte', 'Byte', 'online', 'editing a montage', 47, ['Rocket League', 'Valorant'], undefined),
  mkUser('u8', 'glitch', 'Glitch', 'offline', undefined, 18, ['Minecraft', 'Terraria'], undefined),
];

function mkUser(
  id: string,
  username: string,
  displayName: string,
  status: User['status'],
  statusMessage: string | undefined,
  level: number,
  favoriteGames: string[],
  playing: string | undefined,
): User {
  void playing;
  return {
    id,
    username,
    displayName,
    avatar: `${username}-seed`,
    banner: `${username}-banner`,
    bio: `${displayName} on GameHub. Down to play most nights.`,
    status,
    statusMessage,
    level,
    xp: level * 150,
    xpToNext: (level + 1) * 200,
    favoriteGames,
    socialLinks: [{ platform: 'steam', url: `https://steamcommunity.com/id/${username}` }],
    badges: baseBadges('Early Bird', 'Team Player'),
    achievements: baseAchievements().slice(0, 4),
    stats: {
      clipsPosted: 5 + level,
      totalLikes: level * 110,
      tournamentsWon: level % 3,
      sessionsAttended: level,
      messagesSent: level * 240,
      longestStreak: level % 12,
    },
    privacy: { profile: 'friends', activity: 'friends', clips: 'public' },
    theme: 'violet',
    joinedAt: ago(60 * 24 * (100 + level)),
    streak: level % 9,
  };
}

export const userById = (id: string) => users.find((u) => u.id === id);

export const friends: Friend[] = [
  { user: users[1], state: 'friends', playing: 'Fortnite' },
  { user: users[2], state: 'friends', playing: 'CS2' },
  { user: users[3], state: 'friends' },
  { user: users[4], state: 'friends', playing: 'Apex Legends' },
  { user: users[5], state: 'friends' },
  { user: users[6], state: 'friends' },
  { user: users[7], state: 'incoming' },
];

// --- Servers / channels ----------------------------------------------------

export const servers: Server[] = [
  {
    id: 's1',
    name: 'The Squad',
    icon: 'squad-seed',
    ownerId: 'u1',
    memberCount: 8,
    channels: [
      { id: 'c1', serverId: 's1', name: 'general', type: 'text', topic: 'Talk about anything', unread: 3 },
      { id: 'c2', serverId: 's1', name: 'clips-and-highlights', type: 'text', topic: 'Drop your best plays' },
      { id: 'c3', serverId: 's1', name: 'lfg', type: 'text', topic: 'Looking for group' },
      { id: 'c4', serverId: 's1', name: 'mods-only', type: 'text', private: true, topic: 'Staff channel' },
      { id: 'c5', serverId: 's1', name: 'General Voice', type: 'voice', voiceMembers: ['u2', 'u5'] },
      { id: 'c6', serverId: 's1', name: 'Ranked Grind', type: 'voice', voiceMembers: [] },
    ],
  },
  {
    id: 's2',
    name: 'Valorant Crew',
    icon: 'valorant-seed',
    ownerId: 'u3',
    memberCount: 5,
    channels: [
      { id: 'c7', serverId: 's2', name: 'general', type: 'text' },
      { id: 'c8', serverId: 's2', name: 'strats', type: 'text', topic: 'Lineups & comps' },
      { id: 'c9', serverId: 's2', name: 'Scrim Voice', type: 'voice', voiceMembers: ['u3'] },
    ],
  },
];

export const dmThreads: DirectThread[] = [
  { id: 'd1', participantIds: ['u1', 'u2'], isGroup: false, lastMessageAt: ago(4), unread: 2 },
  { id: 'd2', participantIds: ['u1', 'u4'], isGroup: false, lastMessageAt: ago(48), unread: 0 },
  { id: 'd3', participantIds: ['u1', 'u2', 'u5', 'u7'], isGroup: true, name: 'Friday Night Crew', lastMessageAt: ago(120), unread: 5 },
];

export const messagesByChannel: Record<string, Message[]> = {
  c1: [
    msg('m1', 'u2', 'c1', 'yo who’s on tonight? 🎮', 60),
    msg('m2', 'u5', 'c1', 'me, down for ranked after 8', 58),
    msg('m3', 'u1', 'c1', 'lets gooo. I’ll set up an event', 56, { reactions: [{ emoji: '🔥', count: 3, reactedByMe: true }] }),
    msg('m4', 'u3', 'c1', 'pinned the schedule below 📌', 40, { pinned: true }),
    msg('m5', 'u2', 'c1', 'new clip dropped, check #clips-and-highlights', 12, {
      reactions: [
        { emoji: '👀', count: 2, reactedByMe: false },
        { emoji: '😂', count: 1, reactedByMe: false },
      ],
    }),
    msg('m6', 'u5', 'c1', '@Nova are we 5-stacking?', 4, { mentions: ['u1'] }),
  ],
  d1: [
    msg('dm1', 'u2', 'd1', 'gg earlier, that ace was insane', 30),
    msg('dm2', 'u1', 'd1', 'haha thanks, got it clipped already', 28),
    msg('dm3', 'u2', 'd1', 'send it!! 🙏', 4),
  ],
};

function msg(
  id: string,
  authorId: string,
  channelId: string,
  content: string,
  minAgo: number,
  extra: Partial<Message> = {},
): Message {
  return { id, authorId, channelId, content, createdAt: ago(minAgo), reactions: [], ...extra };
}

// --- Clips -----------------------------------------------------------------

const clipTitles: [string, string, string[], number, number][] = [
  ['1v5 clutch to win the map', 'Valorant', ['clutch', 'ace', 'ranked'], 24200, 1840],
  ['Cracked 360 no-scope', 'Apex Legends', ['snipe', 'wraith'], 18900, 1502],
  ['Last-second aerial goal', 'Rocket League', ['aerial', 'overtime'], 9800, 1210],
  ['Perfect smoke lineup', 'CS2', ['lineup', 'mirage'], 5400, 640],
  ['Insane Victory Royale', 'Fortnite', ['build', 'endgame'], 14200, 980],
  ['Speedrun PB by 3 seconds', 'Celeste', ['speedrun', 'pb'], 7600, 720],
  ['Triple kill with one shot', 'Overwatch 2', ['widow', 'highlight'], 11300, 877],
  ['That comeback was unreal', 'League of Legends', ['baron', 'comeback'], 16800, 1340],
];

export const clips: Clip[] = clipTitles.map(([title, game, tags, views, likes], i) => ({
  id: `clip-${i + 1}`,
  authorId: users[(i % (users.length - 1)) + 1].id,
  title,
  game,
  thumbnail: `clip-${i + 1}-seed`,
  durationSec: 18 + ((i * 7) % 40),
  views,
  likes,
  likedByMe: i % 3 === 0,
  savedByMe: i % 4 === 0,
  tags,
  createdAt: ago((i + 1) * 220),
  comments: [
    { id: `cm-${i}-1`, authorId: users[((i + 1) % 6) + 1].id, content: 'absolutely cracked 🔥', createdAt: ago(i * 30 + 12), likes: 12 },
    { id: `cm-${i}-2`, authorId: users[((i + 2) % 6) + 1].id, content: 'how is this even real', createdAt: ago(i * 30 + 4), likes: 4 },
  ],
}));

// --- Sessions --------------------------------------------------------------

export const sessions: GameSession[] = [
  {
    id: 'ev1',
    title: 'Ranked Grind Night',
    game: 'Valorant',
    hostId: 'u1',
    startsAt: ahead(180),
    durationMin: 180,
    inviteeIds: ['u2', 'u3', 'u5', 'u7'],
    rsvps: { u1: 'going', u2: 'going', u5: 'going', u3: 'maybe', u7: 'none' },
    recurring: 'weekly',
    color: '#7c5cff',
  },
  {
    id: 'ev2',
    title: 'Rocket League 3s',
    game: 'Rocket League',
    hostId: 'u7',
    startsAt: ahead(60 * 26),
    durationMin: 90,
    inviteeIds: ['u1', 'u2', 'u5'],
    rsvps: { u7: 'going', u1: 'going', u2: 'maybe' },
    recurring: 'none',
    color: '#22d3ee',
  },
  {
    id: 'ev3',
    title: 'Chill Minecraft Build',
    game: 'Minecraft',
    hostId: 'u2',
    startsAt: ahead(60 * 50),
    durationMin: 120,
    inviteeIds: ['u1', 'u4', 'u8'],
    rsvps: { u2: 'going', u4: 'going', u1: 'maybe' },
    recurring: 'none',
    color: '#34d399',
  },
];

// --- Tournaments -----------------------------------------------------------

export const tournaments: Tournament[] = [
  {
    id: 't1',
    name: 'Squad Summer Cup',
    game: 'Valorant',
    status: 'live',
    startsAt: ago(120),
    teams: [
      { id: 'tm1', name: 'Nova Squad', memberIds: ['u1', 'u5'], seed: 1 },
      { id: 'tm2', name: 'Reaper Co.', memberIds: ['u3'], seed: 2 },
      { id: 'tm3', name: 'Pixel Party', memberIds: ['u2', 'u8'], seed: 3 },
      { id: 'tm4', name: 'Byte Force', memberIds: ['u7'], seed: 4 },
    ],
    matches: [
      { id: 'mt1', round: 1, teamAId: 'tm1', teamBId: 'tm4', scoreA: 13, scoreB: 8, winnerId: 'tm1' },
      { id: 'mt2', round: 1, teamAId: 'tm2', teamBId: 'tm3', scoreA: 11, scoreB: 13, winnerId: 'tm3' },
      { id: 'mt3', round: 2, teamAId: 'tm1', teamBId: 'tm3', winnerId: null },
    ],
  },
];

// --- Notifications / polls / activity --------------------------------------

export const notifications: AppNotification[] = [
  { id: 'n1', type: 'friend_request', actorId: 'u8', title: 'New friend request', body: 'Glitch wants to be friends', createdAt: ago(8), read: false, href: '/friends' },
  { id: 'n2', type: 'mention', actorId: 'u5', title: 'Mentioned you', body: 'Jolt mentioned you in #general', createdAt: ago(4), read: false, href: '/chat' },
  { id: 'n3', type: 'achievement', title: 'Achievement unlocked', body: 'You earned “Night Owl” 🦉', createdAt: ago(40), read: false, href: '/profile' },
  { id: 'n4', type: 'event_invite', actorId: 'u7', title: 'Event invite', body: 'Byte invited you to Rocket League 3s', createdAt: ago(90), read: true, href: '/events' },
  { id: 'n5', type: 'reaction', actorId: 'u2', title: 'New reaction', body: 'Pixel reacted 🔥 to your message', createdAt: ago(120), read: true, href: '/chat' },
  { id: 'n6', type: 'tournament', title: 'Tournament update', body: 'Squad Summer Cup — semifinals are live', createdAt: ago(200), read: true, href: '/tournaments' },
];

export const polls: Poll[] = [
  {
    id: 'p1',
    question: 'What are we playing Friday?',
    options: [
      { id: 'po1', label: 'Valorant', votes: 5 },
      { id: 'po2', label: 'Rocket League', votes: 3 },
      { id: 'po3', label: 'Minecraft', votes: 2 },
    ],
    votedOptionId: 'po1',
    closesAt: ahead(60 * 20),
  },
];

export const activity: ActivityItem[] = [
  { id: 'ac1', actorId: 'u2', verb: 'posted a clip', target: 'Cracked 360 no-scope', createdAt: ago(15), icon: 'Video' },
  { id: 'ac2', actorId: 'u5', verb: 'won a match in', target: 'Squad Summer Cup', createdAt: ago(45), icon: 'Trophy' },
  { id: 'ac3', actorId: 'u4', verb: 'reached', target: 'Level 30', createdAt: ago(120), icon: 'Zap' },
  { id: 'ac4', actorId: 'u7', verb: 'scheduled', target: 'Rocket League 3s', createdAt: ago(180), icon: 'CalendarPlus' },
  { id: 'ac5', actorId: 'u3', verb: 'unlocked', target: 'Champion badge', createdAt: ago(240), icon: 'Award' },
];

export const POPULAR_GAMES = [
  'Valorant',
  'Apex Legends',
  'Rocket League',
  'CS2',
  'Fortnite',
  'Minecraft',
  'Overwatch 2',
  'League of Legends',
  'Stardew Valley',
  'Celeste',
];
