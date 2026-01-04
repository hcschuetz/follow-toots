/**
 * Extract `[instance, id]` from an URL referencing a status on phanpy.social,
 * elk.zone or a standard mastodon client.
 */
export default (urlString: string): [string, string] | undefined => {
  const url = new URL(urlString);
  switch (url.origin) {
    case "https://phanpy.social": {
      // https://phanpy.social/#/instan.ce/s/12345
      const hashPath = url.hash.split("/");
      console.log(url.pathname, url.search, hashPath)
      return confirmURL(
        urlString,
        url.pathname === "/" && url.search === ""
        && hashPath.length === 4 && hashPath[0] === "#" && hashPath[2] === "s",
        hashPath[1],
        hashPath[3],
      );
    }
    case "https://elk.zone": {
      // https://elk.zone/instan.ce/@user[@home.instan.ce]/12345
      const path = url.pathname.split("/");
      return confirmURL(
        urlString,
        path.length === 4 && path[0] === "" && userRegExp.test(path[2])
        && url.search === "" && url.hash === "",
        path[1],
        path[3],
      );
    }
    default: {
      // First check if the url references a tree page
      // from a follow-toots application elsewhere.
      if (url.pathname.endsWith("/tree.html") && url.hash) {
        const params = new URLSearchParams("?" + url.hash.substring(1));
        const instance = params.get("instance"), id = params.get("id");
        if (instance && id && idRegExp.test(id)) {
          if (url.origin === location.origin) {
            alert(`
              While taking over a toot tree from another follow-toots
              installation is supported,
              it was probably a mistake to apply the bookmarklet to
              the same installation.
            `.replaceAll(/\s+/g, " "));
            return undefined;
          }
          return [instance, id];
        }
      }

      // Now let's hope we have a standard mastodon client.

      // https://instan.ce/[deck/]@user[@home.instan.ce]/12345
      // or
      // https://instan.ce/users/user/statuses/12345
      const path = url.pathname.split("/");
      if (path[1] === "users") {
        return confirmURL(
          urlString,
          path.length === 5 && path[0] === "" && localUserRegExp.test(path[2])
          && path[3] === "statuses",
          url.host,
          path[4],
        )
      } else {
        if (path[1] === "deck") {
          path.splice(1, 1);
        }
        return confirmURL(
          urlString,
          path.length === 3 && path[0] === "" && userRegExp.test(path[1]),
          url.host,
          path[2],
        );
      }
    }
  }
}

const userRegExp = /^@[-_a-z0-9]+(@[-_a-z0-9\.]+)?$/i;
const localUserRegExp = /^[-_a-z0-9]+$/i;

// In theory, a mastodon status id can be any string and should not be
// introspected.  But in practice it consists of digits, which we can use for
// a plausibility check.
const idRegExp = /^\d+$/;

/**
 * In case a decomposed URL looks suspicious, let the user confirm it.
 *
 * (Here "suspicious" means: not ok or non-numeric id.)
 */
const confirmURL = (
  urlString: string, ok: boolean, instance: string, id: string
): [string, string] | undefined =>
  (ok && idRegExp.test(id)) || confirm(
`The URL "${urlString}" does not look like an URL identifying a single toot.

Use it nevertheless?

(The mastodon instance would be "${instance}" and the toot id would be "${id}".)`)
  ? [instance, id] : undefined;