// ── NOBODY ALOK · import actions (shared by dock + panel CTA) ────────────────

import { uiApi } from "../../cinema/store/ui";
import { importFiles, importViaFilesPicker, importViaFolderPicker, pickFiles } from "../../cinema/lib/importer";

type TFn = (k: string) => string;

/** Run the standard "files" import and toast the outcome.
 *  V1.2.0: in the desktop app this opens the NATIVE file dialog and imports
 *  through the classic real-path pipeline (works in the packaged installer). */
export async function importViaPicker(t: TFn): Promise<void> {
  const res = await importViaFilesPicker(t("importing"));
  if (res.added) {
    uiApi.toast(
      `${res.added} ${t("addedToLibrary")}${res.skipped ? ` · ${res.skipped} ${t("alreadyInLibrary")}` : ""}`,
      "success"
    );
  }
}

/** Run the "folder" import with the Chromium fallback path.
 *  V1.2.0: native folder dialog + real-path pipeline in the desktop app. */
export async function importViaFolder(t: TFn): Promise<void> {
  const res = await importViaFolderPicker(t("importing"));
  if (res === null) {
    uiApi.toast(t("folderFallback"), "info");
    const files = await pickFiles(true, true);
    if (files.length) await importFiles(files, undefined, t("importing"));
    return;
  }
  if (res.added) {
    uiApi.toast(
      `${res.added} ${t("addedToLibrary")}${res.skipped ? ` · ${res.skipped} ${t("alreadyInLibrary")}` : ""}`,
      "success"
    );
  }
}
