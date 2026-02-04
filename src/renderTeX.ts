import H from "./H";

// TODO Link integrity checks (or serve my own copy of KaTeX?)

// TODO Apply CSS only to the toot content?
// (Could be done with an iframe, @scope or shadow DOM.
// Shadow DOM for toot content might anyway be a good idea
// to protect against styling interference.)

const baseURL = "https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/";

let texStyle: CSSStyleSheet | undefined;

export
function getTexStyle() {
  if (!texStyle) {
    texStyle = new CSSStyleSheet();
    const cssURL = baseURL + "katex.min.css";

    // Get and apply the actual CSS in the background:
    (async () => {
      try {
        await texStyle.replace(await(await fetch(cssURL)).text());
      } catch (e) {
        console.error(e);
        alert("Exception while getting/applying KaTeX stylesheet:\n" + e);
      }
    })();

    // Hack: For whatever reason it seems to be necessary to have the style
    // *also* at the top level, even though we have LaTeX only in shadow DOM.
    document.head.appendChild(H("link", {rel: "stylesheet", href: cssURL}));
  }
  return texStyle;
}

export default async function renderTeX(el: HTMLElement) {
  try {
    const renderMathInElement =
      (await import(baseURL + "contrib/auto-render.min.mjs")).default;

    // Toot authors may put line breaks in TeX expressions.
    // Mastodon converts these to <br> elements and thus `renderMathInElement`
    // will not find the TeX expression.
    // So we convert <br>s back to newlines, apply `renderMathInElement`, and
    // finally convert remaining newlines to <br>s again.
    const el1 = br2newline(el);
    renderMathInElement(el1);
    const el2 = newline2br(el1);
    el.replaceChildren(...el2.childNodes);
  } catch (e) {
    console.error(e);
    alert("LaTeX rendering failed:\n" + e);
  }
}

const detectTeX = /\$\$(?:.|\n)+\$\$|\$[^$]+\$|\\\((?:.|\n)+\\\)|\\\[(?:.|\n)+\\\]/;

export
function looksLikeTeX(el: Element): boolean {
  const descend = (e: Element) =>
    [...e.childNodes].some(child =>
      (child instanceof Text && detectTeX.test(child.data)) ||
      (child instanceof Element && looksLikeTeX(child))
    );
  // ensure that multiline TeX expressions are detected despite mastodon's
  // conversion of newlines to <br> elements:
  const el1 = br2newline(el);
  el1.normalize();
  return descend(el1);
}

// Dimensions taken from https://tess.oconnor.cx/2007/08/tex-poshlet
export
const latexLogo = () =>
  H("span", {style: `
      font-family: Times New Roman, serif;
    `},
    "L",
    H("span", {style: `
      font-size: 0.85em;
      vertical-align: 0.15em;
      margin-left: -0.36em;
      margin-right: -0.15em;    
    `}, "A"),
    "T",
    H("span", {style: `
      vertical-align: -0.5ex;
      margin-left: -0.1667em;
      margin-right: -0.125em;    
    `}, "E"),
    "X",
  );

function br2newline(e: Element): Element {
  const out = e.cloneNode() as Element;
  out.append(...[...e.childNodes].map(child =>
      child instanceof HTMLBRElement ? "\n" :
      child instanceof Element ? br2newline(child) :
      child instanceof Text ? child.data :
      ""
  ));
  return out;
}

function newline2br(e: Element): Element {
  const out = e.cloneNode() as Element;
  out.append(...[...e.childNodes].flatMap<Node | string>(child =>
    child instanceof Text
    ? child.data.split("\n").flatMap((part, i) => i == 0 ? [part] : [H("br"), part])
    : child instanceof Element
    ? [newline2br(child)]
    : []
  ));
  return out;
}
