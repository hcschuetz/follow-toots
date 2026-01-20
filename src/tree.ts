import { effect, Signal, signal } from '@preact/signals-core';

import { deleteTree, fetchTree, updateSeen } from './actions';
import H, { renderInto, reRenderInto, type HParam } from './H';
import database, { type DetailEntry, type OverviewEntry, type SubTree } from './database';
import type { Notifications } from './Notifications';
import setupNotifications from './setupNotifications';
import url2key from './url2key';
import emojify from './emojify';
import renderToot, { type LinkConfig, type TootRenderingParams } from './renderToot';
import formatDate from './formatDate';
import versionId from './versionId';
import type { Account, Status } from './mastodon-entities';
import { findCircular, findLastCircular } from './findCircular';

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

async function setSeen(tootId: string, rootKey: string, value: boolean) {
  const overview = await db.get("treeOverview", rootKey);
  if (!overview) return;
  const {seenIds} = overview;
  if (value) {
    seenIds.add(tootId);
  } else {
    seenIds.delete(tootId);
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


const contextMenuEl = document.querySelector<HTMLSelectElement>("#context-menu")!;
const contextMenuSig = signal<"standard" | "custom">("custom");
effect(() => {
  contextMenuEl.value = contextMenuSig.value;
});
function updateContextMenu() {
  contextMenuSig.value = contextMenuEl.value as "standard" | "custom";
}
contextMenuEl.addEventListener("change", updateContextMenu);
updateContextMenu();

function goToToot(to?: HTMLElement) {
  if (!to) return;
  to.focus({preventScroll: true});
  to.scrollIntoView({
    block: "center",
    behavior: "smooth",
  });
}

function nextToot(getTootEl: () => HTMLElement) {
  const allToots = [...document.querySelectorAll<HTMLElement>(".toot")];
  const i = allToots.findIndex(t => t === getTootEl());
  if (i < 0) return;
  goToToot(allToots[(i+1) % allToots.length]);
}

function previousToot(getTootEl: () => HTMLElement) {
  const allToots = [...document.querySelectorAll<HTMLElement>(".toot")];
  const n = allToots.length;
  const i = allToots.findIndex(t => t === getTootEl());
  if (i < 0) return;
  goToToot(allToots[(i-1 + n) % n]);
}

function nextUnseen(getTootEl: () => HTMLElement) {
  goToToot(findCircular(
    document.querySelectorAll<HTMLElement>(".toot"),
    getTootEl(),
    el => el.querySelector<HTMLElement>("input.seen:not(:checked)"),
  ))
}

function previousUnseen(getTootEl: () => HTMLElement) {
  goToToot(findLastCircular(
    document.querySelectorAll<HTMLElement>(".toot"),
    getTootEl(),
    el => el.querySelector<HTMLElement>("input.seen:not(:checked)"),
  ))
}

// We have to use a "provider function" getTootEl because we need the
// extraMenuItems for rendering the toot, that is, at a time where the rendered
// toot element does not yet exist.
const extraMenuItems = (getTootEl: () => HTMLElement): HParam<HTMLElement> | undefined => [
  H("button", "Previous unseen toot (Ctrl ⬆️)", {onclick() { previousUnseen(getTootEl); }}),
  H("button", "Previous toot (⬆️)"            , {onclick() { previousUnseen(getTootEl); }}),
  H("button", "Next toot (⬇️)"                , {onclick() { nextUnseen(getTootEl)      }}),
  H("button", "Next unseen toot (Ctrl ⬇️)"    , {onclick() { nextUnseen(getTootEl)      }}),
];

const tootKeyHandler =
  (seenSig: Signal<boolean | undefined>) =>
  (getTootEl: () => HTMLElement) =>
  (ev: KeyboardEvent) =>
{
  if (ev.shiftKey) return;
  switch (ev.key) {
    case "ArrowRight":
      if (ev.ctrlKey) nextUnseen(getTootEl);
      else nextToot(getTootEl);
      break;
    case "ArrowLeft":
      if (ev.ctrlKey) previousUnseen(getTootEl);
      else previousToot(getTootEl);
      break;
    case "Enter":
      seenSig.value = !seenSig.value;
      break;
    default: return;
  }
  ev.preventDefault();
  ev.stopImmediatePropagation();
}


const tootTreeEl = document.querySelector<HTMLElement>("#toot-tree")!;
const ancestorsEl = document.querySelector<HTMLElement>("#ancestors")!;
const descendantsEl = document.querySelector<HTMLElement>("#descendants")!;

const tootMap = new Map<Status, HTMLElement>();

function handleToot(toot: Status, params: TootRenderingParams): HTMLElement {
  const tootEl = renderToot(toot, params);
  tootMap.set(toot, tootEl);
  return tootEl;
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

  function* descend(
    {toot, children}: SubTree,
    uplink: "child" | "thread" | "ancestors" | null,
    bridge: boolean,
    prevThreadPos: number,
  ): Generator<HTMLElement, void, unknown> {
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
    const seenSig = seenIdSignals.get(versionId(toot))!;
    yield H("li",
      el => {
        if (uplink) el.classList.add(`uplink-${uplink}`);
        el.classList.add(bridge ? "bridge" : "no-bridge");
      },
      handleToot(toot, {
        instance,
        keyHandler: tootKeyHandler(seenSig),
        linkConfigSig,
        seenSig,
        contextMenuSig,
        prefix: threadPosMarker,
        extraMenuItems,
      }),
      children.length === 0 ? null : H("ul.toot-list",
        children.map((child, i) => {
          // Do we need to "bridge" the edge from the parent to a later sibling
          // or a thread continuation?
          const bridge = i < children.length - 1 || Boolean(selfReply);
          return descend(child, "child", bridge, 0);
        }),
      ),
    );
    if (selfReply) {
      yield* descend(selfReply, "thread", bridge, threadPos);
    }
  }

  reRenderInto(descendantsEl, H("ul.toot-list",
    descend(tootTree, details.ancestors.length > 0 ? "ancestors" : null, false, 0),
  ));
}

function renderTootList(
  details: DetailEntry,
  seenIdSignals: SeenIdSignals,
) {
  const {key, root, descendants} = details;
  const [instance] = key.split("/", 1); // a bit hacky
  reRenderInto(descendantsEl,
    H("ul.toot-list",
      [root, ...descendants].map(toot => {
        const seenSig = seenIdSignals.get(versionId(toot))!;
        return H("li",
          handleToot(toot, {
            instance,
            keyHandler: tootKeyHandler(seenSig),
            linkConfigSig,
            seenSig,
            contextMenuSig,
            extraMenuItems,
          }),
        );
      }),
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
      details.ancestors.map(toot => {
        const seenSig = seenIdSignals.get(versionId(toot))!;
        return H("li",
          handleToot(toot, {
            instance,
            keyHandler: tootKeyHandler(seenSig),
            linkConfigSig,
            seenSig,
            contextMenuSig,
            extraMenuItems,
          })
        );
      }),
    ),
  );
}

type SeenIdSignals = Map<string, Signal<boolean | undefined>>;

async function renderDetails(details: DetailEntry) {
  tootMap.clear();

  const {ancestors, root, descendants} = details;

  const statsMap = new Map<string, {n: number, account: Account}>();
  for (const toot of [...ancestors, root, ...descendants]) {
    const accountStats = statsMap.get(toot.account.acct);
    if (accountStats) {
      accountStats.n++;
    } else {
      statsMap.set(toot.account.acct, {n: 1, account: toot.account});
    }
  }
  const statsList = [...statsMap.values()];
  statsList.sort((x, y) => y.n - x.n);
  refill("#n-users", statsList.length.toString());
  refill("#user-stats", statsList.map(({n, account}) =>
    H("span",
      H("img", {
        src: account.avatar_static,
        title: `${account.display_name} @${account.acct}`,
      }),
      n > 1 ? n.toString() : null,
    )
  ));

  const seenIdSignals: SeenIdSignals =
    new Map([...ancestors, root, ...descendants].map(toot =>
      [versionId(toot), signal<boolean>()]
    ));
  effect(() => {
    for (const [id, sig] of seenIdSignals) {
      sig.value = seenIdsSignal.value?.has(id);
    }
  });
  for (const [vId, sig] of seenIdSignals) {
    effect(() => {
      setSeen(vId, key, sig.value ?? false);
    });
  }

  renderAncestors(details, seenIdSignals);
  effect(() => {
    const displayMode = displayModeSig.value;
    tootTreeEl.classList.remove(...displayModes);
    tootTreeEl.classList.add(displayMode);
    switch (displayMode) {
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

  goToToot(tootMap.get(root));
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
