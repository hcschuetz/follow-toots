import asgn from "./asgn";
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

// Did we just return from an authorization roundtrip?
await continueAcquireRoundtrip();

const acquireButton = H("button", "Acquire");

async function showTokens() {
  const data = await db.getAll("accessTokens");
  removeAllButton.disabled = data.length === 0,
  reRenderInto(accessTokenGridEl!,
    H("span.bold", "Instance"),
    H("span.bold", "Token"),
    H("span.view-all", "👁"),
    removeAllButton,
    H("span.dummy"),

    ...data.map(({instance, token}) => H("div.contents.row",
      H("span.access-instance", instance),
      H("span.access-token", token),
      H("span.view", "👁"),
      H("button", "✗ Remove", {async onclick() {
        if (confirm(`Really remove token for "${instance}"?`)) {
          await db.delete("accessTokens", instance);
          window.sessionStorage.removeItem("credentials:" + instance);
          await updated();
        }
      }}),
      H("button", "Edit", {onclick() {
        instanceInput.value = instance;
        tokenInput.value = token;
        // to enable the acquireButton:
        instanceInput.dispatchEvent(new InputEvent("input"));
        setSaveDisabled();
      }}),
    )),

    instanceInput,
    tokenInput,
    H("span.dummy"),
    saveButton,
    acquireButton,
  );
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

// -----------------------------------------------------
// Acquire a token directly from the instance:

const scope = "read:statuses read:follows";

async function acquireToken() {
  const instance = instanceInput.value;
  if (!instance) {
    alert("No instance given");
    return;
  }

  const response = await fetch(`https://${instance}/api/v1/apps`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_name: "Follow Toots",
      redirect_uris: document.location.href,
      scopes: scope,
      website: document.location.href,
    }),
  });

  if (!response.ok) {
    alert("Application registration failed.");
    return;
  }

  const {client_id, client_secret} = await response.json();

  const credentials = JSON.stringify({client_id, client_secret});
  window.sessionStorage.setItem("credentials:" + instance, credentials);

  // Navigate to the instance's authorization page.
  // If the user authorizes the access, we will come back to this page.
  // This is detected and handled in function `continueAcquireRoundtrip()`.
  document.location =
    `https://${instance}/oauth/authorize?` +
    new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: document.location.origin + document.location.pathname,
      scope,
      state: instance,
      lang: "en",
    },
  );
}

function disable_acquire_button() {
  acquireButton.disabled = !instanceInput.value;
}
instanceInput.addEventListener("input", disable_acquire_button);
disable_acquire_button();

acquireButton.addEventListener("click", acquireToken);

async function continueAcquireRoundtrip() {
  const searchParams = new URLSearchParams(document.location.search);
  const instance = searchParams.get("state");
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  if (error) {
    window.history.replaceState({}, "", document.location.pathname);
    accessTokenGridEl.scrollIntoView({behavior: "smooth", block: "center"});
    alert(`Error: ${error}\n\n${errorDescription}`);
    return;
  }
  if (!(instance && code)) return;
  const credentials = window.sessionStorage.getItem("credentials:" + instance);
  if (!credentials) {
    alert("Credentials missing");
    return;
  }
  const {client_id, client_secret} = JSON.parse(credentials);
  if (!(client_id && client_secret)) {
    alert("Credentials not parseable");
    return;
  }
  const response = await fetch(`https://${instance}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id,
      client_secret,
      // There's no more redirection going on.  Still the redirect_uri
      // must be provided to make the OAuth service happy.
      redirect_uri: document.location.href,
      code,
    }),
  });
  if (!response.ok) {
    alert(`Could not get a token from ${instance}`);
    return;
  }
  const {token_type, access_token} = await response.json();

  if (token_type !== "Bearer") {
    alert(`unexpected token type: ${token_type}`);
    return;
  }
  // We might also check that the scope is as expected.

  await db.put("accessTokens", {instance, token: access_token});

  // Broadcasting is sufficient.  Calling updated() and thus showTokens()
  // is not needed since the latter will be called anyway.
  channel.postMessage(null);

  window.history.replaceState({}, "", document.location.pathname);
  accessTokenGridEl.scrollIntoView({behavior: "smooth", block: "center"});
  alert(`Saved new access token for "${instance}".`);
}
