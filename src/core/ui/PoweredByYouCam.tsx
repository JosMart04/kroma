/**
 * The animated YouCam credit, shown while an API call is in flight.
 *
 * ⚠️ AN `<img>`, NOT INLINE SVG, ON PURPOSE. The file carries its own `<style>`
 *    with keyframes; inlining it would leak those class names into the page and
 *    let a future `.text-main` collide with it. As an image the SVG is a
 *    sandboxed document — its animations still run, its styles cannot escape.
 *
 *    The one thing that does not survive is its `@import` of a Google font: an
 *    SVG loaded as an image may not fetch external resources. It falls back to
 *    the stack already declared in the file, which is why this is fine.
 *
 * ⚠️ DECORATIVE, SO IT IS HIDDEN FROM SCREEN READERS. The waiting state is
 *    already announced in text beside it — a second voice saying "Powered by
 *    YouCam API" mid-wait is noise, not information.
 *
 * ⚠️ AND IT RESPECTS `prefers-reduced-motion`: the colour strobe is exactly the
 *    kind of thing that rule exists for, so the still version is served
 *    instead. Both files say the same words.
 */
export function PoweredByYouCam({ className = '' }: { className?: string }) {
  const defaults = 'mx-auto mt-6 h-16 sm:h-20 w-auto opacity-90';
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/powered-by-youcam-loading.svg"
        alt=""
        aria-hidden
        className={`motion-reduce:hidden ${defaults} ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/powered-by-youcam.svg"
        alt=""
        aria-hidden
        className={`hidden motion-reduce:block ${defaults} ${className}`}
      />
    </>
  );
}
