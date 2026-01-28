import H from "./H";
// import style from "./ContextMenu.css" with {type: "css"};
// ...is not yet supported by the toolchain and so we use this work-around:
import styleRaw from "./ContextMenu.css?raw";
import asgn from "./asgn";
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
  static current?: ContextMenu;

  open: (ev: PointerEvent) => unknown;
  close: () => unknown;

  onopen?: () => void;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({mode: "open"});
    shadowRoot.adoptedStyleSheets.push(style);
    const menu = H("div.context-menu", H("slot"));
    menu.setAttribute("tabindex", "0");
    shadowRoot.append(menu);

    this.open = ev => {
      ContextMenu.current?.close();
      ContextMenu.current = this;
      if (ContextMenu.disabled) return;
      this.onopen?.();
      ev.preventDefault();
      menu.classList.add("open");
      asgn(menu.style, {
        left: (
          ev.clientX + menu.offsetWidth <= window.innerWidth ? ev.clientX :
          ev.clientX >= menu.offsetWidth ? ev.clientX - menu.offsetWidth :
          Math.max(0, window.innerWidth - menu.offsetWidth)
        ) + "px",
        top: (
          ev.clientY + menu.offsetHeight <= window.innerHeight ? ev.clientY :
          ev.clientY >= menu.offsetHeight ? ev.clientY - menu.offsetHeight :
          Math.max(0, window.innerHeight - menu.offsetHeight)
        ) + "px",
      });
      menu.focus();
      menu.onkeydown = ev => { if (ev.key === "Escape") this.close(); };
      document.addEventListener("click", this.close);
      // I'd like to close the context menu with a right click.
      //     document.addEventListener("contextmenu", this.close);
      // But apparently that fires already upon the right click currently
      // opening the menu.
    }

    this.close = () => {
      ContextMenu.current = undefined;
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
