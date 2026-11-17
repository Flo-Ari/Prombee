import { useLayoutEffect, useRef } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { Entry } from "../types/workspace";

export interface EntryActions {
  bindContent(node: Entry, content: HTMLDivElement): void;
  bindRow(node: Entry, row: HTMLElement, handle: HTMLButtonElement): void;
  select(node: Entry, checked: boolean, row: HTMLElement): void;
  fold(node: Entry): void;
  add(node: Entry, anchor: HTMLButtonElement): void;
  exclude(node: Entry): void;
  remove(node: Entry): void;
  copy(node: Entry): void;
  start(): void;
  title(label: string, action: string): string;
}
export interface EntriesProps {
  nodes: Entry[];
  folded: Set<string>;
  visibility: Map<string, { excluded: boolean; inherited: boolean }>;
  selected: Set<string>;
  multi: boolean;
  common: boolean;
  emptyLabel: string;
  actions: EntryActions;
}

function EntryRow({ node, state }: { node: Entry; state: EntriesProps }) {
  const row = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { actions, selected } = state;
  const flags = state.visibility.get(node.id)!;
  useLayoutEffect(() => {
    // The controller owns the editable subtree so IME, native undo, selection and
    // rich paste retain their existing semantics. React never rewrites keystrokes.
    actions.bindContent(node, content.current!);
    actions.bindRow(node, row.current!, handle.current!);
  }, []);
  return (
    <section
      ref={row}
      className={[
        "row",
        node.kind === "heading" ? `heading h${node.level}` : "item",
        selected.has(node.id) ? "batch-selected" : "",
        flags.excluded ? "excluded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-id={node.id}
      hidden={state.folded.has(node.id)}
    >
      <div className="row-leading">
        <button
          ref={handle}
          className="drag-handle"
          aria-label="拖动排序"
          title={actions.title("拖动排序", "drag")}
        >
          ⠿
        </button>
        {state.multi && (
          <input
            type="checkbox"
            defaultChecked={selected.has(node.id)}
            aria-label="选择此条目"
            ref={(input) => {
              if (input)
                input.onchange = () =>
                  actions.select(node, input.checked, row.current!);
            }}
          />
        )}
        {node.kind === "heading" ? (
          <button
            className="fold"
            aria-label={node.collapsed ? "展开此层级" : "折叠此层级"}
            aria-expanded={!node.collapsed}
            title={actions.title(node.collapsed ? "展开" : "折叠", "fold")}
            onClick={() => actions.fold(node)}
          >
            {node.collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="fold-spacer" />
        )}
        <span className="marker" aria-hidden="true" />
      </div>
      <div
        ref={content}
        className="content"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-id={node.id}
        data-placeholder={
          node.kind === "heading" ? "标题正文" : "写下一条要求…"
        }
        role="textbox"
        aria-multiline="true"
        aria-label={
          node.kind === "heading" ? `H${node.level} 条目` : "正文条目"
        }
      />
      <div className="row-controls">
        {state.common && (
          <button
            className="row-action copy-branch"
            title="复制当前条目及其子层级（含 Markdown 标题）"
            aria-label="复制此条目及其子层级"
            onClick={() => actions.copy(node)}
          >
            复制
          </button>
        )}
        <button
          className="add-heading"
          title={actions.title("添加", "insert")}
          aria-label="添加"
          onClick={(event) => actions.add(node, event.currentTarget)}
        >
          ＋
        </button>
        <button
          className="row-action eye"
          aria-label="排除"
          aria-pressed={flags.excluded}
          title={actions.title("排除", "exclude")}
          disabled={flags.inherited}
          onClick={() => actions.exclude(node)}
        >
          {flags.excluded ? (
            <svg viewBox="0 0 24 24">
              <path d="M3 3l18 18M10 5c5-1 9 3 12 7-1 2-3 4-5 5M7 7c-3 1-5 3-7 5 3 4 7 7 12 7 2 0 3 0 4-1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
        <button
          className="row-action remove"
          aria-label="删除"
          title={actions.title("删除", "delete")}
          onClick={() => actions.remove(node)}
        >
          <svg viewBox="0 0 24 24">
            <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
          </svg>
        </button>
      </div>
    </section>
  );
}

export function EditorEntries(props: EntriesProps) {
  return (
    <>
      {props.nodes.map((node) => (
        <EntryRow key={node.id} node={node} state={props} />
      ))}
      {!props.nodes.length && (
        <div className="empty-document">
          <button onClick={props.actions.start}>{props.emptyLabel}</button>
        </div>
      )}
    </>
  );
}

const roots = new WeakMap<HTMLElement, { root: Root; generation: number }>();
export function renderEntries(paper: HTMLElement, props: EntriesProps): void {
  let mounted = roots.get(paper);
  if (!mounted) {
    // A portal keeps row sections direct children of #paper alongside its native
    // resize handles, without a layout-changing wrapper or a second DOM owner.
    mounted = {
      root: createRoot(document.createElement("div")),
      generation: 0,
    };
    roots.set(paper, mounted);
  }
  const current = mounted;
  flushSync(() =>
    current.root.render(
      createPortal(
        <EditorEntries key={++current.generation} {...props} />,
        paper,
      ),
    ),
  );
}
