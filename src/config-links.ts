import { effect, signal } from "@preact/signals-core";
import H from "./H";
import mapObject from "./mapObject";
import database from "./database";
import {
  type LinkableFeature, linkableFeatures, linkConfigConfig
} from "./linkConfigConfig";

const configLinksEl = document.querySelector("#config-links");

const linkConfigurationSigs =
  mapObject(linkableFeatures, () =>
    mapObject(linkConfigConfig, () =>
      signal<boolean>(false)
    )
  );

{
  const db = await database;

  async function getFromDB() {
    const fromDB = (await db.get("config", "links"))?.value;

    if (fromDB) {
      Object.entries(linkConfigurationSigs).forEach(([k1, sigs]) => {
        Object.entries(sigs).forEach(([k2, sig]) => {
        sig.value = fromDB[k1]?.[k2] ?? false;
        });
      });
    }
  }

  await getFromDB();

  const channel = new BroadcastChannel("linkConfig");
  channel.onmessage = getFromDB;

  effect(() => {
    const value =
      mapObject(linkConfigurationSigs, sigs =>
        mapObject(sigs, sig =>
          sig.value,
        )
      );
    db.put("config", {key: "links", value});
    channel.postMessage(null);
  });
}

configLinksEl!.replaceChildren(
  H("div.bold.client-name", "Frontend"),
  ...Object.values(linkableFeatures).map(ft => H("div.bold", ft)),

  ...Object.entries(linkConfigConfig).flatMap(([id, client]) => [
    H("span.client-name",
      H("img", {src: client.icon}),
      H("span", client.name),
    ),
    ...Object.keys(linkableFeatures).map(key => {
      const sig = linkConfigurationSigs[key as LinkableFeature][id];
      const el = H("input", {
        type: "checkbox",
        "@change": () => sig.value = el.checked,
      });
      effect(() => { el.checked = sig.value; });
      return el;
    }),
  ]),
);
