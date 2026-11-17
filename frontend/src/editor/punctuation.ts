const punctuation = /[，。、；！？,.;!?—–]/u;
export function moveByPunctuation(field, direction) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !field.contains(selection.focusNode))
    return false;
  const range = document.createRange();
  range.selectNodeContents(field);
  range.setEnd(selection.focusNode, selection.focusOffset);
  const at = range.toString().length,
    text = field.textContent;
  let target = direction > 0 ? text.length : 0;
  if (direction > 0) {
    for (let i = at; i < text.length; i++)
      if (punctuation.test(text[i])) {
        target = i + 1;
        break;
      }
  } else
    for (let i = at - 2; i >= 0; i--)
      if (punctuation.test(text[i])) {
        target = i + 1;
        break;
      }
  const walker = document.createTreeWalker(field, window.NodeFilter.SHOW_TEXT);
  let node,
    left = target;
  while ((node = walker.nextNode())) {
    if (left <= node.length) {
      range.setStart(node, left);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    left -= node.length;
  }
  range.selectNodeContents(field);
  range.collapse(direction < 0);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
