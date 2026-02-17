import { effect, type Signal, signal } from '@preact/signals-core';

import { deleteTree, fetchTree, updateSeen } from './actions';
import H, { renderInto, reRenderInto, type HParam } from './H';
import database, { type DetailEntry, type OverviewEntry } from './database';
import type { Notifications } from './Notifications';
import setupNotifications from './setupNotifications';
import url2key from './url2key';
import emojify from './emojify';
import RenderedToot from './RenderedToot';
import formatDate from './formatDate';
import versionId from './versionId';
import type { Account, Relationship, Status } from './mastodon-entities';
import { findCircular, findLastCircular } from './findCircular';
import { linkableFeatureKeys, linkableFeatures, linkConfigConfig, type LinkableFeature } from './linkConfigConfig';
import Registry from './Registry';
import { menuButtonWithKey } from './menuButton';

const registry = new Registry();

function regEffect(fn: () => void) {
  registry.register(effect(fn));
}

const db = await database;


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
    if (!await db.get("treeOverview", `${instance}/${id}`)) {
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


let overview: OverviewEntry | undefined;
let details: DetailEntry | undefined;
let allToots: Status[] = [];
const seenSignals = new Map<string, Signal<boolean>>();


async function markAllAsUnseen() {
  if (!overview) return;
  updateSeen({...overview, seenIds: new Set()});
}

async function markAllAsSeen() {
  if (!overview) return;
  if (!details) return;
  updateSeen({
    ...overview,
    seenIds: new Set(allToots.map(toot => versionId(toot))),
  });
}

type LinkConfig = Record<LinkableFeature, Record<string, boolean>>;

const linkConfigSig =
  signal<LinkConfig | undefined>(undefined, {name: "linkConfig"});

async function readLinkConfig() {
  linkConfigSig.value = (await db.get("config", "links")).value;
}

new BroadcastChannel("linkConfig").addEventListener("message", readLinkConfig);

readLinkConfig();


const tootMap = new Map<Status, RenderedToot>();
/** ordered according to the current display mode */
const toots = new Array<Status>();

function handleToot(toot: Status, prefix?: HTMLElement) {
  toots.push(toot);
  const rendered = tootMap.get(toot)!;
  rendered.headerPrefix = prefix;
  return rendered;
}

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
  const i = toots.findIndex(t => t === toot);
  if (i < 0) return;
  goToToot(toots[(i+1) % toots.length]);
}

function previousToot(toot: Status) {
  const n = toots.length;
  const i = toots.findIndex(t => t === toot);
  if (i < 0) return;
  goToToot(toots[(i-1 + n) % n]);
}

function nextUnseen(toot: Status) {
  goToToot(findCircular(
    toots,
    toot,
    t => !seenSignals.get(versionId(t))?.value,
  ));
}

function previousUnseen(toot: Status) {
  goToToot(findLastCircular(
    toots,
    toot,
    t => !seenSignals.get(versionId(t))?.value,
  ));
}

const menuItems = (toot: Status, el: RenderedToot): HParam => {
  const seenSig = seenSignals.get(versionId(toot))!;
  // No need to observe signals in an effect. (The menu is short-lived.)
  const seen = seenSig.value;
  const linkConfig = linkConfigSig.value;
  return [
    menuButtonWithKey(
      seen ? "☐ Mark toot as unseen" : "☑ Mark toot as seen",
      ["Space"],
      () => {
        seenSig.value = !seen;
        setTimeout(() => {
          el.scrollIntoView({
            // "start" would move it behind the sticky header
            block: "center",
            behavior: "smooth",
          });
          el.focus();
        }, 100);
      },
    ),
    menuButtonWithKey("Previous unseen toot", ["Ctrl", "⬅"], () => previousUnseen(toot)),
    menuButtonWithKey("Previous toot",        [        "⬅"], () => previousToot(toot)  ),
    menuButtonWithKey("Next toot",            [        "➡"], () => nextToot(toot)      ),
    menuButtonWithKey("Next unseen toot",     ["Ctrl", "➡"], () => nextUnseen(toot)    ),
    function*() {
      if (!linkConfig) return;
      for (const feature of linkableFeatureKeys) {
        const obj = linkConfig[feature];
        for (const k in obj) if (obj[k]) {
          const frontend = linkConfigConfig[k];
          const href = frontend.urlFunctions[feature](instance, toot);
          yield A_blank("button open-link", href,
            H("img.link-icon", {src: frontend.icon}),
            ` Open ${linkableFeatures[feature].toLowerCase()} on ${frontend.name(instance)}`,
          );
        }
      }
    },
    () => {
      const {root} = details!;
      const url = new URL(document.location.href);
      url.hash = new URLSearchParams({
        url: `https://${instance}/@${root.account.acct}/${root.id}`,
        focus: toot.id
      }).toString();
      return H("button.link-here", "Copy link", {
        onclick: () => window.navigator.clipboard.writeText(url.toString()),
      });
    },
  ];
}

const tootKeyHandler = (toot: Status, seenSig: Signal<boolean>) => (ev: KeyboardEvent) => {
  if (ev.shiftKey || ev.altKey || ev.metaKey) return;
  switch (ev.key) {
    case "ArrowRight":
      if (ev.ctrlKey) nextUnseen(toot);
      else nextToot(toot);
      break;
    case "ArrowLeft":
      if (ev.ctrlKey) previousUnseen(toot);
      else previousToot(toot);
      break;
    case " ":
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


type MissingStatus = {
  is_missing: true,
  id: string,
  in_reply_to_id: string,
  account: {id: string | null | undefined},
};

type Tree = {toot: Status | MissingStatus, children: Tree[]};

/** A thread with replies to the thread's toots.
 *
 * The replies are again grouped into threads.
 * 
 * Even toots that would not be considered parts of a thread are in a `Thread`,
 * namely one with a single element.
 */
type Thread = {toot: Status | MissingStatus, children: Thread[]}[];

function extractFirstHit<T>(a: T[], pred: (t: T) => boolean): {found?: T, rest: T[]} {
  const i = a.findIndex(pred);
  return i < 0 ? {rest: a} : {found: a[i], rest: a.toSpliced(i, 1)};
}

function extractThreads(tree: Tree): Thread {
  const accId = tree.toot.account.id;
  const thread: Thread = [];
  for (let subtree: Tree | undefined = tree; subtree;) {
    const {found, rest}: {found?: Tree, rest: Tree[]} =
      extractFirstHit(subtree.children, child => child.toot.account.id === accId);
    thread.push({toot: subtree.toot, children: rest.map(extractThreads)});
    subtree = found;
  }
  return thread;
}

function renderTootTree(): void {
  const {root, descendants} = details!;

  // Building a recursive datastructure without recursion:
  // - Create subtree nodes for each toot and index them by an auxiliary map.
  // - Then add reverse pointers to the `in_reply_to_id` pointers of toots.
  const id2subTree = new Map<string, Tree>([root, ...descendants].map(toot =>
    [toot.id, {toot, children: [] as Tree[]}]
  ));
  for (const toot of descendants) {
    const {in_reply_to_id, in_reply_to_account_id} = toot;
    if (!in_reply_to_id) {
      console.error("descendant without uplink:", toot);
      continue;
    }
    if (!id2subTree.has(in_reply_to_id)) {
      // `toot` references a missing (probably deleted) parent.
      // We add a placeholder here to complete the tree structure.
      const tree: Tree = {
        toot: {
          is_missing: true,
          id: in_reply_to_id,
          // We do not know the parent of the missing parent.
          // (We could fetch `toot`'s ancestors and search for the last
          // ancestor occurring in id2subTree.  But that's not worthwhile.)
          // So we just link it to the root:
          in_reply_to_id: root.id,
          account: {id: in_reply_to_account_id},
        },
        children: [],
      };
      id2subTree.get(root.id)!.children.push(tree);
      id2subTree.set(in_reply_to_id, tree);
    }
    id2subTree.get(in_reply_to_id)!.children.push(id2subTree.get(toot.id)!);
  }
  // ... but extracting threads is recursive:
  const tree = extractThreads(id2subTree.get(root.id)!);

  function* descend(thread: Thread): Generator<HTMLElement, void, void> {
    let i = 0;
    for (const {toot, children} of thread) {
      yield H("div.node",
        "is_missing" in toot ? missingToot() :
        handleToot(
          toot,
          thread.length === 1 ? undefined :
          H("span.thread-pos", `${++i}/${thread.length}`),
        ),
        function*() {
          if (children.length > 0) {
            yield H("ul", function*() {
              for (const child of children) {
                yield H("li", descend(child));
              }
            });
          }
        }
      );
    }
  }

  descendantsEl.classList.add("tree-root");
  descendantsEl.classList.add("chrono");
  reRenderInto(descendantsEl, descend(tree));
}

const missingToot = () =>
  H("div.missing-toot", "toot(s) missing/deleted/inaccessible");

function renderTootList() {
  const {root, descendants} = details!;
  reRenderInto(descendantsEl,
    [root, ...descendants].map(toot => H("div.node", handleToot(toot))),
  )
}

const displayTreeSig = signal<boolean>(true, {name: "display-tree"});

// TODO nicer treatment of children vs. attributes vs. event handlers

function fill<E extends HTMLElement>(selectors: string, ...content: HParam<E>[]) {
  renderInto(document.querySelector<E>(selectors)!, ...content);
}

function refill<E extends HTMLElement>(selectors: string, ...content: HParam<E>[]) {
  reRenderInto(document.querySelector<E>(selectors)!, ...content);
}

function renderTreeHead() {
  if (!overview) return;
  const {
    rootAuthor, rootAccountEmojis, rootAuthorAvatar, rootAcct,
    rootCreatedAt, lastCreatedAt, lastRetrievalDate,
    nToots, nUnseen,
  } = overview;
  refill("#tree-head-name", rootAuthor ? emojify(rootAuthor, rootAccountEmojis) : key);
  fill<HTMLImageElement>("#tree-head-avatar", { src: rootAuthorAvatar });
  refill("#tree-head-acct", rootAcct ? `@${rootAcct} on ${instance}` : "");
  refill("#tree-head-date-from", formatDate(rootCreatedAt));
  refill("#tree-head-date-to", formatDate(lastCreatedAt));
  refill("#tree-head-date-fetched", formatDate(lastRetrievalDate));
  refill("#n-toots", nToots?.toFixed() ?? "??");
  refill("#n-unseen", nUnseen?.toFixed() ?? "??");
  fill("#all-seen", {onclick: () => markAllAsSeen()});
  fill("#all-unseen", {onclick: () => markAllAsUnseen()});
  fill("#reload", {onclick: () => fetchTree(instance, id)});
  fill("#remove", {onclick: () => deleteTree(overview!)});
  fill("#display-tree", {"onchange": ev =>
    displayTreeSig.value = (ev.currentTarget as HTMLInputElement).checked
  });
}

function renderUnfollowed() {
  refill("#toot-id", id);
  refill("#toot-instance", instance);
  fill("#follow", {onclick: () => fetchTree(instance, id)});
  ancestorsEl.replaceChildren(/* with nothing */);
  descendantsEl.replaceChildren(/* with nothing */);
}

function renderAncestors() {
  regEffect(() => {
    reRenderInto(ancestorsEl,
      details!.ancestors.map((toot, i, array) => [
        H("div.node", handleToot(toot)),
        displayTreeSig.value
        && (array.at(i+1) ?? details!.root).in_reply_to_id !== toot.id
        ? H("div.node", missingToot())
        : undefined,
      ]),
    );
  });
}

type Stats = {n: number, account: Account, relationship?: Relationship};

/** Key of a `boolean` property in `Relationship` */
// See https://stackoverflow.com/questions/54520676/in-typescript-how-to-get-the-keys-of-an-object-type-whose-values-are-of-a-given#answer-54520829
// and https://www.typescriptlang.org/docs/handbook/2/mapped-types.html#mapping-modifiers
type RelationshipFlag = {
  [K in keyof Relationship]-?: Relationship[K] extends boolean ? K : never;
}[keyof Relationship];

const flagTexts: Record<RelationshipFlag, string> = {
  // Notice that some flag names are from your perspective whereas others are
  // from the perspective of the related account.
  // The texts try to clarify that by explicitly mentioning "you".
  following: "you follow",
  showing_reblogs: "you get boosts",
  notifying: "you get notified about toots",
  followed_by: "follows you",
  blocking: "you block",
  blocked_by: "blocks you",
  muting: "you mute",
  muting_notifications: "you mute notifications",
  requested: "you request to follow",
  requested_by: "requests to follow you",
  domain_blocking: "you block the domain",
  endorsed: "you endorse/feature",
};
const flagTextList = Object.entries(flagTexts) as [RelationshipFlag, string][];

function renderAccountStats({n, account, relationship}: Stats) {
  const out = H("span",
    {slot: "label"},
    {title: `${account.display_name} @${account.acct}`},
    H("img", {src: account.avatar_static}),
    n > 1 ? n.toString() : null,
  );
  if (relationship) {
    const flags =
      flagTextList
      .flatMap(([key, text]) => relationship[key] === true ? ["\n- " + text] : [])
      .join("");
    const note = relationship.note?.trim();
    if (flags) out.title += flags;
    if (note) out.title += "\n\n" + note;
    if (flags || note) {
      out.classList.add("indicate-relationship");
    };
  }
  return out;
}

const dialog = document.querySelector<HTMLDialogElement>("#account-list-dialog")!;
const dialogH = document.querySelector<HTMLDialogElement>("#account-list-heading")!;
const dialogG = document.querySelector<HTMLDialogElement>("#account-list-grid")!;
const dialogClose = document.querySelector<HTMLButtonElement>("#account-list-close")!;

dialogClose.onclick = () => dialog.close();

async function getJSON(url: string) {
  const entry = await db.get("accessTokens", instance);
  if (!entry) throw "no access token for " + instance;
  const response = await fetch(url, {headers: {Authorization: `Bearer ${entry.token}`}});
  if (!response.ok) throw `HTTPS status: ${response.status} ${response.statusText}`;
  return await response.json();
}

const showAccounts = (heading: string, urlSuffix: string) => async (toot: Status) => {
  const accounts: Account[] =
    await getJSON(`https://${instance}/api/v1/statuses/${toot.id}/${urlSuffix}`);
  dialogH.replaceChildren(heading);
  dialogG.replaceChildren(...accounts.flatMap(account => [
    H("img", {src: account.avatar}),
    H("span.reaction-author", emojify(account.display_name || account.acct, account.emojis)),
    H("span.reaction-acct", "@" + account.acct),
    // TODO number of followers, external links
  ])
  )
  dialog.showModal();
};

async function renderDetails() {
  const statsMap = new Map<string, Stats>();
  for (const toot of allToots) {
    const accountStats = statsMap.get(toot.account.acct);
    if (accountStats) {
      accountStats.n++;
    } else {
      statsMap.set(toot.account.acct, {n: 1, account: toot.account});
    }
  }
  const statsList = [...statsMap.values()];
  try {
    // TODO Move this to actions?  And should the data go through the database?
    const search = statsList.map(stat => `id[]=${encodeURIComponent(stat.account.id)}`).join("&");
    const relationships: Relationship[] = await getJSON(`https://${instance}/api/v1/accounts/relationships?${search}`);
    const statsById = new Map<string, Stats>(statsList.map(stats => [stats.account.id, stats]));
    for (const relationship of relationships) {
      const stats = statsById.get(relationship.id);
      if (!stats) {
        console.warn(`Unexpected: no stats for id "${relationship.id}"`);
        continue;
      }
      stats.relationship = relationship;
    }
  } catch (e) {
    console.warn("When retrieving relationships:", e);
    // otherwise ignore silently
  }
  statsList.sort((x, y) => y.n - x.n);
  refill("#n-users", statsList.length.toString());
  refill("#user-stats", statsList.map(renderAccountStats));

  registry.disposeAll();

  seenSignals.clear();
  for (const toot of allToots) {
    const vId = versionId(toot);
    const sig = signal<boolean>(overview?.seenIds.has(vId) ?? false);
    regEffect(() => {
      const value = sig.value ?? false;
      if (!overview) return;
      const {seenIds} = overview;
      // TODO Can we replace this manual identity check by making better use of
      // signals?
      if (seenIds.has(vId) === value) return;
      if (value) {
        seenIds.add(vId);
      } else {
        seenIds.delete(vId);
      }
      updateSeen(overview!);
    });
    seenSignals.set(vId, sig);
  }

  tootMap.clear();
  for (const toot of allToots) {
    const seenSig = seenSignals.get(versionId(toot))!;
    const tootEl = renderInto(new RenderedToot(toot), {
      contextMenuItemProvider: menuItems,
      dropDownMenuItemProvider: menuItems,
      onseenchange: ev => seenSig.value = ev.detail,
      onkeydown: tootKeyHandler(toot, seenSig),
      // Not sure if this is a good idea:
      ondblclick: () => seenSig.value = !seenSig.value,
      onshowboosts: showAccounts("Boosted By", "reblogged_by"),
      onshowfavs: showAccounts("Favorited By", "favourited_by"),
    });
    regEffect(() => { tootEl.seen = seenSig.value; });
    tootMap.set(toot, tootEl);
  }

  toots.length = 0;
  renderAncestors();

  regEffect(() => {
    toots.length = details!.ancestors.length;

    const displayTree = displayTreeSig.value;
    if (displayTree) {
      tootTreeEl.classList.add("tree");
      renderTootTree();
    } else {
      tootTreeEl.classList.remove("tree");
      renderTootList();
    }
  });

  goToToot(details?.root);
}

async function show(withDetails: boolean) {
  overview = await db.get("treeOverview", key);
  fill("#app", {hidden: !overview});
  fill("#not-following", {hidden: Boolean(overview)});
  if (!overview) {
    renderUnfollowed();
    return;
  }

  document.title = `${overview.rootAuthor}: "${overview.teaser}"`;
  document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']")!.href =
    overview.rootAuthorAvatar ?? "";
  renderTreeHead();

  if (!withDetails) {
    if (!details) return;
    const {seenIds} = overview!;
    for (const toot of allToots) {
      const vId = versionId(toot);
      const sig = seenSignals.get(vId);
      if (sig) {
        sig.value = seenIds.has(vId);
      } else {
        // We should never come here:  We have unchanged details/allToots and
        // seenSignals should already cover these toots.
        console.warn(`Misssing "seen" signal for toot ${vId}`);
      }
    }
  } else {
    details = await db.get("treeDetails", key);
    if (!details) {
      document.title = overview.rootAuthor ?? "Follow Toot";
      return;
    }
    const {ancestors, root, descendants} = details!;
    allToots = [...ancestors, root, ...descendants];

    await renderDetails();
  }
}

show(true);
