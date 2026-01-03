type SettableProps<T extends HTMLElement> = {
  [P in keyof T]:
    // The style-property setter accepts a string:
    P extends "style" ? string :
    T[P];
};

type AtEventHandlers = {
  [P in `@${keyof HTMLElementEventMap}`]:
    P extends `@${infer K extends keyof HTMLElementEventMap}`
    ? (ev: HTMLElementEventMap[K]) => void
    : never
};

type HItem<T extends HTMLElement> =
| Partial<SettableProps<T> | AtEventHandlers>
| HTMLElement | DocumentFragment| string
| void | null
;

export
type HParam<T extends HTMLElement> = HItem<T> | ((el: T) => HItem<T>);

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
   * - `null` or `undefined`, which is ignored.
   * - A function taking the new `HTMLElement` and returning a value of
   *   one of the previous types.
   *   The return value is then treated like a parameter of that type.
   *   Such a function may also manipulate the element by side effects.
   * @returns the created `HTMLElement`
   */
export default
function H<E extends keyof HTMLElementTagNameMap>(
  tagAndClasses: `${E}.${string}` | E, ...rest: HParam<HTMLElementTagNameMap[E]>[]
): HTMLElementTagNameMap[E] {
  const [tagName, ...classes] = tagAndClasses.split(".");
  const el = document.createElement<E>(tagName as E);
  for (const cls of classes) {
    el.classList.add(cls);
  }

  for (const param of rest) {
    const item = typeof param === "function" ? param(el) : param;
    if (item == null) {
      // do nothing
    } else if (typeof item === "string" || item instanceof HTMLElement) {
      el.append(item);
    } else if (item instanceof DocumentFragment) {
      el.append(...item.childNodes);
    } else {
      if (item.constructor !== Object) {
        console.warn(`Attributes for ${tagAndClasses} not a plain object: ${item}`);
      }
      Object.entries(item).forEach(([k, v]) => {
        if (k.startsWith("@")) {
          el.addEventListener(k.substring(1), v);
        } else {
          el[k as keyof (HTMLElementTagNameMap[E])] = v;
        }
      });
    }
  }

  return el;
}

/**
 * A variant of `H` with weaker typing.
 *
 * (`H` could have been overloaded with this weaker type, but the explicit
 * "opt-in" by appending the underscore provides a bit more type safety.)
 */
export const H_ =
  H as (tagAndClasses: string, ...rest: HParam<HTMLElement>[]) => HTMLElement;
