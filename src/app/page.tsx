import Link from 'next/link';
import { Network } from 'lucide-react';
import { StartHere } from '@/features/onboarding/StartHere';
import { AssistedContrastControl, InstallPrompt, ResetButton } from '@/core/ui';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header>
        {/*
          The product mark and the credit sit at opposite ends of one row: a
          credit reads as a credit when it is beside you, not beneath you.
          `h1` keeps the document outline intact — the alt text carries the name
          for anyone who never sees the image.
        */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="m-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kroma-logo.png" alt="KROMA" className="h-9 w-auto sm:h-11" />
          </h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/powered-by-youcam.svg"
            alt="Powered by YouCam API"
            className="h-8 w-auto sm:h-10"
          />
        </div>
        {/*
          The positioning rule from the spec: never open by talking about
          colour. There are half a dozen "personal colour analysis" projects in
          the gallery, and leading with colour files us in that pile before the
          second sentence. Open with the person.

          ⚠️ AND NEVER OPEN ON THE DEFICIT. The first version led with "you
          cannot see the colour of your own face", which is true and lands like
          a diagnosis — it tells someone what is wrong with them before it tells
          them what they get. The fact is still here; it simply arrives second,
          as the reason the promise is possible rather than as the greeting.
        */}
        <p className="mt-4 text-lg leading-snug text-slate-700">
          <strong className="font-semibold text-slate-900">
            Your own colours, measured — not guessed at, and not asked about.
          </strong>{' '}
          The one face you have never seen the colour of is your own. KROMA reads it from
          your photograph and hands you the number.
        </p>
        <p className="mt-3 text-slate-600">
          KROMA measures it, tells you how sure it is, and refuses to answer when the
          light will not let it know.
        </p>
      </header>

      {/*
        ⚠️ ABOVE THE PATH, NOT BELOW IT, AND THAT IS A CORRECTION. It used to sit
        underneath the three steps on the theory that nobody installs an app
        before seeing what it does. The person testing it disagreed, and they
        were right: this is used phone-in-hand in front of a wardrobe, so the
        moment to put it on the home screen is BEFORE walking off to photograph
        things — not after, when the tab is already the thing you came back to.
        It still hides itself entirely when it cannot be acted on.
      */}
      <InstallPrompt />

      <StartHere />

      <AssistedContrastControl />

      <div className="mt-10">
        <ResetButton />
      </div>

      {/*
        Not part of the three-step path, and deliberately below it: this is for
        someone evaluating how the thing is built, not for someone trying to get
        dressed. Putting it in the path would make the empty app look like a
        menu again.

        ⚠️ IT SAID "ALL THREE SERVERS" AND THAT RUN CROSSES TWO. The same
           over-claim we removed from the screen itself was still sitting on the
           front page pointing at it. `fashion` is exercised by the try-on, not
           here — so this link now describes what this page does, and the page
           reports which servers actually answered.
      */}
      <Link
        href="/mcp"
        className="mt-8 flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700 underline"
      >
        <Network size={16} aria-hidden />
        See the transport: watch a measurement run over MCP, and what it falls back to
      </Link>

      <footer className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">
        Colours are measured by YouCam AI. Naming them, and every verdict about what
        goes with what, is worked out on your device by arithmetic you could check —
        no AI is asked to guess what colour something is.
      </footer>
    </main>
  );
}
