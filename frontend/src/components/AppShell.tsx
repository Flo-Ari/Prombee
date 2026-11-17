import { WindowHeader } from "./WindowHeader";
import { EditorToolbar } from "./EditorToolbar";
import { PreviewToolbar } from "./PreviewToolbar";
import { HistoryToolbar } from "./HistoryToolbar";
import { SettingsToolbar } from "./SettingsToolbar";
import { DisplayArea } from "./DisplayArea";
import { StatusFooter } from "./StatusFooter";
import { HeadingMenu } from "./HeadingMenu";
import { Toast } from "./Toast";
export function AppShell() {
  return (
    <>
      <WindowHeader />
      <div className="workspace">
        <aside className="tool-rail app-bar" aria-label="页面工具栏">
          <EditorToolbar />
          <PreviewToolbar />
          <HistoryToolbar />
          <SettingsToolbar />
        </aside>
        <DisplayArea />
      </div>
      <StatusFooter />
      <HeadingMenu />
      <Toast />
    </>
  );
}
