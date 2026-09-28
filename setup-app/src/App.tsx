/**
 * NOBODY Installer Suite — V1.5.1 (V3 dynamic pass)
 * ---------------------------------------------------------------------------
 * A runnable, spec-accurate preview of the custom Windows Setup.exe UI, plus a
 * viewer for the actual NSIS deliverables that produce the real artifact.
 *
 *   pages    welcome · license · destination · installing · finish
 *            + uninstaller: confirm · progress · farewell
 *   langs    fa (mirrored) · en · tr · ru
 *   shell    borderless 980×640, own title bar, own min/close, own modals
 *
 * V3: page changes are choreographed — a light sweep crosses the content and
 * the new page enters directionally (forward from the end edge, back from the
 * start edge, mirrored automatically in Farsi).
 *
 * The NSIS script this mirrors lives at build/installer.nsi.
 */
import { useEffect, useRef, useState } from "react";
import Deliverables from "@/deliverables/Deliverables";
import { t, tl } from "@/installer/i18n";
import { useSetup, SetupProvider } from "@/installer/useSetup";
import Destination from "@/installer/pages/Destination";
import Finish from "@/installer/pages/Finish";
import Installing from "@/installer/pages/Installing";
import License from "@/installer/pages/License";
import Uninstall from "@/installer/pages/Uninstall";
import Welcome from "@/installer/pages/Welcome";
import QaPanel from "@/qa/QaPanel";
import { SetupWindow } from "@/ui/Window";
import { PageSweep } from "@/ui/dynamics";
import { Button, Modal } from "@/ui/kit";

/** Route order — used to work out whether a change is forward or back. */
const ORDER: Record<string, number> = {
  "setup:welcome": 0,
  "setup:license": 1,
  "setup:destination": 2,
  "setup:installing": 3,
  "setup:finish": 4,
  "un:confirm": 10,
  "un:progress": 11,
  "un:done": 12,
};

function Page() {
  const s = useSetup();
  if (s.mode === "uninstall") return <Uninstall />;
  switch (s.page) {
    case "license":
      return <License />;
    case "destination":
      return <Destination />;
    case "installing":
      return <Installing />;
    case "finish":
      return <Finish />;
    default:
      return <Welcome />;
  }
}

/** The three custom modals. Nothing here is MessageBox. */
function Dialogs() {
  const s = useSetup();
  if (s.dialog === "quit") {
    return (
      <Modal
        title={t(s.lang, "dlg.quitTitle")}
        body={t(s.lang, "dlg.quitBody")}
        onClose={s.closeDialog}
      >
        <Button onClick={s.closeDialog} autoFocus>
          {t(s.lang, "dlg.stay")}
        </Button>
        <Button variant="danger" onClick={s.confirmDialog}>
          {t(s.lang, "dlg.leave")}
        </Button>
      </Modal>
    );
  }
  if (s.dialog === "cancel") {
    return (
      <Modal
        title={t(s.lang, "dlg.cancelTitle")}
        body={t(s.lang, "dlg.cancelBody")}
        onClose={s.closeDialog}
        danger
      >
        <Button onClick={s.closeDialog} autoFocus>
          {t(s.lang, "dlg.keepGoing")}
        </Button>
        <Button variant="danger" onClick={s.confirmDialog}>
          {t(s.lang, "dlg.stopInstall")}
        </Button>
      </Modal>
    );
  }
  if (s.dialog === "browse") {
    return <BrowseDialog />;
  }
  return null;
}

function BrowseDialog() {
  const s = useSetup();
  const roots = tl(s.lang, "browseRoots");
  const value = s.installDir;
  const setValue = s.setInstallDir;
  return (
    <Modal title={t(s.lang, "dest.browseTitle")} body="" onClose={s.closeDialog}>
      <div className="nb-scroll -mx-1 mb-4 max-h-[168px] overflow-y-auto px-1">
        {roots.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setValue(r)}
            className="nb-focus nb-font-mono flex w-full items-center gap-3 rounded-lg py-2 text-start text-[11px] transition-colors hover:bg-white/[0.04]"
            style={{ color: value === r ? "#FF9EC4" : "#A9A3B4" }}
          >
            <span className="text-[10px]" style={{ color: value === r ? "#FF2D78" : "#3A3440" }}>
              ▸
            </span>
            {r}
          </button>
        ))}
      </div>
      <input
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        className="nb-focus nb-font-mono mb-5 h-10 w-full rounded-[10px] border border-white/[0.09] bg-white/[0.028] px-3 text-[11.5px] text-nb-ink outline-none focus:border-nb-a1/50"
        aria-label={t(s.lang, "dest.label")}
      />
      <div className="flex items-center justify-end gap-2">
        <Button onClick={s.closeDialog}>{t(s.lang, "inst.cancel")}</Button>
        <Button
          variant="primary"
          autoFocus
          onClick={async () => {
            // real mode: hand the pick to the native directory chooser and
            // adopt what it returns; dev fallback keeps the typed value.
            const picked = await s.chooseDir(value);
            if (picked != null && picked.length > 0) setValue(picked);
            s.closeDialog();
          }}
        >
          {t(s.lang, "dest.browse")}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Directional page stage. React unmounts a keyed child instantly, so a true
 * exit animation would need the old page kept alive; instead a light sweep
 * crosses the content on every change and the new page enters directionally.
 * The eye follows the sweep, and the swap never reads as a hard cut.
 */
function PageStage() {
  const s = useSetup();
  const key = s.mode === "uninstall" ? `un:${s.unPage}` : `setup:${s.page}`;
  const prev = useRef(key);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    if (prev.current === key) return;
    const a = ORDER[prev.current] ?? 0;
    const b = ORDER[key] ?? 0;
    setDir(b >= a ? 1 : -1);
    prev.current = key;
  }, [key]);

  // in a mirrored layout "forward" comes from the other side
  const x = dir * (s.dir === "rtl" ? -1 : 1);

  return (
    <>
      <div
        key={key}
        className="nb-page h-full"
        style={{ ["--nb-page-x" as string]: x } as React.CSSProperties}
      >
        <Page />
      </div>
      <PageSweep trigger={key} rtl={s.dir === "rtl"} />
    </>
  );
}

function Shell() {
  const s = useSetup();
  /* The QA + Deliverables panels are the harness's own test instruments, not
     installer pages: keep them in the browser preview (no bridge) and in a
     devMode build, never in a packaged real install. */
  const harnessAllowed = !s.hasApi || s.ctx?.devMode === true;
  return (
    <>
      <SetupWindow>
        <PageStage />
        <Dialogs />
      </SetupWindow>
      {harnessAllowed && <QaPanel />}
      {harnessAllowed && s.deliverablesOpen && (
        <Deliverables onClose={() => s.setDeliverablesOpen(false)} />
      )}
    </>
  );
}

export default function App() {
  return (
    <SetupProvider>
      <Shell />
    </SetupProvider>
  );
}
