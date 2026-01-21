import { effect, Signal, signal } from '@preact/signals-core';

import { deleteTree, fetchTree, updateSeen } from './actions';
import H, { renderInto, reRenderInto, type HParam } from './H';
import database, { type DetailEntry, type OverviewEntry } from './database';
import type { Notifications } from './Notifications';
import setupNotifications from './setupNotifications';
import url2key from './url2key';
import emojify from './emojify';
import renderToot, { type TootRenderingParams } from './renderToot';
import formatDate from './formatDate';
import versionId from './versionId';
import type { Account, Status } from './mastodon-entities';
import { findCircular, findLastCircular } from './findCircular';
import { linkableFeatures, linkConfigConfig, type LinkableFeature } from './linkConfigConfig';

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
const instance = params.get("instance")!;
const id = params.get("id")!;
const key = `${instance}/${id}`;

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

type LinkConfig = Record<LinkableFeature, Record<string, boolean>>;

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


const allToots = new Array<Status>();
const tootMap = new Map<Status, HTMLElement>();

function goToToot(toot?: Status) {
  if (!toot) return;
  const to = tootMap.get(toot);
  if (!to) return;
  to.focus({preventScroll: true});
  to.scrollIntoView({
    block: "center",
    behavior: "smooth",
  });
}

function nextToot(toot: Status) {
  const i = allToots.findIndex(t => t === toot);
  if (i < 0) return;
  goToToot(allToots[(i+1) % allToots.length]);
}

function previousToot(toot: Status) {
  const n = allToots.length;
  const i = allToots.findIndex(t => t === toot);
  if (i < 0) return;
  goToToot(allToots[(i-1 + n) % n]);
}

function nextUnseen(toot: Status) {
  goToToot(findCircular(
    allToots,
    toot,
    t => !seenIdsSignal.value?.has(versionId(t)),
  ))
}

function previousUnseen(toot: Status) {
  goToToot(findLastCircular(
    allToots,
    toot,
    t => !seenIdsSignal.value?.has(versionId(t)),
  ))
}

// The extra `() =>` makes this return a factory function.
// This is needed because we need two copies of the menu items:
// in the burger menu and in the context menu.
const menuItems = (toot: Status): HParam => () => [
  H("button", "Previous unseen toot (Ctrl ⬆️)", {onclick() { previousUnseen(toot); }}),
  H("button", "Previous toot (⬆️)"            , {onclick() { previousToot(toot);   }}),
  H("button", "Next toot (⬇️)"                , {onclick() { nextToot(toot)        }}),
  H("button", "Next unseen toot (Ctrl ⬇️)"    , {onclick() { nextUnseen(toot)      }}),
  H("div.contents",
    el => {
      effect(() => {
        reRenderInto(el, function*() {
          const linkConfig = linkConfigSig.value;
          if (!linkConfig) return;
          for (const feature of ["status", "profile"] as const) {
            const obj = linkConfig[feature];
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
        });
      })
    },
  ),
  // Omit this menu item if this toot is already the root?
  H("button.follow-toot",
    {onclick: () => {
      const url = new URL("./tree.html", document.location.href);
      url.hash = new URLSearchParams({url: `https://${instance}/@${toot.account.acct}/${toot.id}`}).toString();
      window.open(url);
    }},
    "Follow toot",
  ),
  H("button",
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
  ),
];


const tootKeyHandler = (toot: Status, seenSig: Signal<boolean | undefined>) => (ev: KeyboardEvent) => {
  if (ev.shiftKey) return;
  switch (ev.key) {
    case "ArrowRight":
      if (ev.ctrlKey) nextUnseen(toot);
      else nextToot(toot);
      break;
    case "ArrowLeft":
      if (ev.ctrlKey) previousUnseen(toot);
      else previousToot(toot);
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

function handleToot(toot: Status, params: TootRenderingParams): HTMLElement {
  const tootEl = renderToot(toot, params);
  allToots.push(toot);
  tootMap.set(toot, tootEl);
  return tootEl;
}


type Tree = {toot: Status, children: Tree[]};

/** A thread with replies to the thread's toots.
 *
 * The replies are again grouped into threads.
 * 
 * Even toots that would not be considered parts of a thread are in a `Thread`,
 * namely one with a single element.
 */
type Thread = {toot: Status, children: Thread[]}[];

function extractFirstHit<T>(a: T[], pred: (t: T) => boolean): {found?: T, rest: T[]} {
  const i = a.findIndex(pred);
  return i < 0 ? {rest: a} : {found: a[i], rest: a.toSpliced(i, 1)};
}

function extractThreads(st: Tree): Thread {
  const accId = st.toot.account.id;
  const thread: Thread = [];
  for (let t: Tree | undefined = st; t;) {
    const {found, rest}: {found?: Tree, rest: Tree[]} =
      extractFirstHit(t.children, child => child.toot.account.id === accId);
    thread.push({toot: t.toot, children: rest.map(extractThreads)});
    t = found;
  }
  return thread;
}

function renderTootTree(details: DetailEntry, seenIdSignals: SeenIdSignals): void {
  const {root, descendants} = details;

  // Building a recursive datastructure without recursion:
  // - Create subtree nodes for each toot and index them by an auxiliary map.
  // - Then add reverse pointers to the `in_reply_to_id` pointers of toots.
  const id2subTree = new Map<string, Tree>([root, ...descendants].map(toot =>
    [toot.id, {toot, children: [] as Tree[]}]
  ));
  for (const toot of descendants) {
    id2subTree.get(toot.in_reply_to_id!)?.children.push(id2subTree.get(toot.id)!);
  }
  // ... but extracting threads is recursive:
  const tree = extractThreads(id2subTree.get(root.id)!);

  function descend(thread: Thread, bridge: boolean): HTMLElement[] {
    return thread.map(({toot, children}, i) => {
      const seenSig = seenIdSignals.get(versionId(toot))!;
      return H("li",
        el => {
          el.classList.add(i === 0 ? "uplink-child" : "uplink-thread");
          el.classList.add(bridge ? "bridge" : "no-bridge");
        },
        handleToot(toot, {
          keyHandler: tootKeyHandler(toot, seenSig),
          seenSig,
          contextMenuSig,
          prefix:
            thread.length === 1 ? undefined :
            H("span.thread-pos", `${i+1}/${thread.length}`),
          menuItems: menuItems(toot),
        }),
        children.length === 0 ? null : H("ul.toot-list",
          children.map((childThread, j) =>
            descend(childThread, i < thread.length - 1 || j < children.length - 1)
          ),
        ),
      );
    });
  }

  const topLIs = descend(tree, false);
  const rootLI = topLIs[0];
  rootLI.classList.remove("uplink-child");
  if (details.ancestors.length > 0) {
    rootLI.classList.add("uplink-ancestors");
  }
  reRenderInto(descendantsEl, H("ul.toot-list", topLIs));
}

function renderTootList(
  details: DetailEntry,
  seenIdSignals: SeenIdSignals,
) {
  const {root, descendants} = details;
  reRenderInto(descendantsEl,
    H("ul.toot-list",
      [root, ...descendants].map(toot => {
        const seenSig = seenIdSignals.get(versionId(toot))!;
        return H("li",
          handleToot(toot, {
            keyHandler: tootKeyHandler(toot, seenSig),
            seenSig,
            contextMenuSig,
            menuItems: menuItems(toot),
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
  reRenderInto(ancestorsEl,
    H("ul.toot-list",
      details.ancestors.map(toot => {
        const seenSig = seenIdSignals.get(versionId(toot))!;
        return H("li",
          handleToot(toot, {
            keyHandler: tootKeyHandler(toot, seenSig),
            seenSig,
            contextMenuSig,
            menuItems: menuItems(toot),
          })
        );
      }),
    ),
  );
}

type SeenIdSignals = Map<string, Signal<boolean | undefined>>;

async function renderDetails(details: DetailEntry) {
  allToots.length = 0;
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

  goToToot(root);
}

async function show(withDetails: boolean) {
  await setSeenIdsSignal();
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
