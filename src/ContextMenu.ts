import H from "./H";
import styleRaw from "./ContextMenu.css?raw";

const style = new CSSStyleSheet();
style.replaceSync(styleRaw);

export default
class ContextMenu extends HTMLElement {
  open: (ev: PointerEvent) => unknown;
  close: () => unknown;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({mode: "open"});
    shadowRoot.adoptedStyleSheets.push(style);
    const menu = H("div.context-menu", H("slot"));
    menu.setAttribute("tabindex", "0");
    shadowRoot.append(menu);

    this.open = ev => {
      ev.preventDefault();
      menu.style.left = ev.clientX + "px";
      menu.style.top = ev.clientY + "px";
      menu.classList.add("open");
      menu.focus();
      menu.onkeydown = ({key}) => {if (key === "Escape") this.close();},
      document.addEventListener("click", this.close);
      // I'd like to close the context menu with a right click.
      //     document.addEventListener("contextmenu", this.close);
      // But apparently that fires already upon the right click currently
      // opening the menu.
    }

    this.close = () => {
      menu.classList.remove("open");
      document.removeEventListener("click", this.close);
      document.removeEventListener("contextmenu", this.close);
    };
  }

  connectedCallback() {
    this.parentElement!.addEventListener("contextmenu", this.open);
  }

  disconnectedCallback() {
    this.close();
    this.parentElement!.removeEventListener("contextmenu", this.open);
  }
}

window.customElements.define("context-menu", ContextMenu);
