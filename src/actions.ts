import asgn from "./asgn";
import database, { type OverviewEntry, type SubTree } from "./database";
import type { Context, Status } from "./mastodon-entities";
import type { Notifications } from "./Notifications";
import sanitize from "./sanitize";
import setupNotifications from "./setupNotifications";
import versionId from "./versionId";

const db = await database;

const notify = setupNotifications<Notifications>("followToots", {
  async updatedTreeOverview(key) {
    console.log("overview", await db.get("treeOverview", key));
  },

  async updatedTree(key) {
    console.log("data", await db.get("treeDetails", key));
  },

  async deletedTree(key) {
    console.log("deleted", key);
  },

  cleared() {
    console.log("cleared");
  }
});

export
async function fetchTree(instance: string, id: string) {
  try {
    const key = `${instance}/${id}`;

    const statusURL = `https://${instance}/api/v1/statuses/${id}`;
    const contextURL = statusURL + "/context";

    // TODO more specific questions depending on the HTTP status code.
    const questions = `

* Does the instance "${instance}"
  have a toot with id "${id}"?
* Is that toot public or accessible with
  an access token you have provided for
  ${instance}?
* And of course: Is there network connectivity
  between you and ${instance}?
`;

    {
      const {store} = db.transaction("treeOverview", "readwrite");
      await store.put(
        asgn(await store.get(key) ?? {closedIds: new Set()} as OverviewEntry, {
          key, instance, id,
          lastRequestDate: new Date(),
        }),
      );
    }
    notify.updatedTreeOverview(key);

    const options: RequestInit = {};
    const token = (await db.get("accessTokens", instance))?.token;
    if (token !== undefined) {
      options.headers = {Authorization: `Bearer ${token}`};
    } 

    // TODO add cache-control headers to reduce load on the servers?
    const rootResponse = await fetch(statusURL, options);
    if (!rootResponse.ok) {
      alert(`Could not fetch toot ${id} from ${instance
      } (HTTP status code ${rootResponse.status}).${questions}`);
      throw `Could not fetch toot ${id} from ${instance}.`;
    }
    const root: Status = await rootResponse.json();

    const contextResponse = await fetch(contextURL, options);
    if (!contextResponse.ok) {
      alert(`Could not fetch context (replies) for toot ${id} from ${instance
      } (HTTP status code ${rootResponse.status}).${questions}`);
      throw `Could not fetch context (replies) for toot ${id} from ${instance}.`;
    }
    const context: Context = await contextResponse.json();

    const descendants = context.descendants.sort((a, b) =>
      a.created_at < b.created_at ? -1 :
      a.created_at > b.created_at ? +1 :
      0
    );

    {
      const tx = db.transaction(["treeOverview", "treeDetails"], "readwrite");
      const overview = tx.objectStore("treeOverview");
      const o = await overview.get(key) ?? {} as OverviewEntry;
      let teaser = root.spoiler_text || html2text(root.content);
      if (teaser.length > 140) teaser = teaser.substring(0, 140) + "...";
      await overview.put(asgn(o, {
        key,
        lastRetrievalDate: new Date(),
        nDescendants: descendants.length,
        nOpen: countOpen(root, descendants, o.closedIds),
        rootCreatedAt: new Date(root.created_at),
        lastCreatedAt: new Date((descendants.at(-1) ?? root).created_at),
        rootAuthor: root.account.display_name,
        rootAuthorAvatar: root.account.avatar_static,
        rootAccountEmojis: root.account.emojis,
        rootAcct: root.account.acct,
        teaser,
        nExpectedDescendants: totalRepliesCount(root, descendants),
      }));
      const details = tx.objectStore("treeDetails");
      await details.put({
        key, root,
        ancestors: context.ancestors,
        descendants,
        tootTree: toTootTree(root, descendants),
      });
    }
    notify.updatedTree(key);
  } catch (caught) {
    console.error(caught);
  }
}

function html2text(html: string) {
  const auxEl = new Document().createElement("div");
  auxEl.append(...sanitize(html));
  return auxEl.textContent;
}

const count = <T>(values: T[], pred: (item: T) => boolean) =>
  values.reduce((acc, item) => acc + Number(pred(item)), 0);

const countOpen = (root: Status, descendants: Status[], closedIds: Set<string>): number =>
  Number(!closedIds.has(versionId(root))) +
  count(descendants, toot => !closedIds.has(versionId(toot)));

function toTootTree(root: Status, descendants: Status[]): SubTree {
  // Notice: A recursive datastructure is built by a non-recursive algorithm.
  const id2subTree = Object.fromEntries([root, ...descendants].map(toot =>
    [toot.id, {toot, children: [] as SubTree[]}]
  ));
  for (const toot of descendants) {
    id2subTree[toot.in_reply_to_id!]?.children.push(id2subTree[toot.id]);
  }
  return id2subTree[root.id];
}

const totalRepliesCount = (root: Status, descendants: Status[]): number =>
  descendants.reduce(
    (acc: number, toot) => acc + toot.replies_count,
    root.replies_count
  );

export
async function updateClosed(overview: OverviewEntry) {
  const tx = db.transaction(["treeOverview", "treeDetails"], "readwrite");
  // TODO It should not be necessary to get this from the database.
  // Put per-tree actions into a class, which holds the current overview
  // and details in memory.
  const details = await tx.objectStore("treeDetails").get(overview.key);
  if (!details) return;
  await tx.objectStore("treeOverview").put({
    ...overview,
    nOpen: countOpen(details.root, details.descendants, overview.closedIds),
  });
  notify.updatedTreeOverview(overview.key);
}

export
async function deleteTree({key, rootAuthor}: OverviewEntry) {
  if (!confirm(`Really unfollow toot ${key} by ${rootAuthor}?` +
    `\n\nThis will not only remove the toot tree from this application, ` +
    `but it will also forget which toots you have already closed.`)) {
    return;
  }
  const tx = db.transaction(["treeOverview", "treeDetails"], "readwrite");
  await Promise.all([
    tx.objectStore("treeOverview").delete(key),
    tx.objectStore("treeDetails").delete(key),
  ]);
  notify.deletedTree(key);
}

export
async function reloadTrees() {
  const entries = (await db.getAll("treeOverview"));
  await Promise.all(entries.map(({instance, id}) => fetchTree(instance, id)));
}

export
async function deleteTrees() {
  if (!confirm(`Really unfollow all toots?`)) {
    return;
  }
  const tx = db.transaction(["treeOverview", "treeDetails"], "readwrite");
  await Promise.all([
    tx.objectStore("treeOverview").clear(),
    tx.objectStore("treeDetails").clear(),
  ]);
  notify.cleared();
}
