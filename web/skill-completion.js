function textPoint(el, offset) {
  const walker = document.createTreeWalker(el, window.NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (offset <= node.length) return [node, offset];
    offset -= node.length;
  }
  return [el, el.childNodes.length];
}
export function mountSkillCompletion({
  paper,
  agent,
  setId,
  settled = async () => {},
  request = fetch,
}) {
  const popup = document.createElement("div");
  popup.className = "skill-completion";
  popup.role = "listbox";
  popup.id = "skill-completion";
  popup.hidden = true;
  document.body.append(popup);
  let context = null,
    selected = 0,
    items = [],
    catalog = null,
    key = "",
    sequence = 0;
  function close() {
    sequence++;
    popup.hidden = true;
    if (context) {
      context.field.removeAttribute("aria-controls");
      context.field.removeAttribute("aria-expanded");
      context.field.removeAttribute("aria-activedescendant");
    }
    context = null;
  }
  function current() {
    const field = document.activeElement?.closest?.(".content"),
      s = window.getSelection();
    if (!field || !paper.contains(field) || !s?.isCollapsed || !s.rangeCount)
      return null;
    const range = s.getRangeAt(0);
    if (!field.contains(range.startContainer)) return null;
    const prefix = document.createRange();
    prefix.selectNodeContents(field);
    prefix.setEnd(range.startContainer, range.startOffset);
    const text = prefix.toString(),
      match = /\$([\p{L}\p{N}_.:-]*)$/u.exec(text);
    if (!match) return null;
    return {
      field,
      range: range.cloneRange(),
      query: match[1].toLocaleLowerCase(),
      start: text.length - match[0].length,
      end: text.length,
    };
  }
  function position() {
    if (!context) return;
    const caret = context.range.getBoundingClientRect?.(),
      field = context.field.getBoundingClientRect(),
      r = caret?.height ? caret : field;
    popup.style.width = Math.min(360, window.innerWidth - 20) + "px";
    popup.style.left =
      Math.max(
        10,
        Math.min(r.left, window.innerWidth - popup.offsetWidth - 10),
      ) + "px";
    const below = window.innerHeight - r.bottom - 12;
    popup.style.top =
      (below < 180
        ? Math.max(10, r.top - Math.min(popup.scrollHeight, 240) - 6)
        : r.bottom + 6) + "px";
  }
  function paint() {
    popup.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "skills-empty";
      empty.textContent = "未找到技能";
      popup.append(empty);
    }
    items.forEach((skill, i) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "skill-option";
      option.role = "option";
      option.id = "skill-option-" + i;
      option.setAttribute("aria-selected", String(i === selected));
      const name = document.createElement("strong"),
        description = document.createElement("span");
      name.textContent = skill.reference || "$" + skill.name;
      description.textContent = skill.description;
      option.append(name, description);
      option.onmousedown = (e) => e.preventDefault();
      option.onclick = () => choose(i);
      popup.append(option);
    });
    context.field.setAttribute("aria-controls", popup.id);
    context.field.setAttribute("aria-expanded", "true");
    if (items.length)
      context.field.setAttribute(
        "aria-activedescendant",
        "skill-option-" + selected,
      );
    popup.hidden = false;
    position();
    popup
      .querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }
  function choose(i) {
    if (!context || !items[i]) return;
    const { field, start, end } = context,
      skill = items[i];
    field.dispatchEvent(
      new window.InputEvent("beforeinput", {
        inputType: "insertReplacementText",
        bubbles: true,
      }),
    );
    const range = document.createRange();
    range.setStart(...textPoint(field, start));
    range.setEnd(...textPoint(field, end));
    range.deleteContents();
    const text = document.createTextNode(
      (skill.reference || "$" + skill.name) + " ",
    );
    range.insertNode(text);
    range.setStartAfter(text);
    range.collapse(true);
    field.focus();
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    close();
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  }
  async function update() {
    const next = current();
    if (!next) {
      close();
      return;
    }
    context = next;
    const token = ++sequence;
    try {
      await settled();
      const nextKey = agent() + ":" + (setId() || "");
      if (key !== nextKey || !catalog) {
        const response = await request(
          "/api/skills?setId=" + encodeURIComponent(setId() || ""),
        );
        if (!response.ok) throw Error();
        const value = await response.json();
        if (token !== sequence) return;
        catalog = value.skills || [];
        key = nextKey;
      }
      if (token !== sequence) return;
      const rank = (skill) => {
        const name = skill.name.toLocaleLowerCase(),
          query = context.query;
        return name === query
          ? 0
          : name.startsWith(query)
            ? 1
            : name.includes(query)
              ? 2
              : 3;
      };
      items = catalog
        .filter((skill) =>
          (skill.name + " " + skill.description)
            .toLocaleLowerCase()
            .includes(context.query),
        )
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
        .slice(0, 100);
      selected = 0;
      paint();
    } catch {
      if (token === sequence) {
        items = [];
        selected = 0;
        paint();
      }
    }
  }
  paper.addEventListener("input", (e) => {
    if (!e.isComposing) update();
  });
  paper.addEventListener("compositionend", () => queueMicrotask(update));
  document.addEventListener("selectionchange", () => {
    if (!popup.hidden && current()?.field !== context?.field) close();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (popup.hidden || event.isComposing) return;
      if (
        ["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(event.key)
      ) {
        if (event.key === "Escape") close();
        else if (event.key === "Enter" || event.key === "Tab") {
          if (items.length) choose(selected);
          else close();
        } else if (items.length) {
          selected =
            (selected + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
            items.length;
          paint();
        }
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    "mousedown",
    (event) => {
      if (!popup.contains(event.target)) close();
    },
    true,
  );
  document
    .querySelector("main")
    ?.addEventListener("scroll", close, { passive: true });
  window.addEventListener("resize", close);
  return {
    close,
    refresh() {
      catalog = null;
      key = "";
      close();
    },
    update,
  };
}
