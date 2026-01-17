import H from "./H";
import styleRaw from "./DropDownMenu.css?raw";

const style = new CSSStyleSheet();
style.replaceSync(styleRaw);

export default
class DropDownMenu extends HTMLElement {
  close: (ev: PointerEvent) => unknown;

  constructor() {
    super();
    const details =
      H("details.menu",
        H("summary", "☰"),
        H("div.items",
          H("slot"),
        ),
      );
    const shadowRoot = this.attachShadow({mode: "open"});
    shadowRoot.adoptedStyleSheets.push(style);
    shadowRoot.append(details);
    details.ontoggle = () => {
      if (details.open) {
        details.onkeydown = ({key}) => {
          if (key === "Escape") {
            details.open = false;
          }
        }
      }
    }

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
