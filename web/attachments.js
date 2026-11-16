const reference = (a) => a.name;
const longText = (text) => text.replace(/\r\n?/g, "\n").split("\n").length > 20;
export function mountAttachments({
  getDoc,
  editable,
  remember,
  changed,
  notify,
  dropTarget = () => null,
  copyReference = async (text) => navigator.clipboard.writeText(text),
}) {
  const gallery = document.createElement("nav");
  gallery.id = "attachmentGallery";
  gallery.setAttribute("aria-label", "附件画廊");
  document.body.append(gallery);
  let busy = false,
    collapsed = false;
  async function upload(file, temporary = false) {
    const r = await fetch(
      "/api/attachments/upload?name=" +
        encodeURIComponent(file.name) +
        (temporary ? "&temporary=1" : ""),
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
        signal: AbortSignal.timeout(60000),
      },
    );
    const value = await r.json();
    if (!r.ok) throw Error(value.error || "附件添加失败");
    return value;
  }
  function register(collection, assets) {
    assets = assets.filter(
      (a) =>
        !(collection.attachments || []).some(
          (existing) => existing.id === a.id,
        ),
    );
    if (!assets.length) return;
    if (getDoc() === collection) remember();
    collection.attachments = [...(collection.attachments || []), ...assets];
    changed();
    paint();
  }
  function paint() {
    document.body.classList.toggle("with-attachments", editable());
    document.body.classList.toggle("attachments-collapsed", collapsed);
    gallery.classList.toggle("collapsed", collapsed);
    gallery.hidden = !editable();
    gallery.replaceChildren();
    if (gallery.hidden) return;
    const list = document.createElement("div");
    list.className = "attachment-items";
    list.id = "attachmentItems";
    list.hidden = collapsed;
    gallery.append(list);
    const add = document.createElement("button");
    add.className = "attachment-add";
    add.textContent = "＋";
    add.title = "添加附件：选择本机文件，复制提示词时一并提供";
    add.setAttribute("aria-label", "添加附件");
    add.disabled = busy;
    add.onclick = async () => {
      const collection = getDoc();
      busy = true;
      paint();
      try {
        const r = await fetch("/api/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pick" }),
        });
        const result = await r.json();
        if (!r.ok) throw Error(result.error);
        if (result.attachment) register(collection, [result.attachment]);
      } catch (e) {
        notify(e.message);
      } finally {
        busy = false;
        paint();
      }
    };
    list.append(add);
    for (const asset of getDoc().attachments || []) {
      const card = document.createElement("div");
      card.className = "attachment-card";
      card.title =
        asset.name +
        (asset.temporary ? "\n临时附件 · 退出后清理 · 右键另存为" : "");
      card.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        showContextMenu(asset, event);
      });
      card.draggable = true;
      card.dataset.attachmentId = asset.id;
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData(
          "application/x-prombee-attachment",
          asset.id,
        );
        event.dataTransfer.setData("text/plain", reference(asset));
        event.dataTransfer.effectAllowed = "copy";
      });
      if (asset.type?.startsWith("image/")) {
        const image = document.createElement("img");
        image.src = "/api/attachments/" + asset.id;
        image.alt = asset.name;
        image.loading = "lazy";
        image.decoding = "async";
        card.append(image);
      } else {
        const icon = document.createElement("span");
        icon.className = "attachment-kind";
        icon.textContent = asset.type?.startsWith("video/")
          ? "▶"
          : asset.type?.startsWith("text/")
            ? "〈/〉"
            : "▤";
        card.append(icon);
      }
      const label = document.createElement("span");
      label.textContent = asset.name;
      card.append(label);
      const actions = document.createElement("div");
      actions.className = "attachment-actions";
      const copy = document.createElement("button");
      copy.className = "attachment-reference";
      copy.textContent = "复制引用";
      copy.title = "复制此附件的文件名";
      copy.onclick = async () => {
        try {
          await copyReference(asset.name);
        } catch (error) {
          notify(error.message);
        }
      };
      actions.append(copy);
      const remove = document.createElement("button");
      remove.className = "attachment-remove";
      remove.textContent = "×";
      remove.title = "移出本轮附件（保留文件和已有引用）";
      remove.onclick = () => {
        remember();
        getDoc().attachments = getDoc().attachments.filter(
          (a) => a.id !== asset.id,
        );
        changed();
        paint();
      };
      actions.append(remove);
      card.append(actions);
      list.append(card);
    }
    const toggle = document.createElement("button");
    toggle.className = "attachment-toggle";
    toggle.textContent = collapsed ? "▴" : "▾";
    toggle.title = collapsed ? "展开附件栏" : "收起附件栏";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-controls", "attachmentItems");
    toggle.onclick = () => {
      collapsed = !collapsed;
      paint();
    };
    gallery.append(toggle);
  }
  function showContextMenu(asset, event) {
    document.querySelector(".attachment-menu")?.remove();
    const menu = document.createElement("div");
    menu.className = "attachment-menu";
    menu.role = "menu";
    const save = document.createElement("button");
    save.textContent = "另存为";
    save.role = "menuitem";
    save.onclick = async () => {
      menu.remove();
      try {
        const response = await fetch("/api/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "saveAs", id: asset.id }),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
      } catch (error) {
        notify(error.message);
      }
    };
    menu.append(save);
    document.body.append(menu);
    menu.style.left =
      Math.max(
        8,
        Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8),
      ) + "px";
    menu.style.top =
      Math.max(
        8,
        Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8),
      ) + "px";
    save.focus();
  }
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".attachment-menu"))
      document.querySelector(".attachment-menu")?.remove();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape")
      document.querySelector(".attachment-menu")?.remove();
  });
  async function clipboardPaths() {
    if (window.pywebview?.api?.clipboard_files)
      return window.pywebview.api.clipboard_files();
    if (!window.webkit?.messageHandlers?.clipboardFiles) return [];
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      let timer;
      const done = (e) => {
        if (e.detail?.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("prombee-clipboard-files", done);
        if (e.detail.error) reject(Error(e.detail.error));
        else resolve(e.detail.paths || []);
      };
      window.addEventListener("prombee-clipboard-files", done);
      timer = setTimeout(() => {
        window.removeEventListener("prombee-clipboard-files", done);
        reject(Error("读取剪贴板超时，请重试或使用添加附件"));
      }, 17000);
      window.webkit.messageHandlers.clipboardFiles.postMessage(
        JSON.stringify({ id }),
      );
    });
  }
  async function syncReferences(text, collection = getDoc()) {
    if (!text) return;
    const response = await fetch("/api/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "references", text }),
    });
    if (response.ok) {
      const result = await response.json();
      register(collection, result.attachments || []);
    }
  }
  document.addEventListener("copy", (event) => {
    const selection = window.getSelection(),
      paper = document.getElementById("paper");
    if (!selection?.rangeCount || !paper?.contains(selection.anchorNode))
      return;
    const text =
      event.clipboardData?.getData("text/plain") || selection.toString();
    syncReferences(text).catch((error) => notify(error.message));
  });
  function acceptsDrop(event) {
    return [...(event.dataTransfer?.types || [])].some((type) =>
      ["application/x-prombee-attachment", "Files", "text/uri-list"].includes(
        type,
      ),
    );
  }
  async function drop(event, content, node) {
    if (!acceptsDrop(event)) return;
    event.preventDefault();
    const collection = getDoc(),
      id = event.dataTransfer.getData("application/x-prombee-attachment");
    let range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!range && document.caretPositionFromPoint) {
      const point = document.caretPositionFromPoint(
        event.clientX,
        event.clientY,
      );
      if (point) {
        range = document.createRange();
        range.setStart(point.offsetNode, point.offset);
        range.collapse(true);
      }
    }
    if (!range || !content.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
    }
    content.focus();
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    if (!id) {
      const paths = (event.dataTransfer.getData("text/uri-list") || "")
        .split(/\r?\n/)
        .flatMap((uri) => {
          try {
            const url = new URL(uri);
            if (
              url.protocol !== "file:" ||
              !["", "localhost"].includes(url.hostname)
            )
              return [];
            let path = decodeURIComponent(url.pathname);
            if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
            return [path];
          } catch {
            return [];
          }
        });
      if (!event.dataTransfer.files?.length && !paths.length) {
        notify("请拖入图片文件，或复制图片后粘贴");
        return;
      }
      await paste(
        { clipboardData: event.dataTransfer, preventDefault() {} },
        content,
        node,
        paths,
      );
      return;
    }
    try {
      const response = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", ids: [id] }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      const asset = result.attachments[0];
      register(collection, [asset]);
      remember();
      if (getDoc() === collection && content.isConnected) {
        const value = document.createTextNode(reference(asset));
        range.deleteContents();
        range.insertNode(value);
        range.setStartAfter(value);
        range.collapse(true);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        content.dispatchEvent(new window.Event("input", { bubbles: true }));
      } else {
        const span = document.createElement("span");
        span.textContent = reference(asset);
        node.html += "\n" + span.innerHTML;
        changed();
      }
    } catch (error) {
      notify(error.message);
    }
  }
  const surface =
    document.querySelector("main") || document.getElementById("paper");
  surface?.addEventListener("dragover", (event) => {
    if (editable() && acceptsDrop(event)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });
  surface?.addEventListener("drop", (event) => {
    if (event.defaultPrevented || !editable() || !acceptsDrop(event)) return;
    event.preventDefault();
    const target = dropTarget(event);
    if (target) drop(event, target.content, target.node);
  });
  async function paste(event, content, node, suppliedPaths = null) {
    const files = [...(event.clipboardData?.files || [])],
      clipboardText = event.clipboardData?.getData("text/plain") || "";
    // Keep the original copied text intact; only the paste becomes a temporary TXT.
    const temporary = !files.length && longText(clipboardText);
    if (temporary)
      files.push(
        new File([clipboardText], "粘贴内容.txt", { type: "text/plain" }),
      );
    const native =
      window.pywebview?.api?.clipboard_files ||
      window.webkit?.messageHandlers?.clipboardFiles;
    if (!files.length && !native && !suppliedPaths?.length) return false;
    event.preventDefault();
    const collection = getDoc(),
      range = window.getSelection()?.rangeCount
        ? window.getSelection().getRangeAt(0).cloneRange()
        : null;
    try {
      const assets = [];
      for (const file of files) assets.push(await upload(file, temporary));
      if (!files.length) {
        const paths = suppliedPaths || (await clipboardPaths());
        if (!paths.length) {
          await syncReferences(clipboardText, collection);
          return false;
        }
        const response = await fetch("/api/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "paths", paths }),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        assets.push(...result.attachments);
      }
      register(collection, assets);
      const text = assets.map(reference).join("\n");
      if (
        getDoc() === collection &&
        content.isConnected &&
        range &&
        content.contains(range.commonAncestorContainer)
      ) {
        remember();
        range.deleteContents();
        const value = document.createTextNode(text);
        range.insertNode(value);
        range.setStartAfter(value);
        range.collapse(true);
        content.focus();
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        content.dispatchEvent(new window.Event("input", { bubbles: true }));
      } else {
        const span = document.createElement("span");
        span.textContent = text;
        node.html += "\n" + span.innerHTML;
        changed();
      }
    } catch (e) {
      notify(e.message);
    }
    return true;
  }
  return {
    paint,
    paste,
    drop,
    acceptsDrop,
    syncReferences,
    hasPaste(event) {
      return (
        event.clipboardData?.getData("text/plain")?.includes("file://") ||
        !!window.pywebview?.api?.clipboard_files ||
        !!window.webkit?.messageHandlers?.clipboardFiles ||
        !!event.clipboardData?.files?.length ||
        longText(event.clipboardData?.getData("text/plain") || "")
      );
    },
    bundle(text) {
      const assets = getDoc().attachments || [];
      return {
        text:
          text +
          assets
            .filter(
              (a) => !text.includes(a.path) && !text.includes(reference(a)),
            )
            .map((a) => "\n\n" + reference(a))
            .join(""),
        files: assets.map((a) => a.id),
      };
    },
  };
}
