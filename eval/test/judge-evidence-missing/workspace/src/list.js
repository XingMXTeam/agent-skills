export function renderList(items) {
  return items.map((item) => item.title).join("\n");
}
