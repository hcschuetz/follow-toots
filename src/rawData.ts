import database, { type DetailEntry, type OverviewEntry } from './database';

const db = await database;
const output = document.querySelector("#output")!;
const update = document.querySelector<HTMLButtonElement>("#update")!;

update.onclick = show;
show();

type Value = {
  overview?: OverviewEntry,
  details?: DetailEntry,
};

async function show() {
  output.replaceChildren(); // to see the output flash

  const byKey: Record<string, Value> = {};

  const tx = db.transaction(["treeOverview", "treeDetails"]);
  for (const overview of await tx.objectStore("treeOverview").getAll()) {
    byKey[overview.key] = {overview};
  }
  for (const details of await tx.objectStore("treeDetails").getAll()) {
    byKey[details.key] = {
      ...byKey[details.key] ?? {},
      details,
    };
  }

  output.replaceChildren(
    Object.entries(byKey)
    .map(([key, {overview, details}]) =>
      `${overview ? "O" : "-"} ${details ? "D" : "-"} ${key}\n`
    ).join("")
    +
    "----------------------------------------\n"
    +
    JSON.stringify(byKey, jsonReplacer, 2)
    +
    "\n----------------------------------------\n"
    +
    JSON.stringify(await db.getAll("accessTokens") ?? null, null, 2)
    +
    "\n----------------------------------------\n"
    +
    JSON.stringify(await db.getAll("config") ?? null, null, 2)
  );
}

const jsonReplacer = (_key: string, value: any) =>
  value instanceof Date ? {Date: value.toISOString()} :
  value instanceof Set ? {Set: [...value.values()]} :
  value instanceof Map ? {Map: [...value.entries()]} :
  value;
