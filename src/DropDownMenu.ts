import H, { reRenderInto, type HParam } from "./H";
// import style from "./DropDownMenu.css" with {type: "css"};
// ...is not yet supported by the toolchain and so we use this work-around:
import styleRaw from "./DropDownMenu.css?raw";
const style = new CSSStyleSheet();
style.replaceSync(styleRaw);

export default
class DropDownMenu extends HTMLElement {
  close: (ev: PointerEvent) => unknown;

  itemProvider?: () => HParam;

  constructor() {
    super();
    const details =
      H("details.menu",
        {
          onkeydown: ev => { if (ev.key === "Escape") { details.open = false; }},
          ontoggle: () =>
            this.itemProvider &&
            reRenderInto(this as DropDownMenu, details.open ? this.itemProvider?.() : null),
        },
        H("summary", "☰"),
        H("slot"),
      );
    const shadowRoot = this.attachShadow({mode: "open"});
    shadowRoot.adoptedStyleSheets.push(style);
    shadowRoot.append(details);

    this.close = ev => {
      if (!details.open) return;
      details.open = false;
      if (ev.target === this) {
        ev.preventDefault(); // avoid immediate re-opening
      }
    };
  }

  connectedCallback() {
    document.addEventListener("click", this.close);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.close);
  }
}

window.customElements.define("drop-down-menu", DropDownMenu);
