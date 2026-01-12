import { deleteTrees as deleteAll, deleteTree, fetchTree, reloadTrees as reloadAll } from './actions';
import H, { reRenderInto } from './H';
import database from './database';
import type { Notifications } from './Notifications';
import setupNotifications from './setupNotifications';
import url2key from './url2key';
import emojify from './emojify';
import formatDate from './formatDate';
import { effect } from '@preact/signals-core';

const db = await database;

setupNotifications<Notifications>("followToots", {
  async updatedTreeOverview() {
    show();
  },

  async updatedTree() {
    show();
  },

  async deletedTree() {
    show();
  },

  cleared() {
    show();
  }
});

const theGrid = document.querySelector<HTMLElement>("#overview")!;
const newEntry = document.querySelector<HTMLElement>("#new-entry")!;

let input: HTMLInputElement;
newEntry.append(
  input = H("input", {
    "@keypress": ev => ev.key === "Enter" && addRoot(input.value),
  }),
  H("button", {"@click": () => addRoot(input.value)}, "Add"),
);

async function addRoot(url: string) {
  try {
    const extract = url2key(url);
    if (!extract) {
      return;
    }
    const [instance, id] = extract;
    const overview = await db.get("treeOverview", `${instance}/${id}`);
    if (overview) {
      alert(`You are already following this toot by ${overview.rootAuthor}.`);
      return;
    }
    await fetchTree(instance, id);
    input.value = "";
  } catch (e) {
    alert(`Problem with ${url}:\n${e}`);
  }
}

/**
 * Number of full days between 1970-01-01 and the given date
 * (in the date's timezone)
 */
const dayNumber = (date: Date) => Math.floor(
  (date.getTime() - date.getTimezoneOffset() * (60 * 1000)) /
  (24 * 60 * 60 * 1000)
);

const dateEl = (date?: Date): HTMLElement | string => {
  if (!date) return H("span", "-");
  const daysOffset = dayNumber(date) - dayNumber(new Date());
  return H("span.right", 
    (daysOffset ? `${daysOffset}d ` : "") +
    date.toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit"}),
    // I like Swedish-style dates (YYYY-MM-DD):
    {title: formatDate(date)}
  );
}

async function show() {
  theGrid.replaceChildren(/* ...with nothing */);
  const tx = db.transaction("treeOverview");
  const entries = await tx.store.getAll();
  if (entries.length === 0) return;
  entries.sort((a, b) =>
    (a.lastCreatedAt?.getTime() ?? Number.MAX_VALUE) -
    (b.lastCreatedAt?.getTime() ?? Number.MAX_VALUE)
  );

  reRenderInto(theGrid,
    H("div.bold", "Root Author"),
    H("div.bold", "Toots"),
    H("div.bold", "Unseen"),
    H("div.bold", "Last Toot"),
    H("div.bold", "Last Fetch"),
    H("button", {"@click": reloadAll}, "⟳ Reload All"),
    H("button", {"@click": deleteAll}, "✗ Remove All"),
    entries.map(o => H("div.contents",
      el => {
        effect(() => {
          el.classList.toggle("all-seen", !o.nUnseen);
        });
      },
      H("div.separator"),
      H("span.root-author",
        H("img.root-author-icon", {src: o.rootAuthorAvatar}),
        "\u2002",
        H("a",
          {
            title: `@${o.rootAcct} on ${o.instance}`,
            href: `tree.html#${
              new URLSearchParams({instance: o.instance, id: o.id})
            }`,
          },
          o.rootAuthor ? emojify(o.rootAuthor, o.rootAccountEmojis) : o.key,
        ),
      ),
      H("div.right", `${o.nToots ?? 0}`),
      H("div.right", o.nUnseen?.toString() ?? ""),
      dateEl(o.lastCreatedAt),
      dateEl(o.lastRetrievalDate),
      H("button", {"@click": () => fetchTree(o.instance, o.id)}, "⟳ Reload"),
      H("button", {"@click": () => deleteTree(o)}, "✗ Remove"),
      o.teaser && H("div.teaser", o.teaser),
    )),
  );
}

show();
