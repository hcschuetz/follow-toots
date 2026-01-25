import H from "./H";
// import style from "./ContextMenu.css" with {type: "css"};
// ...is not yet supported by the toolchain and so we use this work-around:
import styleRaw from "./ContextMenu.css?raw";
const style = new CSSStyleSheet();
style.replaceSync(styleRaw);

export default
class ContextMenu extends HTMLElement {
  /** static so that we can disable/enable all instances at once.
   * 
   * (I'd prefer to propagate the flag to individual instances via CSS and to
   * extract it here with `this.computedStyleMap` but the latter is not
   * implemented by Firefox.)
   */
  static disabled = false;

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
      if (ContextMenu.disabled) return;
      ev.preventDefault();
      menu.style.left = ev.clientX + "px";
      menu.style.top = ev.clientY + "px";
      menu.classList.add("open");
      menu.focus();
      menu.onkeydown = ({key}) => {if (key === "Escape") this.close();};
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
