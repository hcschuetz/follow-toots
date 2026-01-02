
import H from "./H";
import type { CustomEmoji } from "./mastodon-entities";

// Mostly compatible with the emojification code at
// https://github.com/mastodon/mastodon/blob/4bae3da85c8ee935539aacc92429bdb55aaf145e/app/javascript/mastodon/features/emoji/emoji.js#L31,
// but only for custom emojis (":shortcode:").
// Hoping that modern browsers support Unicode emojis directly.
// Also omitting the special light/dark treatment.
export default function emojify(text: string, emojis: CustomEmoji[] = []): DocumentFragment {
  const result = new DocumentFragment();
  const regex = /(?<=:)[^:]+(?=:)/gd;
  const candidates = text.matchAll(regex);
  let i = 0;
  for (;;) {
    const {value, done} = candidates.next();
    if (done) break;
    const code = value[0], [[from, to]] = value.indices!;
    const emoji = emojis.find(emoji => emoji.shortcode === code);
    if (emoji) {
      result.append(
        text.substring(i, from - 1),
        H("img.custom-emoji",
          {
            // The original uses url or static_url, depending on some config:
            src: emoji.static_url,
            alt: code,
            title: code,
            draggable: false,
          },
        ),
      );
      i = to + 1;
      // Do not convert the next section (even if it is a shortcode)
      // since its initial ":" has already been used.
      if (candidates.next().done) break;
    }
  }
  result.append(text.substring(i));
  return result;
}

// console.dir(emojify("sdfgh:foo:bar:baz:eoriug", [
//   {shortcode: "foo", static_url: "http://example.org/foo"},
//   {shortcode: "bar", static_url: "http://example.org/bar"},
//   {shortcode: "baz", static_url: "http://example.org/baz"},
// ] as CustomEmoji[]).childNodes);

export
function deepEmojify(emojis: CustomEmoji[]): (el: HTMLElement) => void {
  function descend(el: HTMLElement) {
    for (const child of el.childNodes) {
      if (child instanceof HTMLElement) {
        descend(child);
      } else if (child instanceof Text) {
        const emojified = emojify(child.data, emojis);
        if (![...emojified.children].every(part => part instanceof Text)) {
          el.replaceChild(emojified, child);
        }
      } else {
        console.error("unexpected value to emojify:", child);
      }
    }
  }
  return descend;
}
