'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  "INSTALL THIS APP" — because the browser hides it where nobody looks
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ THIS EXISTS BECAUSE "INSTALLABLE" WAS TRUE AND USELESS. The manifest and
 *     the service worker make the browser *capable* of installing KROMA, and
 *     then the browser puts the option in a small icon at the end of the
 *     address bar, or three levels into a ⋮ menu, or — on iOS — behind a Share
 *     sheet that never announces itself. Nobody evaluating this app for five
 *     minutes will find any of those.
 *
 *  ── WHY IT IS WORTH A BUTTON AT ALL ─────────────────────────────────────
 *
 *  This is a product used phone-in-hand with the camera open, in a shop, in
 *  front of a wardrobe. Installed, it opens without browser chrome and behaves
 *  like a tool. In a tab it behaves like a web page you have to find again.
 *
 *  ── THE TWO PLATFORMS BEHAVE DIFFERENTLY AND WE SAY SO ──────────────────
 *
 *  Chrome fires `beforeinstallprompt`, which we capture and re-offer at a
 *  moment of our choosing. Safari on iOS never fires it and ignores the service
 *  worker entirely for this purpose: there, installing is a manual gesture and
 *  the only honest thing an app can do is TELL you the gesture. So iOS gets
 *  instructions, not a button that would do nothing.
 */
import { useEffect, useState } from 'react';
import { Download, Share, Plus } from 'lucide-react';

/** Not in lib.dom — Chrome-only, and still the way this is done. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS reports it here instead, and only here.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onPrompt = (e: Event) => {
      // Chrome would otherwise show its own banner whenever it felt like it.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Already installed, or a browser that cannot install: say nothing rather
  // than advertise something that will not work.
  if (installed) return null;
  if (!deferred && !ios) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // The event is single-use; a second prompt() throws.
    setDeferred(null);
  }

  return (
    <section
      className="mt-6 rounded-xl border-2 border-slate-300 p-4"
      aria-labelledby="install-heading"
    >
      <h2 id="install-heading" className="flex items-center gap-2 font-semibold text-slate-900">
        <Download size={18} aria-hidden />
        Install KROMA on this device
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        It opens straight to the camera, without the browser around it. You still need a
        connection — every colour here is a measurement, not a stored answer.
      </p>

      {deferred ? (
        <button
          onClick={install}
          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Download size={16} aria-hidden />
          Install
        </button>
      ) : (
        /*
          iOS gives no programmatic route: Safari never fires the install event
          and there is no API to ask. Instructions are the honest maximum, and a
          button here would be a lie.
        */
        <ol className="mt-3 space-y-1.5 text-sm text-slate-700">
          <li className="flex items-center gap-2">
            <Share size={15} className="shrink-0" aria-hidden />
            1. Tap the Share button in Safari&rsquo;s toolbar
          </li>
          <li className="flex items-center gap-2">
            <Plus size={15} className="shrink-0" aria-hidden />
            2. Choose &ldquo;Add to Home Screen&rdquo;
          </li>
        </ol>
      )}
    </section>
  );
}
