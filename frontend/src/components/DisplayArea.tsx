import { OtherSurface } from "./OtherSurface";
import { FloatingSurface } from "./FloatingSurface";
import { UpdatesSurface } from "./UpdatesSurface";
import { ShortcutsSurface } from "./ShortcutsSurface";
import { LibrarySurface } from "./LibrarySurface";
import { EditorSurface } from "./EditorSurface";
import { PreviewSurface } from "./PreviewSurface";
import { HistorySurface } from "./HistorySurface";
export function DisplayArea() {
  return (
    <main>
      <OtherSurface />
      <FloatingSurface />
      <UpdatesSurface />
      <ShortcutsSurface />
      <LibrarySurface />
      <EditorSurface />
      <PreviewSurface />
      <HistorySurface />
    </main>
  );
}
