export default (d?: Date | string) =>
  d ? new Date(d).toLocaleString("sv") : "-";
