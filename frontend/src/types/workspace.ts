/** The on-disk TXT schema is intentionally unchanged by the framework migration. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export interface Entry {
  id: string;
  kind: "heading" | "item";
  level: number;
  html: string;
  excluded?: boolean;
  collapsed?: boolean;
  raw?: boolean;
  listType?: "ordered" | "unordered" | "none";
}
export interface Attachment {
  id: string;
  name: string;
  path: string;
  type: string;
  size?: number;
  temporary?: boolean;
  originalName?: string;
}
export interface Collection {
  id: string;
  name: string;
  nodes: Entry[];
  attachments?: Attachment[];
  copied?: boolean;
  fromText?: boolean;
}
export interface Workspace {
  documents: Collection[];
  current: string | null;
  template: Collection;
  common: Collection;
  dark: boolean;
  font: string;
  size: number;
  excludeEmpty?: boolean;
  [preference: string]: unknown;
}
export interface WorkspaceEnvelope {
  revision: number;
  state: Workspace;
  fingerprint?: string;
  set?: { id: string; name: string; path: string };
}
