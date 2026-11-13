const reference = (a) =>
  `[${a.name.replace(/[\[\]]/g, "")}](${new URL("file://" + (a.path.startsWith("/") ? "" : "/") + a.path.replace(/\\/g, "/")).href.replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
export function mountAttachments({
  getDoc,
  editable,
  remember,
  changed,
  notify,
  copyReference = async (text) => navigator.clipboard.writeText(text),
}) {
  const gallery = document.createElement("nav");
  gallery.id = "attachmentGallery";
  gallery.setAttribute("aria-label", "附件画廊");
  document.body.append(gallery);
  let busy = false;
  async function upload(file) {
    const r = await fetch(
      "/api/attachments/upload?name=" + encodeURIComponent(file.name),
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
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
    gallery.hidden = !editable();
    gallery.replaceChildren();
    if (gallery.hidden) return;
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
    gallery.append(add);
    for (const asset of getDoc().attachments || []) {
      const card = document.createElement("div");
      card.className = "attachment-card";
      card.title = asset.name + "\n" + asset.path;
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
      copy.title = "复制此文件的 Markdown 引用地址";
      copy.onclick = async () => {
        try {
          await copyReference(reference(asset));
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
      gallery.append(card);
    }
  }
  async function clipboardPaths() {
    if (window.pywebview?.api?.clipboard_files)
      return window.pywebview.api.clipboard_files();
    if (!window.webkit?.messageHandlers?.clipboardFiles) return [];
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      let timer;
      const done = (e) => {
        if (e.detail?.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("prombee-clipboard-files", done);
        resolve(e.detail.paths || []);
      };
      window.addEventListener("prombee-clipboard-files", done);
      timer = setTimeout(() => {
        window.removeEventListener("prombee-clipboard-files", done);
        resolve([]);
      }, 1500);
      window.webkit.messageHandlers.clipboardFiles.postMessage(
        JSON.stringify({ id }),
      );
    });
  }
  async function syncReferences(text, collection = getDoc()) {
    if (!text?.includes("file://")) return;
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
      ["application/x-prombee-attachment", "Files"].includes(type),
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
      await paste(
        { clipboardData: event.dataTransfer, preventDefault() {} },
        content,
        node,
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
  async function paste(event, content, node) {
    const files = [...(event.clipboardData?.files || [])],
      text = event.clipboardData?.getData("text/plain") || "";
    // Large fenced code remains intact as a text attachment instead of flooding one line.
    if (!files.length && text.length >= 20000 && /^\s*```/.test(text))
      files.push(
        new File([text], "代码-" + Date.now() + ".txt", { type: "text/plain" }),
      );
    const native =
      window.pywebview?.api?.clipboard_files ||
      window.webkit?.messageHandlers?.clipboardFiles;
    if (!files.length && text.includes("file://")) {
      await syncReferences(text);
      return false;
    }
    if (!files.length && !native) return false;
    event.preventDefault();
    const collection = getDoc(),
      range = window.getSelection()?.rangeCount
        ? window.getSelection().getRangeAt(0).cloneRange()
        : null;
    try {
      const assets = [];
      for (const file of files) assets.push(await upload(file));
      if (!files.length) {
        const paths = await clipboardPaths();
        if (!paths.length) return false;
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
      const pasted = event.clipboardData?.getData("text/plain") || "";
      const text =
        (pasted && !/^\s*file:/i.test(pasted) ? pasted + "\n" : "") +
        assets.map(reference).join("\n");
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
        (/^\s*```/.test(event.clipboardData?.getData("text/plain") || "") &&
          (event.clipboardData?.getData("text/plain") || "").length >= 20000)
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
