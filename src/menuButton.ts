import H, { type HParam } from "./H";

export
const menuButtonWithKey = (text: HParam, keys: HParam[], onclick: () => void) =>
  H("button.menu-entry-with-key-hint",
    H("span", text),
    H("span",
      keys.map((key, i) => [
        i === 0 ? null : "\u202f+\u202f",
        H("span.keyboard", key),
      ]),
    ),
    {onclick},
  );
