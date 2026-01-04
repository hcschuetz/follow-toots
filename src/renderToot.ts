import A_blank from "./A_blank";
import H from "./H";
import type { Status } from "./mastodon-entities";
import emojify, { deepEmojify } from "./emojify";
import { linkConfigConfig, type LinkableFeature } from "./linkConfigConfig";
import type { Observation } from "./Observation";
import sanitize from "./sanitize";

export 
type LinkConfig = Record<LinkableFeature, Record<string, boolean>>;

export default
function renderToot(
  toot: Status,
  instance: string,
  observeLinkConfig: Observation<LinkConfig | undefined>,
  toggleClosed?: () => unknown,
  observeClosed?: Observation<boolean>,
  prefix?: HTMLElement | string,
): HTMLElement {

  const {account, poll, card} = toot;

  const headerLinks = (feature: LinkableFeature) =>
    H("span.contents", el => {
      observeLinkConfig(linkConfig => {
        el.replaceChildren();
        const obj = linkConfig?.[feature] ?? {};
        for (const k in obj) if (obj[k]) {
          el.append(
            A_blank("icon-link",
              linkConfigConfig[k].urlFunctions[feature](instance, toot),
              H("img.link-icon", {src: linkConfigConfig[k].icon}),
            )
          )
        }
      });
    });

  let closeOpenButton: HTMLButtonElement | undefined;
  const tootEl = H("div", {className: `toot visibility-${toot.visibility}`},
    H("div.toot-head",
      prefix,
      closeOpenButton =
      toggleClosed && H("button.close-open", {"@click": toggleClosed}),
      headerLinks("status"),
      H("span.visibility", `[${toot.visibility}]`),
      H("span.toot-created", new Date(toot.created_at).toLocaleString("sv")),
      H("img.toot-author-avatar", {
        src: account.avatar_static,
      }),
      H("span.toot-author", emojify(account.display_name, account.emojis)),
      H("span.toot-acct", "@" + account.acct),
      headerLinks("profile"),
    ),
    () => {
      let body: HTMLElement =
      H("div.toot-body",
        H("div.toot-content", ...sanitize(toot.content), deepEmojify(toot.emojis)),

        !toot.media_attachments?.length ? undefined :
        () => {
          const attachments =
            H("ul.attachments", ...toot.media_attachments.map(att =>
              H("li.attachment",
                H("img.preview", {
                  src: att.preview_url,
                  title: att.description ?? undefined,
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
          H("ul.poll", ...poll.options.map((option, i) =>
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
            poll.expires_at && new Date(poll.expires_at).toLocaleString("sv"),
          ),
        ),

        card &&
        H("div.card",
          A_blank("card-title", card.url, card.title),
          card.description && H("div.card-description", card.description),
          // If a card provides both html and an image, which one should be
          // displayed?  (Or leave the choice to the user?)
          card.image ? H("img.card-image", {
            src: card.image,
            alt: card.image_description ?? undefined,
          }) :
          card.html ? H("div.card-html", {innerHTML: card.html}) :
          undefined,
        ),

        // TODO more status features (quotes...)
      );

      // See the comment on `.sensitive`
      if (toot.spoiler_text) {
        body = H("details", H("summary", toot.spoiler_text), body);
      }

      body.classList.add("toot-full-body");
      if (observeClosed) {
        observeClosed(closed => {
          closeOpenButton!.textContent = closed ?  "+" : "−";
          body.hidden = closed;
        });
      } else {
        body.hidden = true;
      }
      return body;
    },
  );
  return tootEl;
}
