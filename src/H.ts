import isIterable from "./isIterable";

type SettableProps<T extends HTMLElement> = {
  [P in keyof T]:
    // The style-property setter accepts a string:
    P extends "style" ? string :
    // TODO any other properties with different getter and setter types?
    // The normal case where getter and setter types coincide:
    T[P];
};

type AtEventHandlers = {
  [P in `@${keyof HTMLElementEventMap}`]:
    P extends `@${infer K extends keyof HTMLElementEventMap}`
    ? (ev: HTMLElementEventMap[K]) => void
    : never
};

export
type HParam<T extends HTMLElement = HTMLElement> =
| Partial<SettableProps<T> | AtEventHandlers>
| Attr
| HTMLElement | DocumentFragment | string
| void | null
| Iterable<HParam<T>>
| ((el: T) => HParam<T>);

export
function extendH<E extends HTMLElement>(el: E, ...rest: HParam<E>[]) {
  for (const param of rest) {
    if (param == null) {
      // do nothing
    } else if (
      typeof param === "string"
      || param instanceof HTMLElement
      || param instanceof DocumentFragment
    ) {
      el.append(param);
    } else if (param instanceof Attr) {
      el.setAttribute(param.name, param.value);
    } else if (typeof param === "function") {
      extendH(el, param(el));
    } else if (isIterable(param)) {
      extendH(el, ...param);
    } else {
      if (param.constructor !== Object) {
        console.warn(`Properties for ${el} not a plain object: ${param}`);
      }
      Object.entries(param).forEach(([k, v]) => {
        if (k.startsWith("@")) {
          el.addEventListener(k.substring(1), v);
        } else {
          el[k as keyof (E)] = v;
        }
      });
    }
  }
  return el;
}

export
function setupH<E extends HTMLElement>(el: E, ...rest: HParam<E>[]) {
  [...el.attributes].forEach(({name}) => name !== "id" && el.removeAttribute(name));
  el.replaceChildren();
  extendH(el, ...rest);
}

/**
 * A factory function creating and setting up a new `HTMLElement`
 * @param tagAndClasses
 * A string consisting of an HTML tag name and optionally class names,
 * all separated by periods.
 * @param rest
 * Zero or more additional parameters, each of which can be:
 * - A plain object with key/value pairs of these kinds:
 *   - A pair `"@<eventType>": <handlerFunction>`
 *     adds the `<handlerFunction>` as a handler for events
 *     of type `<eventType>` to the new element.
 *   - Any other pair `<property>: <value>`
 *     sets a property of the new element.
 * - An `HTMLElement` or a string, which is added as a child.
 * - A `DocumentFragment`, whose contained nodes are added as children.
 * - An `Attr`, a copy of which will be added to the new element.
 * - `null` or `undefined`, which is ignored.
 * - An `Iterable`, whose items will be handled recursively.
 * - A function taking the new `HTMLElement` and returning a parameter value,
 *   which will be handled recursively.
 *   Such a function may also manipulate the element by side effects.
 * @returns the created `HTMLElement`
 */
export default
function H<T extends keyof HTMLElementTagNameMap>(
  tagAndClasses: `${T}.${string}` | T, ...rest: HParam<HTMLElementTagNameMap[T]>[]
): HTMLElementTagNameMap[T] {
  const [tagName, ...classes] = tagAndClasses.split(".");
  const el = document.createElement<T>(tagName as T);
  for (const cls of classes) {
    el.classList.add(cls);
  }
  return extendH(el, ...rest);
}

/**
 * A variant of `H` with weaker typing.
 *
 * (`H` could have been overloaded with this weaker type,
 * but that would have lost some type safety.)
 */
export const H_ =
  H as (tagAndClasses: string, ...rest: HParam<HTMLElement>[]) => HTMLElement;