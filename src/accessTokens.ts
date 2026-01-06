import database from "./database";
import H, { reRenderInto } from "./H";

const accessTokenGridEl = document.querySelector<HTMLElement>("#access-tokens")!;

const removeAllButton =
  H("button", "✗ Remove All", {
    async onclick() {
      if (confirm("Really remove all tokens?")) {
        await db.clear("accessTokens");
        await updated();
      }
    },
  });
const instanceInput =
  H("input.access-instance", {type: "text", placeholder: 'e.g. "mastodon.social"'});
const tokenInput =
  H("input.access-token", {type: "text", placeholder: "(typically 43 characters)"});
const saveButton =
  H("button.access-save", "+ Save");

const db = await database;
const channel = new BroadcastChannel("accessTokens");
channel.onmessage = showTokens;

async function updated() {
  channel.postMessage(null);
  await showTokens();
}

async function showTokens() {
  const data = await db.getAll("accessTokens");
  removeAllButton.disabled = data.length === 0,
  reRenderInto(accessTokenGridEl!,
    H("span.bold", "Instance"),
    H("span.bold", "Token"),
    removeAllButton,
    H("span.dummy"),

    ...data.flatMap(({instance, token}) => [
      H("span.access-instance", instance),
      H("span.access-token", token),
      H("button", "✗ Remove", {async onclick() {
        if (confirm(`Really remove token for "${instance}"?`))
        await db.delete("accessTokens", instance);
        await updated();
      }}),
      H("button", "Edit", {onclick() {
        instanceInput.value = instance;
        tokenInput.value = token;
        setSaveDisabled();
      }}),
    ]),

    instanceInput,
    tokenInput,
    saveButton,
    H("span.dummy"),  )
}

await showTokens();

function setSaveDisabled() {
  saveButton.disabled =
    !instanceInput.value.trim() ||
    !tokenInput.value.trim();
}
instanceInput.addEventListener("input", setSaveDisabled);
tokenInput.addEventListener("input", setSaveDisabled);
setSaveDisabled();

async function saveToken() {
  const instance = instanceInput.value.trim();
  const token = tokenInput.value.trim();
  if (!instance || !token) {
    alert("Fill in the fields before clicking \"Save\"");
    return;
  }
  if (
    await db.get("accessTokens", instance) &&
    !confirm(`Overwrite token for "${instance}"?`)
  ) {
    return;
  }
  await db.put("accessTokens", {instance, token});
  instanceInput.value = "";
  tokenInput.value = "";
  setSaveDisabled();
  instanceInput.focus();
  await updated();
}

saveButton.onclick = saveToken;

function handleEnter(ev: KeyboardEvent) {
  if (ev.key === "Enter" && !saveButton.disabled) {
    saveToken();
    ev.stopImmediatePropagation();
    ev.preventDefault();
  }
}

instanceInput.addEventListener("keypress", handleEnter);
tokenInput.addEventListener("keypress", handleEnter);
