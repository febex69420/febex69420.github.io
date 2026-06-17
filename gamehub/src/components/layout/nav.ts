import {
  Calendar,
  Clapperboard,
  LayoutDashboard,
  MessagesSquare,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** shown in the mobile bottom bar (max 5) */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, mobile: true },
  { to: '/chat', label: 'Chat', icon: MessagesSquare, mobile: true },
  { to: '/clips', label: 'Clips', icon: Clapperboard, mobile: true },
  { to: '/events', label: 'Events', icon: Calendar, mobile: true },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy },
];
