export function renderNotice(el, notice) {
  el.innerHTML = "<div class='notice'>" + notice.title + "</div>";
  return el;
}
