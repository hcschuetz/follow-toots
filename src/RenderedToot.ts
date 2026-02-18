import A_blank from "./A_blank";
import H, { renderInto, reRenderInto, type HParam } from "./H";
import type { Status } from "./mastodon-entities";
import emojify, { deepEmojify } from "./emojify";
import sanitize from "./sanitize";
import formatDate from "./formatDate";
import ContextMenu from "./ContextMenu";
import DropDownMenu from "./DropDownMenu";
import renderTeX, { getTexStyle, latexLogo, looksLikeTeX } from "./renderTeX";
import tootContentCSS from "./toot-content.css?raw";

const countProps = ([
  ["reblogs_count",    "B", "boost",     "boosts", "onshowboosts"],
  ["favourites_count", "F", "favourite", "favourites", "onshowfavs"],
  ["quotes_count",     "Q", "quote",     "quotes"],
  ["replies_count",    "R", "reply",     "replies"],
] as const)
.map(([prop, abbr, singular, plural, method]) => ({prop, abbr, singular, plural, method}));

const tootContentStyle = new CSSStyleSheet();
tootContentStyle.replace(tootContentCSS);

export default
class RenderedToot extends HTMLElement {

  #head: HTMLElement;
  get head() { return this.#head; }

  // parts modified by property setters:
  #prefixWrapper = H("span.contents.prefix");
  #seenInput = H("input.seen", {
    type: "checkbox",
    // trigger side effects of `set seen(...)`:
    onchange: () => this.seen = this.seen,
    title: "Mark toot as seen/unseen"
  });
  #toot: Status;
  #dropDownMenu = new DropDownMenu();
  #contextMenu = new ContextMenu();

  set headerPrefix(hp: HParam) { reRenderInto(this.#prefixWrapper, hp); }

  get seen() { return this.#seenInput.checked }
  set seen(value: boolean) {
    this.#seenInput.checked = value;
    this.onseenchange?.(new CustomEvent("seenchanged", {detail: this.seen}));
  }
  onseenchange?: (ev: CustomEvent<boolean>) => unknown;

  onshowboosts?: (toot: Status) => unknown;
  onshowfavs?: (toot: Status) => unknown;

  // TODO Unify the two menu-item lists?  Or do we expect them to diverge?

  set dropDownMenuItemProvider(value: (toot: Status) => HParam) {
    this.#dropDownMenu.itemProvider = () => [
      value(this.#toot),
    ];
  }

  set contextMenuItemProvider(value: (toot: Status) => HParam) {
    this.#contextMenu.itemProvider = () => [
      value(this.#toot),
    ];
  }

  // Without a 0-parameter constructor we cannot create instances in HTML,
  // but only in JS.
  constructor(toot: Status) {
    super();
    this.#toot = toot;
    const {account, poll, card} = toot;
    const texWrapper = H("span.contents");
    const stats =
      (countProps.every(({prop}) => toot[prop] === 0)) ? null :
      H("span.toot-stats",
        {title: countProps.map(({prop, singular, plural}) => {
          const count = toot[prop];
          return `${count} ${count === 1 ? singular : plural}`;
        }).join(", ")},
        countProps
        .filter(({prop}) => toot[prop] !== 0)
        .flatMap(({prop, abbr, method}, i) => [
          ...i === 0 ? [] : ["/"],
          H("span",
            method && {onclick: ev => {
              ev.stopImmediatePropagation();
              ev.preventDefault();
              this[method]?.(toot);
            }},
            `${toot[prop]}${abbr}`,
          ),
        ]),
      );
    reRenderInto(this as HTMLElement,
      {
        className: `toot visibility-${toot.visibility}`,
        tabIndex: 0,
      },
      this.#contextMenu,
      this.#head =
      H("div.toot-head",
        this.#prefixWrapper,
        this.#seenInput,
        this.#dropDownMenu,
        H("img.toot-author-avatar", {
          src: account.avatar_static,
        }),
        H("span.toot-author", emojify(account.display_name, account.emojis)),
        H("span.toot-acct", "@" + account.acct),
        H("span.fill",
          texWrapper,
          stats,
          H("span.visibility", toot.visibility),
          toot.edited_at ? [
            H("span.toot-created.line-through", formatDate(toot.created_at)),
            H("span.toot-edited", formatDate(toot.edited_at)),
          ] : H("span.toot-created", formatDate(toot.created_at)),
        ),
      ),
      () => {
        const contentEl = H("div.toot-content",
          sanitize(toot.content),
          deepEmojify(toot.emojis),
        );
        const hostEl = H("div.toot-content-host");
        const shadowRoot = hostEl.attachShadow({mode: "open"});
        shadowRoot.adoptedStyleSheets.push(tootContentStyle);
        shadowRoot.getRootNode().appendChild(contentEl);

        let body: HTMLElement =
        H("div.toot-body",
          hostEl,
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

        if (looksLikeTeX(contentEl!)) {
          let backup: Node | undefined;
          renderInto(texWrapper,
            H("label",
              latexLogo(),
              H("input", input => ({
                type: "checkbox",
                onkeydown: ev => {
                  if (ev.key === " ") {
                    // toggle this checkbox but not the "seen" status
                    ev.stopPropagation();
                  }
                },
                onchange: ev => {
                  ev.stopImmediatePropagation();
                  ev.preventDefault();
                  if (input.checked) {
                    backup = contentEl.cloneNode(true);
                    renderTeX(contentEl);
                    const {adoptedStyleSheets} = hostEl.shadowRoot!;
                    const texStyle = getTexStyle();
                    // We do not remove texStyle when LaTeX rendering is
                    // switched off (because I don't know how and because it's
                    // anyway more efficient to keep it.)
                    // Therefore we better avoid duplicates here:
                    if (!adoptedStyleSheets.includes(texStyle)) {
                      adoptedStyleSheets.push(texStyle);
                    }
                  } else {
                    reRenderInto(contentEl, backup!.childNodes as HParam);
                  }
                }
              })),
            ),
          );
        }

        // See the comment on `.sensitive`
        if (toot.spoiler_text) {
          body = H("details", H("summary", toot.spoiler_text), body);
        }

        body.classList.add("toot-full-body");
        return body;
      },
    );
  }
}

window.customElements.define("rendered-toot", RenderedToot);
