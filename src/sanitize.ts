/**
 * @file HTML sanitization
 *
 * If we were dealing with a single mastodon instance, we might get by without
 * sanitization:
 * - The user has to trust this instance anyway and the mastodon API provides
 *   already sanitized HTML.
 * - Even if the mastodon instance were malicious, it could not do much harm.
 *
 * But since we support toots from multiple instances, there is a risk of XSS
 * attacks:
 * Some instance might try to interfere maliciously with data from other instances.
 * Thus sanitization is necessary.
 */

import A_blank from "./A_blank";
import H, { H_ } from "./H";

// -----------------------------------------------------------------------------
// Sanitization configuration

// Tag names and attribute names can be
// - disallowed (not listed; will be dropped and reported to the console)
// - allowed (listed and keep === true)
// - ignored silently (listed and keep === false)

type AttributePermissions = Map<string, /* ignore: */ boolean>;

type ElementPermission = {
  keep: true;
  attributes: AttributePermissions;
} | {
  keep?: false;
}

type ElementPermissions = Map<string, ElementPermission>;

const globalAttrs = {
  // class: false,
  // translate: false,
} as const;

const kept = (attrs: Record<string, boolean> = {}): ElementPermission => ({
  keep: true,
  attributes: new Map(Object.entries({...globalAttrs, ...attrs})),
});
const ignored: ElementPermission = { keep: false };

const elementPermissions: ElementPermissions = new Map(Object.entries({
  DIV: kept(),
  SPAN: kept({translate: false, class: true}),
  P: kept(),
  BR: kept(),
  I: kept(),
  B: kept(),
  STRONG: kept(),
  EM: kept(),
  UL: kept(),
  OL: kept(),
  LI: kept(),
}));

// -----------------------------------------------------------------------------
// The actual sanitization logic

function* sanitizeAttrs(el: HTMLElement, permissions: AttributePermissions) {
  for (const attr of el.attributes) {
    switch (permissions.get(attr.name)) {
      case undefined:
        console.warn("skipping attribute", attr);
        break;
      case true:
        yield [attr.name, attr.value];
        break;
      case false:
        // ignore silently
        break;
    }
  }
}

function* sanitizeNodes(nodes: NodeListOf<ChildNode>)
  : Generator<(HTMLElement | string), void, unknown>
{
  for (const node of nodes) {
    if (node instanceof Text) {
      yield node.textContent;
    } else if (node instanceof HTMLAnchorElement) {
      // Special treatment: Always open links in a new tab.
      yield A_blank("", node.href, ...sanitizeNodes(node.childNodes));
    } else if (node instanceof HTMLElement) {
      const permissions = elementPermissions.get(node.tagName);
      switch (permissions?.keep) {
        case undefined:
          console.warn("skipping element", node);
          break;
        case true: {
          const newEl = H_(node.tagName, ...sanitizeNodes(node.childNodes));
          for (const [name, value] of sanitizeAttrs(node, permissions.attributes)) {
            newEl.setAttribute(name, value);
          }
          yield newEl;
          break;
        }
        case false:
          // ignore silently
          break;
      }
    } else {
      console.warn("skipping node", node);
    }
  }
}

const parser = new DOMParser();

// TODO use TrustedTypes if available.
export default
function* sanitize(html: string) {
  try {
    yield* sanitizeNodes(
      parser.parseFromString(html, "text/html").body.childNodes,
    );
  } catch (e) {
    // Can we actually come here?
    yield H("div.sanitization-error", `[Error sanitizing "${html}"`);
  }
}
