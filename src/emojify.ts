
import H from "./H";
import type { CustomEmoji } from "./mastodon-entities";

/**
 * The emojification logic appears more natural without the quirks,
 * but with them the behavior is compatible to the default mastodon UI,
 * at least for my test cases.
 *
 * Note:
 * - The differences appear only in quite specific situations.
 * - Apparently phanpy does not apply these quirks.
 */
const QUIRKS_MODE = true;

/**
 * Similar to the emojification code at
 * https://github.com/mastodon/mastodon/blob/4bae3da85c8ee935539aacc92429bdb55aaf145e/app/javascript/mastodon/features/emoji/emoji.js#L31,
 * but:
 * - Only for custom emojis (":shortcode:").
 *   Modern browsers should support Unicode emojis directly.
 * - Omitting the special light/dark treatment.
 */
export default function* emojify(text: string, emojis: CustomEmoji[] = []) {
  if (emojis === null) {
    yield text;
    return;
  }
  let pos = text.indexOf(":", 0);
  if (pos < 0) {
    yield text;
    return;
  }
  let emittedUntil = 0;
  for (;;) {
    // Here i points to a ":" which might start a ":shortcode:".
    const start = pos + 1;
    const end = text.indexOf(":", start);
    if (QUIRKS_MODE && end === start) {pos++; continue;}
    if (end < 0) break;
    const code = text.substring(start, end);
    const emoji = emojis.find(emoji => emoji.shortcode === code);
    if (!emoji) {
      pos = end;
      if (QUIRKS_MODE && (pos = text.indexOf(":", pos+1)) < 0) break;
      continue;
    }
    yield text.substring(emittedUntil, pos);
    yield H("img.custom-emoji", {
        // The original uses url or static_url, depending on some config:
        src: emoji.static_url,
        alt: code,
        title: code,
        draggable: false,
      },
    );
    emittedUntil = end + 1;
    pos = text.indexOf(":", emittedUntil);
    if (pos < 0) break;
  }
  yield text.substring(emittedUntil);
}

export
function deepEmojify(emojis: CustomEmoji[]): (el: HTMLElement) => void {
  function descend(el: HTMLElement) {
    for (const child of el.childNodes) {
      if (child instanceof HTMLElement) {
        descend(child);
      } else if (child instanceof Text) {
        const emojified = [...emojify(child.data, emojis)];
        if (emojified.length === 1 && typeof emojified[0] === "string") continue;
        const f = new DocumentFragment();
        f.append(...emojified);
        el.replaceChild(f, child);
      } else {
        console.error("unexpected value to emojify:", child);
      }
    }
  }
  return descend;
}
