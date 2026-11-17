import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AppShell } from "./components/AppShell";
import "./editor/diagnostics";

// Mount once: browser contenteditable and native selections own the text nodes.
// React owns the shell and entry components; controller mutations never rerender it.
const container = document.getElementById("root");
if (!container) throw new Error("Missing Prombee root");
flushSync(() => createRoot(container).render(<AppShell />));
await Promise.all([import("./editor/app"), import("./editor/desktop-chrome")]);
