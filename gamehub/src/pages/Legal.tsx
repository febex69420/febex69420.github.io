import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2 } from 'lucide-react';

const DOCS: Record<string, { title: string; updated: string; sections: { h: string; p: string }[] }> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'June 2026',
    sections: [
      { h: '1. Data we collect', p: 'We collect your account details (email, username), profile information you choose to provide, content you create (messages, clips, comments), and technical data such as device and usage information needed to operate the service securely.' },
      { h: '2. How we use your data', p: 'We use your data to provide GameHub features, keep your account secure, prevent abuse and spam, and improve the product. We do not sell your personal data.' },
      { h: '3. Legal bases (GDPR)', p: 'We process data on the bases of contract performance (providing the service), legitimate interests (security and abuse prevention), and consent (optional analytics cookies), which you can withdraw at any time.' },
      { h: '4. Your rights', p: 'You have the right to access, correct, export, and delete your data. You can export or delete your account at any time from Settings → Account & Data.' },
      { h: '5. Data retention', p: 'We retain your data while your account is active. When you delete your account, your personal data is erased within 30 days, except where retention is legally required.' },
      { h: '6. Cookies', p: 'We use essential cookies for authentication and, with your consent, analytics cookies to understand usage. Manage your choices via the cookie banner.' },
      { h: '7. Children', p: 'GameHub is not directed to children under 13 (or the minimum digital age in your country). We do not knowingly collect data from children below this age.' },
      { h: '8. Contact', p: 'For privacy requests, contact privacy@gamehub.example.com. You may also lodge a complaint with your local data protection authority.' },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'June 2026',
    sections: [
      { h: '1. Acceptance', p: 'By creating an account you agree to these Terms. You must be at least 13 years old to use GameHub.' },
      { h: '2. Your account', p: 'You are responsible for activity on your account and for keeping your credentials secure. Notify us immediately of any unauthorized use.' },
      { h: '3. Acceptable use', p: 'You agree not to harass others, post illegal content, infringe copyrights, distribute malware, spam, or abuse the real-time or upload systems. Violations may result in warnings, mutes, or bans.' },
      { h: '4. Content & copyright', p: 'You retain ownership of content you upload but grant GameHub a licence to host and display it within the service. We respond to valid copyright (DMCA-style) takedown notices at copyright@gamehub.example.com.' },
      { h: '5. Moderation', p: 'We may remove content and suspend accounts that violate these Terms. Moderation actions are recorded in an audit log and may be appealed.' },
      { h: '6. Disclaimers', p: 'GameHub is provided “as is”. We work to keep the service available and secure but cannot guarantee uninterrupted operation.' },
      { h: '7. Changes', p: 'We may update these Terms; we will notify you of material changes. Continued use after changes constitutes acceptance.' },
    ],
  },
};

export default function Legal() {
  const { doc } = useParams();
  const content = DOCS[doc ?? 'privacy'] ?? DOCS.privacy;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
            <Gamepad2 className="h-5 w-5 text-white" aria-hidden />
          </span>
          <span className="font-display text-lg tracking-wider text-white">GameHub</span>
        </Link>
        <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </header>

      <h1 className="text-3xl font-display text-white">{content.title}</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated {content.updated}</p>

      <div className="mt-8 space-y-6">
        {content.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold text-white">{s.h}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{s.p}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 flex gap-4 border-t border-white/10 pt-6 text-sm">
        <Link to="/legal/privacy" className="text-primary-soft hover:underline">Privacy Policy</Link>
        <Link to="/legal/terms" className="text-primary-soft hover:underline">Terms of Service</Link>
      </div>
    </div>
  );
}
