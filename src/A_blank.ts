import H, { type HParam } from './H';

export default (
  classes: string,
  href: string,
  ...rest: HParam<HTMLAnchorElement>[]
): HTMLAnchorElement =>
  H("a",
    {
      className: classes.split(/[ \.]/).join(" ").trim(),
      href,
      target: "_blank",
      rel: "noopener noreferrer",
    },
    ...rest
  );
