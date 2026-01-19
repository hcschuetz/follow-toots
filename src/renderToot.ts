import { effect, Signal } from "@preact/signals-core";

import A_blank from "./A_blank";
import H, { reRenderInto, type HParam } from "./H";
import type { Status } from "./mastodon-entities";
import emojify, { deepEmojify } from "./emojify";
import { linkableFeatures, linkConfigConfig, type LinkableFeature } from "./linkConfigConfig";
import sanitize from "./sanitize";
import formatDate from "./formatDate";
import "./DropDownMenu";
import "./ContextMenu";

// TODO simplify the API between tree rendering and toot rendering

export 
type LinkConfig = Record<LinkableFeature, Record<string, boolean>>;

export
type TootRenderingParams = {
  instance: string,
  keyHandler: (getTootEl: () => HTMLElement) => (ev: KeyboardEvent) => void,
  extraMenuItems: (getTootEl: () => HTMLElement) => HParam<HTMLElement>,
  linkConfigSig: Signal<LinkConfig | undefined>,
  seenSig: Signal<boolean | undefined>,
  contextMenuSig: Signal<"standard" | "custom">,
  prefix?: HTMLElement | string,
}

export default
function renderToot(toot: Status, params: TootRenderingParams): HTMLElement {

  const {account, poll, card} = toot;
  const {
    instance, prefix,
    keyHandler,
    seenSig,
    extraMenuItems, linkConfigSig, contextMenuSig,
  } = params;

  function toggleSeen() {
    seenSig.value = !seenSig.value;
  }

  function menuItems(el: HTMLElement) {
    effect(() => {
      const {value} = linkConfigSig;
      reRenderInto(el, function*() {
        yield extraMenuItems(() => tootEl);
        for (const feature of ["status", "profile"] as const) {
          const obj = value?.[feature] ?? {};
          for (const k in obj) if (obj[k]) {
            const frontend = linkConfigConfig[k];
            const href = frontend.urlFunctions[feature](instance, toot);
            yield H("button.open-link",
              {onclick: () => window.open(href)},
              H("img.link-icon", {src: frontend.icon}),
              ` Open ${linkableFeatures[feature].toLowerCase()} on ${frontend.name(instance)}`,
            );
          }
        }
        // Omit this menu item if this toot is already the root?
        yield H("button.follow-toot",
          {onclick: () => {
            const url = new URL("./tree.html", document.location.href);
            url.hash = new URLSearchParams({url: `https://${instance}/@${toot.account.acct}/${toot.id}`}).toString();
            window.open(url);
          }},
          "Follow toot",
        );
        yield H("button",
          el => {
            effect(() => {
              const otherContextMenu =
                contextMenuSig.value === "standard" ? "custom" : "standard";
              reRenderInto(el,
                `Use ${otherContextMenu} context menu`,
                {onclick() { contextMenuSig.value = otherContextMenu; }},
              );
            });
          },
        );
      });
    });
  };

  const tootEl: HTMLElement = H("div",
    {
      className: `toot visibility-${toot.visibility}`,
      tabIndex: 0,
      onkeydown: keyHandler(() => tootEl),
    },
    H("context-menu" as any,
      el => {
        effect(() => {
          el.disabled = contextMenuSig.value === "standard";
        });
      },
      H("button",
        {onclick() {
          toggleSeen();
          setTimeout(() => {
            tootEl.scrollIntoView({
              // "start" would move it behind the sticky header
              block: "center",
              behavior: "smooth",
            });
          }, 100);
        }},
        el => {
          effect(() => {
            el.textContent = seenSig.value
              ? "☐ Mark toot as unseen"
              : "☑ Mark toot as seen";
          });
        }
      ),
      H("div.contents", menuItems),
    ),
    H("div.toot-head",
      prefix,
      H("input.seen",
        {
          type: "checkbox",
          "@change": toggleSeen,
          title: "Mark toot as seen/unseen"
        },
        el => {
          effect(() => {
            el.checked = Boolean(seenSig.value);
          });
        }
      ),
      H("drop-down-menu" as any, menuItems),
      H("span.visibility", toot.visibility),
      toot.edited_at ? [
        H("span.toot-created.line-through", formatDate(toot.created_at)),
        H("span.toot-edited", formatDate(toot.edited_at)),
      ] : H("span.toot-created", formatDate(toot.created_at)),
      H("img.toot-author-avatar", {
        src: account.avatar_static,
      }),
      H("span.toot-author", emojify(account.display_name, account.emojis)),
      H("span.toot-acct", "@" + account.acct),
    ),
    () => {
      let body: HTMLElement =
      H("div.toot-body",
        H("div.toot-content", sanitize(toot.content), deepEmojify(toot.emojis)),

        !toot.media_attachments?.length ? undefined :
        () => {
          const attachments =
            H("ul.attachments", toot.media_attachments.map(att =>
              H("li.attachment",
                H("img.preview", {
                  src: att.preview_url,
                  alt: att.description ?? "",
                  title: att.description ?? "",
                }),
                att.url && A_blank("media-link", att.url, `→ ${att.type}`),
              ),
            ));
          // I didn't find any explicit documentation but looking at the
          // native mastodon client and at phanpy.social gave the impression
          // that `.sensitive` is meant to hide attachments whereas
          // `.spoiler_text` hides the entire toot.
          return (
            toot.sensitive
            ? H("details.sensitive", H("summary"), attachments)
            : attachments
          );
        },

        poll &&
        H("div.poll",
          H("ul.poll", poll.options.map((option, i) =>
            H("li.poll-option",
              H("span.poll-option-title",
                // TODO Leave it to CSS to select and place a symbol?
                (poll.own_votes ?? []).includes(i)
                ? (poll.multiple ? "☑" : "⦿︎")  // ◉
                : (poll.multiple ? "☐" : "⚪︎"), // ◎ (Is there an empty circle of this size?)
                " ",
                option.title,
              ),
              H("span.poll-option-votes",
                // TODO Leave it to CSS to combine the values?
                option.votes_count?.toString(),
                "/",
                poll.voters_count?.toString(),
              ),
            )
          )),
          poll.voters_count === poll.votes_count ? null :
          H("div.poll-votes-count", "total votes: ", poll.votes_count.toString()),
          H("div.poll-expiry",
            el => el.classList.add(poll.expired ? "poll-expired" : "poll-ongoing"),
            poll.expires_at && formatDate(poll.expires_at),
          ),
        ),

        card &&
        H("div.card",
          // If a card provides both html and an image, which one should be
          // displayed?  (Or leave the choice to the user?)
          card.image ? H("img.card-image", {
            src: card.image,
            alt: card.image_description ?? "",
            title: card.image_description ?? "",
            width: card.width ?? undefined,
            height: card.height ?? undefined,
          }) :
          // For now, don't trust the received HTML.
          // Maybe display a sanitized version later.
          // (In practice it's most of the time an iframe embedding a
          // youtube video.  It might be easier to build the HTML
          // than to sanitize it.)
          // card.html ? H("div.card-html", {innerHTML: card.html}) :
          undefined,
          function*() {
            if (card.provider_name) {
              yield card.provider_url
                ? A_blank("card-provider", card.provider_url, card.provider_name)
                : card.provider_name;
            }
            yield A_blank("card-title", card.url, card.title);
            const authors = (card.authors ?? []).filter(a => a.name);
            switch (authors.length) {
              case 0: {
                if (card.author_name) {
                  yield H("span",
                    "by ",
                    card.author_url
                    ? A_blank("card-author", card.author_url, card.author_name)
                    : card.author_name
                  );
                }
                break;
              }
              case 1: {
                const {name, url} = authors[0];
                yield H("span", "by ", A_blank("card-author", url, name));
                break;
              }
              default: {
                yield "by";
                yield H("ul.card-authors", function*() {
                  for (const {name, url} of authors) {
                    yield H("li", A_blank("card-author", url, name));
                    // TODO display the card-author's account?
                  }
                });
                break;
              }
            }
            card.description && H("div.card-description", card.description);
          },
        ),

        // TODO more status features (quotes, ...)
      );

      // See the comment on `.sensitive`
      if (toot.spoiler_text) {
        body = H("details", H("summary", toot.spoiler_text), body);
      }

      body.classList.add("toot-full-body");
      return body;
    },
  );
  return tootEl;
}
