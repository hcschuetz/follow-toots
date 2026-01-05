import { effect, signal } from '@preact/signals-core';

import { deleteTree, fetchTree, updateClosed } from './actions';
import H from './H';
import database, { type DetailEntry, type OverviewEntry, type SubTree } from './database';
import type { Notifications } from './Notifications';
import setupNotifications from './setupNotifications';
import url2key from './url2key';
import emojify from './emojify';
import renderToot, { type LinkConfig } from './renderToot';
import formatDate from './formatDate';
import type { Status } from './mastodon-entities';

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
const ancestorsEl = document.querySelector("#ancestors")!;
const descendantsEl = document.querySelector("#descendants")!;

/**
 * An id for the current "toot version"
 * 
 * ...consisting of the toot id and (if present) the edit date.
 * 
 * Used to re-open a closed toot after an edit.
 * @param toot 
 * @returns 
 */
const versionId = (toot: Status): string =>
  toot.edited_at ? `${toot.id}@${toot.edited_at}` : toot.id;

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
  [root, ...descendants].forEach(toot => closedIds.add(versionId(toot)));
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

function renderChildrenMismatch(diff: number): HTMLElement | void {
  if (diff) {
    return H("li.children-mismatch",
      `Mismatch: Found ${
        Math.abs(diff)
      } ${
        Math.abs(diff) === 1 ? "child" : "children"
      } ${
        diff < 0 ? "less" : "more"
      } than expected.`,
    );
  }
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
        observeLinkConfig,
        toggleClosed(versionId(toot), key),
        observeClosed(versionId(toot)),
        threadPosMarker,
      ),
      H("ul.tree-node",
        ...otherChildren.map(subtree => H("li", ...descend(subtree))),
        renderChildrenMismatch(children.length - toot.replies_count),
      ),
      ...selfReply
      ? descend(selfReply, threadPos)
      : [],
    ];
  }

  descendantsEl.replaceChildren(...descend(tootTree));
}

async function renderTootList(details: DetailEntry, restricted: boolean) {
  const {key, root, descendants} = details;
  const [instance] = key.split("/", 1); // a bit hacky
  const displayedDescendants =
    restricted
    ? descendants.filter(toot => !closedIdsSignal.value?.has(versionId(toot)))
    : descendants;
  descendantsEl.replaceChildren(
    H("ul.toot-list",
      ...[root, ...displayedDescendants].map(toot =>
        H("li",
          renderToot(
            toot, instance,
            observeLinkConfig,
            toggleClosed(versionId(toot), key),
            observeClosed(versionId(toot)),
          ),
        )
      ),
    ),
  )
}

const displayModes = ["hierarchical", "chronological", "root + open"] as const;
type DisplayMode = (typeof displayModes)[number]
const displayModeSig = signal<DisplayMode>("hierarchical");

const explainMismatch =
`Possible reasons for a mismatch between expected and actual number of toots:
- Without authentication Mastodon reports at most 60 descendants.
- Some toots might be non-public.
- Replies or reply counts might not yet be propagated to your instance.
- ...`;

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
      formatDate(overview.rootCreatedAt),
      "\u2002–\u2002",
      formatDate(overview.lastCreatedAt),
      `\u2003last fetched ${formatDate(overview.lastRetrievalDate)}`
    ),
    H("span.tree-head-statistics",
      H("span", `${1 + (overview.nDescendants ?? 0)} toot(s)`),
      overview.nDescendants !== overview.nExpectedDescendants
        ? H("span.warn",
          {title: explainMismatch},
          `${(overview.nExpectedDescendants ?? 0) + 1} expected`
        ) : "",
      H("span", `${overview.nOpen ?? "??"} open`)
    ),
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
  ancestorsEl.replaceChildren(/* ...with nothing */);
  descendantsEl.replaceChildren(/* ...with nothing */);
}

function renderAncestors(details: DetailEntry) {
  const ancestors = details.ancestors;
  if (ancestors.length === 0) {
    ancestorsEl.replaceChildren(/* with nothing */);
    return;
  }
  const rootAncestor = ancestors[0];
  const [instance] = key.split("/", 1); // a bit hacky
  ancestorsEl.replaceChildren(
    H("div.root-ancestor",
      renderToot(rootAncestor, instance, observeLinkConfig),
      H("div.more-ancestors",
        ancestors.length === 1 ? "↓" :
        `↓\u2003${ancestors.length - 1} more ancestor toot(s)`
      )
    )
  )
}

async function renderDetails(details: DetailEntry) {
  renderAncestors(details);
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
        descendantsEl.replaceChildren("Oops");
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

  document.title = `${overview.rootAuthor}: "${overview.teaser}"`;
  document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']")!.href =
    overview.rootAuthorAvatar ?? "";
  renderTreeHead(overview, instance, id);

  if (withDetails) {
    const details = await db.get("treeDetails", key);
    if (!details) {
      document.title = overview.rootAuthor ?? "Follow Toot";
      return;
    }
    await renderDetails(details);
  }
}

show(true);
