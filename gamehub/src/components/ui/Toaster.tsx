import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { useApp } from '@/store/AppContext';

const icons = {
  default: Info,
  success: CheckCircle2,
  error: XCircle,
};

const tones = {
  default: 'text-accent',
  success: 'text-success',
  error: 'text-danger',
};

export function Toaster() {
  const { toasts, dismissToast } = useApp();

  return (
    // aria-live polite so screen readers announce without stealing focus (toast-accessibility).
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[1100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:left-auto sm:right-4 sm:translate-x-0"
      aria-live="polite"
      role="status"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = icons[t.variant];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
              className="glass-strong pointer-events-auto flex items-start gap-3 rounded-xl p-3 shadow-card"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tones[t.variant]}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>}
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
