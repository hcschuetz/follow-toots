import { effect, Signal, signal } from '@preact/signals-core';

import { deleteTree, fetchTree, updateSeen } from './actions';
import H, { renderInto, reRenderInto, type HParam } from './H';
import database, { type DetailEntry, type OverviewEntry, type SubTree } from './database';
import type { Notifications } from './Notifications';
import setupNotifications from './setupNotifications';
import url2key from './url2key';
import emojify from './emojify';
import renderToot, { type LinkConfig } from './renderToot';
import formatDate from './formatDate';
import versionId from './versionId';

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

const seenIdsSignal = signal<Set<string> | undefined>(undefined, {name: "seenIds"});

async function setSeenIdsSignal() {
  seenIdsSignal.value = (await db.get("treeOverview", key))?.seenIds;
}

const ancestorsEl = document.querySelector<HTMLElement>("#ancestors")!;
const descendantsEl = document.querySelector<HTMLElement>("#descendants")!;

async function markAllAsUnseen() {
  const overview = await db.get("treeOverview", key);
  if (!overview) return;
  overview.seenIds.clear();
  updateSeen(overview);
}

async function markAllAsSeen() {
  const overview = await db.get("treeOverview", key);
  if (!overview) return;
  const details = await db.get("treeDetails", key);
  if (!details) return;
  const {ancestors, root, descendants} = details;
  const {seenIds} = overview;
  [...ancestors, root, ...descendants].forEach(toot => seenIds.add(versionId(toot)));
  updateSeen(overview);
}

const toggleSeen = (tootId: string, rootKey: string) => async () => {
  const overview = await db.get("treeOverview", rootKey);
  if (!overview) return;
  const {seenIds} = overview;
  if (seenIds.has(tootId)) {
    seenIds.delete(tootId);
  } else {
    seenIds.add(tootId);
  }
  updateSeen(overview);
};

const linkConfigSig =
  signal<LinkConfig | undefined>(undefined, {name: "linkConfig"});

async function readLinkConfig() {
  linkConfigSig.value = (await db.get("config", "links")).value;
}

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

function renderTootTree(details: DetailEntry, seenIdSignals: SeenIdSignals): void {
  const {key, root, descendants} = details;

  // Building a recursive datastructure without recursion:
  // - Create subtree nodes for each toot and index them by an auxiliary map.
  // - Then add reverse pointers to the `in_reply_to_id` pointers of toots.
  const id2subTree = new Map([root, ...descendants].map(toot =>
    [toot.id, {toot, children: [] as SubTree[]}]
  ));
  for (const toot of descendants) {
    id2subTree.get(toot.in_reply_to_id!)?.children.push(id2subTree.get(toot.id)!);
  }
  const tootTree = id2subTree.get(root.id)!;

  function* descend({toot, children}: SubTree, prevThreadPos = 0):
    Generator<HTMLElement, void, unknown>
  {
    // If one of the replies to this toot is by the same account,
    // we have a starting or continued thread.
    const selfReply =
      children.find(child => child.toot.account.id === toot.account.id);
    children = children.filter(child => child !== selfReply);
    const threadPos = prevThreadPos + 1;
    const threadPosMarker =
      prevThreadPos > 0 || selfReply ? H("span.thread-pos", `#${threadPos}`) :
      undefined;
    const [instance] = key.split("/", 1); // a bit hacky
    yield H("li",
      renderToot(
        toot, instance,
        linkConfigSig,
        toggleSeen(versionId(toot), key),
        seenIdSignals.get(versionId(toot))!,
        threadPosMarker,
      ),
      children.length === 0 ? null : H("ul.toot-list",
        children.map(child => descend(child)),
        renderChildrenMismatch(children.length + (selfReply ? 1 : 0) - toot.replies_count),
      ),
    );
    if (selfReply) {
      yield* descend(selfReply, threadPos);
    }
  }

  reRenderInto(descendantsEl, H("ul.toot-list", descend(tootTree)));
}

function renderTootList(
  details: DetailEntry,
  seenIdSignals: SeenIdSignals,
) {
  const {key, root, descendants} = details;
  const [instance] = key.split("/", 1); // a bit hacky
  reRenderInto(descendantsEl,
    H("ul.toot-list",
      [root, ...descendants].map(toot =>
        H("li",
          renderToot(
            toot, instance,
            linkConfigSig,
            toggleSeen(versionId(toot), key),
            seenIdSignals.get(versionId(toot))!,
          ),
        ),
      ),
    ),
  )
}

const displayModes = ["hierarchical", "chronological"] as const;
type DisplayMode = (typeof displayModes)[number]
const displayModeSig = signal<DisplayMode>("hierarchical", {name: "displayMode"});

// TODO nicer treatment of children vs. attributes vs. event handlers

function fill<E extends HTMLElement>(selectors: string, ...content: HParam<E>[]) {
  renderInto(document.querySelector<E>(selectors)!, ...content);
}

function refill<E extends HTMLElement>(selectors: string, ...content: HParam<E>[]) {
  reRenderInto(document.querySelector<E>(selectors)!, ...content);
}

function renderTreeHead(overview: OverviewEntry, instance: string, id: string) {
  const {rootAuthor, rootAccountEmojis} = overview;
  refill("#tree-head-name", rootAuthor ? emojify(rootAuthor, rootAccountEmojis) : key);
  fill<HTMLImageElement>("#tree-head-avatar", { src: overview.rootAuthorAvatar });
  refill("#tree-head-acct", overview.rootAcct ? `@${overview.rootAcct} on ${instance}` : "");
  refill("#tree-head-date-from", formatDate(overview.rootCreatedAt));
  refill("#tree-head-date-to", formatDate(overview.lastCreatedAt));
  refill("#tree-head-date-fetched", formatDate(overview.lastRetrievalDate));
  refill("#n-toots", overview.nToots?.toFixed() ?? "??");
  refill("#n-unseen", overview.nUnseen?.toFixed() ?? "??");
  fill("#all-seen", {"onclick": () => markAllAsSeen()});
  fill("#all-unseen", {"onclick": () => markAllAsUnseen()});
  fill("#reload", {"onclick": () => fetchTree(instance, id)});
  fill("#remove", {"onclick": () => overview && deleteTree(overview)});
  fill("#display-mode", {"onchange": ev =>
    displayModeSig.value = (ev.currentTarget as HTMLSelectElement).value as DisplayMode
  });
}

function renderUnfollowed(instance: string, id: string) {
  refill("#toot-id", id);
  refill("#toot-instance", instance);
  fill("#follow", {"onclick": () => fetchTree(instance, id)});
  ancestorsEl.replaceChildren(/* with nothing */);
  descendantsEl.replaceChildren(/* with nothing */);
}

function renderAncestors(details: DetailEntry, seenIdSignals: SeenIdSignals) {
  const [instance] = key.split("/", 1); // a bit hacky
  reRenderInto(ancestorsEl,
    H("ul.toot-list",
      details.ancestors.map(toot => H("li",
        renderToot(
          toot, instance, linkConfigSig,
          toggleSeen(versionId(toot), key),
          seenIdSignals.get(versionId(toot))!,
        )
      )),
    ),
  );
}

type SeenIdSignals = Map<string, Signal<boolean | undefined>>;

async function renderDetails(details: DetailEntry) {
  const {ancestors, root, descendants} = details;
  const seenIdSignals: SeenIdSignals =
    new Map([...ancestors, root, ...descendants].map(toot =>
      [versionId(toot), signal<boolean>()]
    ));
  effect(() => {
    for (const [id, sig] of seenIdSignals) {
      sig.value = seenIdsSignal.value?.has(id);
    }
  });

  renderAncestors(details, seenIdSignals);
  effect(() => {
    switch (displayModeSig.value) {
      case "hierarchical": {
        renderTootTree(details, seenIdSignals);
        break;
      }
      case "chronological": {
        renderTootList(details, seenIdSignals);
        break;
      }
      default: {
        descendantsEl.replaceChildren("Oops");
        break;
      }
    }
  });
}

async function show(withDetails: boolean) {
  await setSeenIdsSignal();
  const [instance, id] = key.split("/"); // particularly hacky (what if an id contains a "/"?)
  const overview = await db.get("treeOverview", key);
  fill("#app", {hidden: !overview});
  fill("#not-following", {hidden: Boolean(overview)});
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
