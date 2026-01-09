import { effect, Signal, signal } from '@preact/signals-core';

import { deleteTree, fetchTree, updateClosed } from './actions';
import H, { reRenderInto } from './H';
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

const closedIdsSignal = signal<Set<string> | undefined>(undefined, {name: "closedIds"});

async function setClosedIdsSignal() {
  closedIdsSignal.value = (await db.get("treeOverview", key))?.closedIds;
}

const appEl = document.querySelector<HTMLElement>("#app")!;
const ancestorsEl = document.querySelector<HTMLElement>("#ancestors")!;
const descendantsEl = document.querySelector<HTMLElement>("#descendants")!;

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

function renderTootTree(details: DetailEntry, closedIdSignals: ClosedIdSignals): void {
  const {key, root, descendants} = details;

  // A recursive datastructure is built without recursion:
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
    yield renderToot(
      toot, instance,
      linkConfigSig,
      toggleClosed(versionId(toot), key),
      closedIdSignals.get(versionId(toot)),
      threadPosMarker,
    );
    if (children.length) {
      const ul = H("ul.tree-node",
        children.map(subtree => H("li", descend(subtree))),
        renderChildrenMismatch(children.length + (selfReply ? 1 : 0) - toot.replies_count),
      );
      yield (
        // nTotalReplies === 1 ? ul :
        H("details.replies", {open: true},
          H("summary",
            {"@keydown": navigate},
            el => {
              effect(() => {
                function countDescendants(children: SubTree[], openOnly: boolean) {
                  const recur = (children: SubTree[]): number =>
                    children.reduce(
                      (acc, {toot, children}) =>
                        acc +
                        Number(!(openOnly && closedIdSignals.get(versionId(toot))?.value)) +
                        recur(children),
                      0
                    );
                  return recur(children);
                }

                const nTotalReplies = countDescendants(children, false);
                const nReReplies = nTotalReplies - children.length;
                const nOpen = countDescendants(children, true);
                el.textContent = `${
                  nTotalReplies} replies (${
                  children.length} direct, ${
                  nReReplies} indirect), ${
                  nOpen} open${
                  selfReply ? "; thread continued" : ""}`;
              });
            }
          ),
          ul,
        )
      );
    }
    if (selfReply) {
      yield* descend(selfReply, threadPos);
    }
  }

  reRenderInto(descendantsEl, descend(tootTree));
}

function visibleSummaries(): HTMLElement[] {
  const hiddenSummaries =
    new Set(descendantsEl.querySelectorAll(
      "details.replies:not(:open) details.replies > summary"
    ));
  return (
    [...descendantsEl.querySelectorAll<HTMLElement>("details.replies > summary")]
    .filter(el => !hiddenSummaries.has(el))
  );
}

function navigate(ev: KeyboardEvent) {
  const summary = ev.currentTarget as HTMLElement;
  const details = summary.closest("details")!;
  let goal: HTMLElement | null | undefined;
  switch (ev.key) {
    case "ArrowUp": {
      const summaries = visibleSummaries();
      const pos = summaries.findIndex(s => s === summary);
      if (pos >= 0) {
        goal = summaries[pos - 1];
      }
      break;
    }
    case "ArrowDown": {
      const summaries = visibleSummaries();
      const pos = summaries.findIndex(s => s === summary);
      if (pos >= 0) {
        goal = summaries[pos + 1];
      }
      break;
    }
    case "ArrowLeft": {
      if (details.open) {
        details.open = false;
        goal = summary;
      } else {
        goal =
          details
          .parentElement
          ?.closest("details")
          ?.querySelector<HTMLElement>("& > summary");
      }
      break;
    }
    case "ArrowRight": {
      if (details.open) {
        goal = details.querySelector<HTMLElement>("& details.replies > summary");
      } else {
        details.open = true;
        goal = summary;
      }
      break;
    }
    default: return;
  }
  if (goal) {
    goal.focus({preventScroll: true});
    goal.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }
}

function renderTootList(
  details: DetailEntry,
  closedIdSignals: ClosedIdSignals,
  restricted: boolean,
) {
  const {key, root, descendants} = details;
  const [instance] = key.split("/", 1); // a bit hacky
  reRenderInto(descendantsEl,
    H("ul.toot-list",
      [root, ...descendants].map((toot, i) =>
        H("div.contents",
          el => {
            effect(() => {
              el.replaceChildren(
                ...(
                  i > 0 && restricted &&
                  closedIdSignals.get(versionId(toot))?.value
                ) ? [] : [
                  H("li",
                    renderToot(
                      toot, instance,
                      linkConfigSig,
                      toggleClosed(versionId(toot), key),
                      closedIdSignals.get(versionId(toot)),
                    ),
                  )
                ]
              )
            })
          }
        )
      ),
    ),
  )
}

const displayModes = ["hierarchical", "chronological", "root + open"] as const;
type DisplayMode = (typeof displayModes)[number]
const displayModeSig = signal<DisplayMode>("hierarchical", {name: "displayMode"});

const explainMismatch =
`Possible reasons for a mismatch between expected and actual number of toots:
- Without authentication Mastodon reports at most 60 descendants.
- Some toots might be non-public.
- Replies or reply counts might not yet be propagated to your instance.
- ...`;

function renderTreeHead(overview: OverviewEntry, instance: string, id: string) {
  const {rootAuthor, rootAccountEmojis} = overview;
  reRenderInto(appEl,
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
      displayModes.map(mode => H("label",
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
  reRenderInto(appEl,
    H("div", `You are currently not following toot ${id} from ${instance}. `),
    H("div",
      H("button", {
        textContent: "Follow",
        "@click": () => fetchTree(instance, id),
      }),
      " it or close this tab.",
    ),
  );
  ancestorsEl.replaceChildren(/* with nothing */);
  descendantsEl.replaceChildren(/* with nothing */);
}

function renderAncestors(details: DetailEntry) {
  const ancestors = details.ancestors;
  if (ancestors.length === 0) {
    ancestorsEl.replaceChildren(/* with nothing */);
    return;
  }
  const rootAncestor = ancestors[0];
  const [instance] = key.split("/", 1); // a bit hacky
  reRenderInto(ancestorsEl,
    H("div.root-ancestor",
      renderToot(rootAncestor, instance, linkConfigSig),
      H("div.more-ancestors",
        ancestors.length === 1 ? "↓" :
        `↓\u2003${ancestors.length - 1} more ancestor toot(s)`
      )
    )
  )
}

type ClosedIdSignals = Map<string, Signal<boolean | undefined>>;

async function renderDetails(details: DetailEntry) {
  const closedIdSignals: ClosedIdSignals =
    new Map([details.root, ...details.descendants].map(toot =>
      [versionId(toot), signal<boolean>()]
    ));
  effect(() => {
    for (const [id, sig] of closedIdSignals) {
      sig.value = closedIdsSignal.value?.has(id);
    }
  });

  renderAncestors(details);
  effect(() => {
    switch (displayModeSig.value) {
      case "hierarchical": {
        renderTootTree(details, closedIdSignals);
        break;
      }
      case "chronological": {
        renderTootList(details, closedIdSignals, false);
        break;
      }
      case "root + open": {
        renderTootList(details, closedIdSignals, true);
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
