import { Link } from 'react-router-dom';
import { Ghost } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Ghost className="mb-4 h-16 w-16 text-primary-soft" aria-hidden />
      <h1 className="text-5xl font-display text-gradient">404</h1>
      <p className="mt-2 max-w-sm text-slate-400">
        This page respawned somewhere else. Let's get you back to base.
      </p>
      <Link to="/" className="mt-6">
        <Button>Return to Dashboard</Button>
      </Link>
    </div>
  );
}
