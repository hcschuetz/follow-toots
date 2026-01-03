import H, { type HParam } from './H';

export default (
  classes: string,
  href: string,
  ...rest: HParam<HTMLAnchorElement>[]
): HTMLAnchorElement =>
  H("a",
    {
      href,
      target: "_blank",
      rel: "noopener noreferrer",
    },
    el => classes.split(/[ \.]/).forEach(cls => cls && el.classList.add(cls)),
    ...rest
  );
