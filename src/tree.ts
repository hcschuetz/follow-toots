import { effect, signal } from '@preact/signals-core';

import { deleteTree, fetchTree, updateClosed } from './actions';
import H from './H';
import database, { type DetailEntry, type OverviewEntry, type SubTree } from './database';
import type { Notifications } from './Notifications';
import setupNotifications from './setupNotifications';
import url2key from './url2key';
import type { Status } from './mastodon-entities';
import { type LinkableFeature } from './linkConfigConfig';
import emojify from './emojify';
import renderToot, { type LinkConfig } from './renderToot';

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

const toggleClosed = (tootId: string, rootKey: string) => async () => {
  const overview = await db.get("treeOverview", rootKey);
  if (!overview) return;
  const {closedIds} = overview;
  if (closedIds.has(tootId)) {
    closedIds.delete(tootId);
  } else {
    closedIds.add(tootId);
  }
  updateClosed(overview);
};

const observeClosed = (id: string) => (update: (closed: boolean) => unknown) => {
  // TODO Should we collect the dispose functions and invoke them, for example
  // in setClosedIdsSignal()?
  effect(() => {
    update(closedIdsSignal.value?.has(id) ?? false);
  });
};

const linkConfigurationsSig = signal<LinkConfig>();

async function readLinkConfig() {
  linkConfigurationsSig.value = (await db.get("config", "links")).value;
}

const observeLinkConfig = (update: (config?: LinkConfig) => unknown) => {
  effect(() => {
    update(linkConfigurationsSig.value)
  })
};

new BroadcastChannel("linkConfig").addEventListener("message", readLinkConfig);

readLinkConfig();

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
    const [instance] = key.split("/", 1); // a bit hacky
    return [
      renderToot(
        toot, instance,
        observeClosed(toot.id),
        toggleClosed(toot.id, key),
        observeLinkConfig,
        threadPosMarker,
      ),
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
  const [instance] = key.split("/", 1); // a bit hacky
  const displayedDescendants =
    restricted
    ? descendants.filter(toot => !closedIdsSignal.value?.has(toot.id))
    : descendants;
  tootTreeEl.replaceChildren(
    H("ul.toot-list",
      ...[root, ...displayedDescendants].map(toot =>
        H("li",
          renderToot(
            toot, instance,
            observeClosed(toot.id),
            toggleClosed(toot.id, key),
            observeLinkConfig,
          ),
        )
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
