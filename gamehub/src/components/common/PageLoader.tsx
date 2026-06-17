import { Gamepad2 } from 'lucide-react';

export function PageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-glow animate-pulse">
          <Gamepad2 className="h-7 w-7 text-white" aria-hidden />
        </div>
        <span className="text-sm text-slate-400">Loading GameHub…</span>
      </div>
    </div>
  );
}
