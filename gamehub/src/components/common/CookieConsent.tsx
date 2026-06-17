import { AnimatePresence, motion } from 'framer-motion';
import { Cookie } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/store/AppContext';

// GDPR/ePrivacy-style consent: non-essential cookies require opt-in, and the
// reject option is as prominent as accept (consent management requirement).
export function CookieConsent() {
  const { consent, setConsent } = useApp();

  return (
    <AnimatePresence>
      {consent === null && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          role="dialog"
          aria-label="Cookie consent"
          className="fixed inset-x-3 bottom-3 z-[1200] mx-auto max-w-2xl"
        >
          <div className="glass-strong rounded-2xl p-4 shadow-card sm:flex sm:items-center sm:gap-4">
            <Cookie className="mb-2 h-6 w-6 shrink-0 text-warning sm:mb-0" aria-hidden />
            <p className="flex-1 text-sm text-slate-300">
              We use essential cookies to keep you signed in. With your consent we also use
              analytics cookies to improve GameHub. See our{' '}
              <Link to="/legal/privacy" className="text-primary-soft underline">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="mt-3 flex gap-2 sm:mt-0">
              <Button variant="outline" size="sm" onClick={() => setConsent('rejected')}>
                Reject non-essential
              </Button>
              <Button size="sm" onClick={() => setConsent('accepted')}>
                Accept all
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
