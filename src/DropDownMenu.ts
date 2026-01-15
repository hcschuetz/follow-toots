import H from "./H";
import style from "./DropDownMenu.css?raw";

export default
class DropDownMenu extends HTMLElement {
  close: (ev: PointerEvent) => unknown;

  constructor() {
    super();
    let details: HTMLDetailsElement;
    const shadowRoot = this.attachShadow({mode: "open"});
    shadowRoot.append(
      H("style", style),
      details =
      H("details.menu",
        H("summary", "☰"),
        H("div.items",
          H("slot"),
        ),
      ),
    );

    this.close = ev => {
      if (!details.open) return;
      console.log("closing");
      details.open = false;
      // This avoids the immediate re-opening of the details element
      // if ev should target the summary element:
      ev.preventDefault();
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
