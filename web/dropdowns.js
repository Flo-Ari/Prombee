// Keep native select elements as the data model; render one consistent accessible popup.
export function mountDropdowns(root = document) {
  const controls = new Map();
  let opened = null,
    highlight = 0,
    search = "",
    searchTimer;
  function close() {
    if (!opened) return;
    opened.popup.remove();
    opened.trigger.setAttribute("aria-expanded", "false");
    opened.trigger.removeAttribute("aria-activedescendant");
    opened = null;
  }
  function position() {
    if (!opened) return;
    const r = opened.trigger.getBoundingClientRect(),
      p = opened.popup,
      width = Math.min(Math.max(r.width, 180), window.innerWidth - 16);
    p.style.width = width + "px";
    p.style.left =
      Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + "px";
    const below = window.innerHeight - r.bottom - 12,
      above = r.top - 12;
    p.style.maxHeight =
      Math.max(80, Math.min(300, Math.max(below, above))) + "px";
    p.style.top =
      (below >= Math.min(180, above)
        ? r.bottom + 6
        : Math.max(8, r.top - Math.min(300, p.scrollHeight, above) - 6)) + "px";
  }
  function highlightOption(index) {
    if (!opened) return;
    const options = [...opened.popup.querySelectorAll("[role=option]")];
    if (!options.length) return;
    highlight = (index + options.length) % options.length;
    options.forEach((o, i) =>
      o.classList.toggle("highlighted", i === highlight),
    );
    options[highlight].scrollIntoView?.({ block: "nearest" });
    opened.trigger.setAttribute("aria-activedescendant", options[highlight].id);
  }
  function open(control) {
    if (control.select.disabled) return;
    close();
    opened = control;
    control.popup.replaceChildren();
    let lastGroup = null;
    for (const option of control.select.options) {
      if (
        option.parentElement.tagName === "OPTGROUP" &&
        lastGroup !== option.parentElement
      ) {
        lastGroup = option.parentElement;
        const group = document.createElement("div");
        group.className = "dropdown-group";
        group.textContent = lastGroup.label;
        control.popup.append(group);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dropdown-option";
      button.role = "option";
      button.id = control.popup.id + "-option-" + control.popup.children.length;
      button.textContent = option.textContent;
      if (control.select.id === "font") button.style.fontFamily = option.value;
      button.disabled =
        option.disabled || option.parentElement.disabled === true;
      button.dataset.value = option.value;
      button.setAttribute("aria-selected", String(option.selected));
      button.onmousedown = (e) => e.preventDefault();
      button.onclick = () => {
        control.select.value = option.value;
        control.paint();
        control.select.dispatchEvent(
          new window.Event("change", { bubbles: true }),
        );
        close();
        control.trigger.focus();
      };
      control.popup.append(button);
    }
    document.body.append(control.popup);
    control.trigger.setAttribute("aria-expanded", "true");
    position();
    highlightOption(Math.max(0, control.select.selectedIndex));
  }
  function enhance(select) {
    if (controls.has(select)) return;
    const shell = document.createElement("span");
    shell.className = "select-shell";
    shell.dataset.selectId = select.id;
    const width = select.getBoundingClientRect().width;
    if (width) shell.style.width = width + "px";
    select.before(shell);
    shell.append(select);
    select.classList.add("native-select");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "dropdown-trigger";
    trigger.role = "combobox";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute(
      "aria-label",
      select.getAttribute("aria-label") ||
        select.labels?.[0]?.textContent ||
        "选择",
    );
    const label = document.createElement("span");
    label.className = "dropdown-label";
    trigger.append(label);
    shell.append(trigger);
    const popup = document.createElement("div");
    popup.className = "dropdown-popup";
    popup.role = "listbox";
    popup.id = (select.id || "select-" + controls.size) + "-popup";
    trigger.setAttribute("aria-controls", popup.id);
    const control = { select, trigger, popup, label };
    controls.set(select, control);
    const paint = () => {
      label.textContent = select.selectedOptions[0]?.textContent || "";
      if (select.id === "font") label.style.fontFamily = select.value;
      trigger.title = label.textContent;
      trigger.disabled = select.disabled;
    };
    control.paint = paint;
    select.addEventListener("change", paint);
    new window.MutationObserver(paint).observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "selected", "label"],
    });
    trigger.onclick = () => (opened === control ? close() : open(control));
    trigger.onkeydown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing)
        return;
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "Home",
          "End",
          "Enter",
          " ",
          "Escape",
        ].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key === "Escape") {
        close();
        return;
      }
      if (!opened || opened !== control) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key))
          open(control);
        return;
      }
      const options = [...popup.querySelectorAll("[role=option]")];
      if (event.key === "ArrowDown") highlightOption(highlight + 1);
      else if (event.key === "ArrowUp") highlightOption(highlight - 1);
      else if (event.key === "Home") highlightOption(0);
      else if (event.key === "End") highlightOption(options.length - 1);
      else if (["Enter", " "].includes(event.key)) options[highlight]?.click();
      else if (event.key.length === 1) {
        clearTimeout(searchTimer);
        search += event.key.toLowerCase();
        const index = options.findIndex((o) =>
          o.textContent.toLowerCase().startsWith(search),
        );
        if (index >= 0) highlightOption(index);
        searchTimer = setTimeout(() => (search = ""), 700);
      }
    };
    paint();
  }
  for (const select of root.querySelectorAll("select")) enhance(select);
  document.addEventListener("mousedown", (event) => {
    if (
      opened &&
      !opened.popup.contains(event.target) &&
      !opened.trigger.contains(event.target)
    )
      close();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (opened && !opened.popup.contains(event.target)) close();
    },
    true,
  );
  window.addEventListener("resize", close);
  window.addEventListener("blur", close);
  const observer = new window.MutationObserver((mutations) => {
    for (const m of mutations)
      for (const node of m.addedNodes)
        if (node.nodeType === 1) {
          if (node.matches("select")) enhance(node);
          for (const s of node.querySelectorAll("select")) enhance(s);
        }
  });
  observer.observe(root, { childList: true, subtree: true });
  return {
    close,
    sync() {
      for (const control of controls.values()) control.paint();
    },
  };
}
