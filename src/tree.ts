import { effect, signal } from '@preact/signals-core';

import { deleteTree, fetchTree, updateClosed } from './actions';
import H from './H';
import database, { type DetailEntry, type OverviewEntry, type SubTree } from './database';
import type { Notifications } from './Notifications';
import setupNotifications from './setupNotifications';
import url2key from './url2key';
import type { Status } from './mastodon-entities';
import { linkConfigConfig, type LinkableFeature } from './linkConfigConfig';
import emojify from './emojify';
import A_blank from './A_blank';

// The hash should have the format of a search query.
// (We are not using the search query as this would cause
// unnecessary page fetches for varying parameters and also
// leak somewhat private data to the site hoster.)
// In standard form there are parameters "instance" and "id".
const params = new URLSearchParams(location.hash.substring(1));

// Accept an URL from one of various mastodon frontends as
// parameter "url" and convert to standard form.
try {
  const url = params.get("url");
  if (url) {
    const [instance, id] = url2key(url) ?? closeWindow();
    params.delete("url");
    params.set("instance", instance);
    params.set("id", id);
    window.history.replaceState({}, '', "#" + params);
    if (!await (await database).get("treeOverview", `${instance}/${id}`)) {
      // no "await" => load tree in background:
      fetchTree(instance, id);
    }
  }
} catch (e) {
  alert(`something went wrong when adapting the hash: ${e}`);
}

function closeWindow(): never {
  window.close();
  alert("Could not close this window automatically.  Please close it manually.");
  throw "Window was closed neither automatically nor manually."
}

// TODO report problem if instance or value are missing or look strange
const key = `${params.get("instance")}/${params.get("id")}`;

setupNotifications<Notifications>("followToots", {
  async updatedTreeOverview(updKey) {
    if (updKey !== key) return;
    show(false);
  },

  async updatedTree(updKey) {
    if (updKey !== key) return;
    show(true);
  },

  async deletedTree(updKey) {
    if (updKey !== key) return;
    show(true);
  },

  cleared() {
    show(true);
  }
});


const db = await database;

const closedIdsSignal = signal<Set<string> | undefined>();

async function setClosedIdsSignal() {
  closedIdsSignal.value = (await db.get("treeOverview", key))?.closedIds;
}

function observeClosed(id: string, update: (closed: boolean) => unknown) {
  // TODO Should we collect the dispose functions and invoke them, for example
  // in setClosedIdsSignal()?
  effect(() => {
    update(closedIdsSignal.value?.has(id) ?? false);
  });
}

const appEl = document.querySelector("#app")!;
const tootTreeEl = document.querySelector("#toot-tree")!;

async function openAll() {
  const overview = await db.get("treeOverview", key);
  if (!overview) return;
  overview.closedIds.clear();
  updateClosed(overview);
}

async function closeAll() {
  const overview = await db.get("treeOverview", key);
  if (!overview) return;
  const details = await db.get("treeDetails", key);
  if (!details) return;
  const {root, descendants} = details;
  const {closedIds} = overview;
  [root, ...descendants].forEach(toot => closedIds.add(toot.id));
  updateClosed(overview);
}

async function toggleClosed(tootId: string, rootKey: string) {
  const overview = await db.get("treeOverview", rootKey);
  if (!overview) return;
  const {closedIds} = overview;
  if (closedIds.has(tootId)) {
    closedIds.delete(tootId);
  } else {
    closedIds.add(tootId);
  }
  updateClosed(overview);
}

const linkConfigurationsSig =
  signal<Record<LinkableFeature, Record<string, boolean>>>();

async function readLinkConfig() {
  linkConfigurationsSig.value = (await db.get("config", "links")).value;
}

new BroadcastChannel("linkConfig").addEventListener("message", readLinkConfig);

readLinkConfig();


function renderToot(toot: Status, rootKey: string, prefix?: HTMLElement | string): HTMLElement {
  const [instance] = rootKey.split("/", 1); // a bit hacky

  const {account, poll, card} = toot;

  function deepEmojify(el: HTMLElement): void {
    for (const child of el.childNodes) {
      if (child instanceof HTMLElement) {
        deepEmojify(child);
      } else if (child instanceof Text) {
        const emojified = emojify(child.data, toot.emojis);
        if (![...emojified.children].every(part => part instanceof Text)) {
          el.replaceChild(emojified, child);
        }
      } else {
        console.error("unexpected value to sanitize&emojify:", child);
      }
    }
  }

  const headerLinks = (feature: LinkableFeature) =>
    H("span.contents", el => {
      effect(() => {
        el.replaceChildren(
          ...Object.entries(linkConfigurationsSig.value?.[feature] ?? {})
          .filter(([_, v]) => v)
          .map(([k, _]) =>
            A_blank("icon-link",
              linkConfigConfig[k].urlFunctions[feature](instance, toot),
              H("img.link-icon", {src: linkConfigConfig[k].icon}),
            )
          )
        );
      });
    });

  let closeOpenButton: HTMLButtonElement;
  const tootEl = H("div", {className: `toot visibility-${toot.visibility}`},
    H("div.toot-head",
      prefix,
      closeOpenButton =
      H("button.close-open",
        {"@click": async () => toggleClosed(toot.id, rootKey)}),
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
        // TODO sanitize (or trust the instance?)
        H("div.toot-content", {innerHTML: toot.content}, deepEmojify),

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
      observeClosed(toot.id, closed => {
        closeOpenButton.textContent = closed ?  "+" : "−";
        body.hidden = closed;
      });
      return body;
    },
  );
  return tootEl;
}

function renderMissingToots(toot: Status, children: SubTree[]): HTMLElement | void {
  const nMissing = toot.replies_count - children.length;
  if (!nMissing) return;
  return H("li.missing-children",
    `${nMissing} more repl${nMissing === 1 ? "y" : "ies"} not displayed.`,
    H("br"),
    `(Mastodon restricts the tree provided to unauthenticated clients.)`,

  );
}

function renderTootTree(details: DetailEntry): void {
  const {key, tootTree} = details;
  function descend({toot, children}: SubTree, prevThreadPos = 0): HTMLElement[] {
    const selfReply =
      children.find(child => child.toot.account.id === toot.account.id);
    const otherChildren = children.filter(subtree => subtree !== selfReply);
    const threadPos = prevThreadPos + 1;
    const threadPosMarker =
      prevThreadPos > 0 || selfReply ? H("span.thread-pos", `#${threadPos}`) :
      undefined;
    return [
      renderToot(toot, key, threadPosMarker),
      H("ul.tree-node",
        ...otherChildren.map(subtree => H("li", ...descend(subtree))),
        renderMissingToots(toot, children),
      ),
      ...selfReply
      ? descend(selfReply, threadPos)
      : [],
    ];
  }

  tootTreeEl.replaceChildren(...descend(tootTree));
}

async function renderTootList(details: DetailEntry, restricted: boolean) {
  const {key, root, descendants} = details;
  const displayedDescendants =
    restricted
    ? descendants.filter(toot => !closedIdsSignal.value?.has(toot.id))
    : descendants;
  tootTreeEl.replaceChildren(
    H("ul.toot-list",
      ...[root, ...displayedDescendants].map(toot =>
        H("li", renderToot(toot, key))
      ),
    ),
  )
}

const displayModes = ["hierarchical", "chronological", "root + open"] as const;
type DisplayMode = (typeof displayModes)[number]
const displayModeSig = signal<DisplayMode>("hierarchical");

function renderTreeHead(overview: OverviewEntry, instance: string, id: string) {
  const {rootAuthor, rootAccountEmojis} = overview;
  appEl.replaceChildren(
    H("div.tree-head-author",
      H("img.tree-head-avatar", { src: overview.rootAuthorAvatar }),
      H("span.tree-head-name",
        rootAuthor ? emojify(rootAuthor, rootAccountEmojis) : key,
      ),
      H("span.tree-head-acct",
        overview.rootAcct ? `@${overview.rootAcct} on ${instance}` : ""
      )
    ),
    H("span.tree-head-date",
      overview.rootCreatedAt?.toLocaleString("sv"),
      "\u2002–\u2002",
      overview.lastCreatedAt?.toLocaleString("sv"),
      `\u2003last fetched ${overview.lastRetrievalDate?.toLocaleString("sv") ?? "-"}`
    ),
    H("span.tree-head-statistic",
      H("span",
        `${1 + (overview.nDescendants ?? 0)} toot(s)`,
        el => {
          if (overview.missingDescendants) {
            el.textContent = "> " + el.textContent;
          }
        }
      ),
      H("span", `\u2003${overview.nOpen ?? "??"} open`)
    ),
    overview?.missingDescendants
      ? H("div.tree-head-missing",
        `At least ${overview.missingDescendants} more toot(s) are not displayed.
        (Mastodon restricts the tree provided to unauthenticated clients.)`
      ) : "",
    H("div.tree-head-buttons",
      H("button", {
        textContent: "[−] Close all",
        "@click": () => closeAll(),
      }),
      H("button", {
        textContent: "[+] Open all",
        "@click": () => openAll(),
      }),
      H("button", {
        textContent: "⟳ Reload",
        "@click": () => fetchTree(instance, id),
      }),
      H("button", {
        textContent: "✗ Remove",
        "@click": () => overview && deleteTree(overview),
      })
    ),
    H("div.tree-head-choose-mode",
      ...displayModes.map(mode => H("label",
        H("input",
          {
            type: "radio",
            "@click": () => { displayModeSig.value = mode; },
          },
          el => {
            effect(() => {
              el.checked = mode === displayModeSig.value;
            });
          }
        ),
        mode
      )
      )
    )
  );
}

function renderUnfollowed(instance: string, id: string) {
    appEl.replaceChildren(
    H("div", `You are currently not following toot ${id} from ${instance}. `),
    H("div",
      H("button", {
        textContent: "Follow",
        "@click": () => fetchTree(instance, id),
      }),
      " it or close this tab.",
    ),
  );
  tootTreeEl.replaceChildren(/* ...with nothing */);
}

async function renderDetails(details: DetailEntry) {
  effect(() => {
    switch (displayModeSig.value) {
      case "hierarchical": {
        renderTootTree(details);
        break;
      }
      case "chronological": {
        renderTootList(details, false);
        break;
      }
      case "root + open": {
        renderTootList(details, true);
        break;
      }
      default: {
        tootTreeEl.replaceChildren("Oops");
      }
    }
  });
}

async function show(withDetails: boolean) {
  await setClosedIdsSignal();
  const [instance, id] = key.split("/");
  const overview = await db.get("treeOverview", key);
  if (!overview) {
    renderUnfollowed(instance, id);
    return;
  }
  renderTreeHead(overview, instance, id);
  if (withDetails) {
    const details = await db.get("treeDetails", key);
    if (!details) {
      document.title = overview.rootAuthor ?? "Follow Toot";
      return;
    }

    const {root} = details;
    const text = root.spoiler_text || html2text(root.content);
    document.title = `${root.account.display_name}: "${text}"`;

    await renderDetails(details);
  }
  document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']")!.href =
    overview.rootAuthorAvatar ?? "";
}

function html2text(html: string) {
  const auxEl = new Document().createElement("div");
  // TODO sanitize
  auxEl.innerHTML = html;
  return auxEl.textContent;
}

show(true);
