/**
 * The installer brain.
 *
 * Mirrors the runtime flow of build/installer.nsi: five setup pages, three
 * uninstaller pages, one custom modal instead of MessageBox, and a progress
 * engine that walks an actual file list instead of easing a number from 0 to
 * 100.
 *
 * TWO ENGINES, ONE STATE SHAPE:
 *  · real mode  — window.nobodySetup (shared/contract.ts) is present. Every
 *    action is forwarded to the Electron main process and the identical
 *    Progress interface is fed by byte-exact ProgressEvents from the copy
 *    loop. The rAF simulators below never run.
 *  · dev fallback — no bridge (plain `bun run dev` in a browser). The
 *    deterministic payload simulation walks SIM_PAYLOAD exactly like the
 *    design preview did. Pages cannot tell the two apart.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  SETUP_API_NAME,
  type SetupApi,
  type SetupContext,
  type SetupEvent,
} from "@shared/contract";
import { detectLang, dirOf, type Lang } from "./i18n";
import { PAYLOAD, readJitter, setRealPayload, TOTAL_BYTES } from "./payload";

export type Page = "welcome" | "license" | "destination" | "installing" | "finish";
export type UnPage = "confirm" | "progress" | "done";
export type DialogKind = "quit" | "cancel" | "browse" | null;
export type WinState = "normal" | "minimized" | "closed";

export interface Progress {
  frac: number; // 0..1 — what the bar shows
  bytes: number;
  total: number;
  file: string;
  fileIndex: number;
  phase: number; // 0..5
  rate: number; // bytes / s
  elapsedMs: number;
  running: boolean;
  done: boolean;
  /** last ~48 real rate samples, for the sparkline */
  hist: number[];
}

const IDLE: Progress = {
  frac: 0,
  bytes: 0,
  total: TOTAL_BYTES,
  file: "",
  fileIndex: 0,
  phase: 0,
  rate: 0,
  elapsedMs: 0,
  running: false,
  done: false,
  hist: [],
};

/** cumulative byte offsets, so a byte count maps to a file index in O(1) */
const OFFSETS: number[] = (() => {
  const a: number[] = [];
  let acc = 0;
  for (const f of PAYLOAD) {
    a.push(acc);
    acc += f.size;
  }
  return a;
})();

const BASE_RATE = 22 * 1024 * 1024; // ≈10 s of extraction at 1×
const POST_STAGES = [
  { phase: 4, ms: 780 }, // Writing shortcuts
  { phase: 5, ms: 620 }, // Registering uninstaller
];

/** The contextBridge handle, or null in a plain browser (dev fallback). */
function detectSetupApi(): SetupApi | null {
  const cand = (window as unknown as Record<string, unknown>)[SETUP_API_NAME];
  if (
    cand &&
    typeof cand === "object" &&
    typeof (cand as SetupApi).getContext === "function"
  ) {
    return cand as SetupApi;
  }
  return null;
}

export interface Setup {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  page: Page;
  next: () => void;
  back: () => void;
  dialog: DialogKind;
  openDialog: (d: Exclude<DialogKind, null>) => void;
  closeDialog: () => void;
  confirmDialog: () => void;
  progress: Progress;
  startInstall: () => void;
  cancelInstall: () => void;
  installDir: string;
  setInstallDir: (v: string) => void;
  scope: "all" | "me";
  setScope: (v: "all" | "me") => void;
  freeMb: number;
  upgrade: boolean;
  options: { run: boolean; desktop: boolean; openFolder: boolean };
  toggleOption: (k: "run" | "desktop" | "openFolder") => void;
  licenseRead: boolean;
  setLicenseRead: (v: boolean) => void;
  licenseAccepted: boolean;
  acceptLicense: () => void;
  win: WinState;
  minimize: () => void;
  restore: () => void;
  closeWindow: () => void;
  restart: () => void;
  mode: "setup" | "uninstall";
  unPage: UnPage;
  launchUninstaller: () => void;
  unNext: () => void;
  unBack: () => void;
  unProgress: Progress;
  keepData: boolean;
  setKeepData: (v: boolean) => void;
  /* QA harness */
  scale: number;
  setScale: (v: number) => void;
  narrow: boolean;
  setNarrow: (v: boolean) => void;
  showDesktop: boolean;
  setShowDesktop: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
  forceUpgrade: boolean;
  setForceUpgrade: (v: boolean) => void;
  deliverablesOpen: boolean;
  setDeliverablesOpen: (v: boolean) => void;
  lowDisk: boolean;
  setLowDisk: (v: boolean) => void;
  /* motion */
  motionOn: boolean;
  setMotionOn: (v: boolean) => void;
  ambient: boolean;
  setAmbient: (v: boolean) => void;
  curtain: number;
  replayCurtain: () => void;
  burst: number;
  fireBurst: () => void;
  atFinish: boolean;
  /** 0..1 — how alive the room should feel. Drives the ambience layer. */
  energy: number;
  /* real pipeline (additive — dev fallback keeps every behaviour above) */
  /** true when window.nobodySetup exists; false in the browser preview. */
  hasApi: boolean;
  /** The SetupContext once getContext() resolves; null until then / in dev. */
  ctx: SetupContext | null;
  /** installError from a failed/aborted real run — surfaced via console only. */
  installError: string | null;
  setInstallError: (v: string | null) => void;
  /** Native directory picker in real mode; null (no-op) in dev fallback. */
  chooseDir: (current: string) => Promise<string | null>;
}

const Ctx = createContext<Setup | null>(null);

export function useSetup(): Setup {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSetup outside <SetupProvider>");
  return v;
}

export function SetupProvider({ children }: { children: ReactNode }) {
  /* the native bridge — detected once; null in a plain browser */
  const [api] = useState<SetupApi | null>(() => detectSetupApi());
  const [ctx, setCtx] = useState<SetupContext | null>(null);
  const [lang, setLangState] = useState<Lang>(() => detectLang());
  const [page, setPage] = useState<Page>("welcome");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [installDir, setInstallDir] = useState("C:\\Program Files\\NOBODY");
  const [scope, setScopeState] = useState<"all" | "me">("all");
  const [options, setOptions] = useState({ run: true, desktop: true, openFolder: false });
  const [licenseRead, setLicenseRead] = useState(false);
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [win, setWin] = useState<WinState>("normal");
  const [mode, setMode] = useState<"setup" | "uninstall">("setup");
  const [unPage, setUnPage] = useState<UnPage>("confirm");
  const [keepData, setKeepData] = useState(true);
  const [progress, setProgress] = useState<Progress>(IDLE);
  const [unProgress, setUnProgress] = useState<Progress>(IDLE);
  const [installError, setInstallError] = useState<string | null>(null);
  /* QA */
  const [scale, setScale] = useState(1);
  const [narrow, setNarrow] = useState(false);
  const [showDesktop, setShowDesktop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [forceUpgrade, setForceUpgrade] = useState(false);
  const [lowDisk, setLowDisk] = useState(false);
  const [deliverablesOpen, setDeliverablesOpen] = useState(false);
  const [motionOn, setMotionOn] = useState(
    () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const [ambient, setAmbient] = useState(true);
  const [curtain, setCurtain] = useState(1);
  const [burst, setBurst] = useState(0);
  /* free space on the target volume — replaced by the real probe (freeBytes
     / 1048576) once the context arrives; lowDisk keeps its QA override */
  const [probedFreeMb, setProbedFreeMb] = useState(386_442);

  const dir = dirOf(lang);
  const upgrade = forceUpgrade || (ctx?.upgrade ?? false);
  const freeMb = lowDisk ? 128 : probedFreeMb;

  /* refs that mirror "which real stream is live" — read by the event
     subscription, written synchronously by the start/cancel actions */
  const installActiveRef = useRef(false);
  const unActiveRef = useRef(false);
  const installHistRef = useRef<number[]>([]);
  const unHistRef = useRef<number[]>([]);
  /* one-shot flag so the Finish button honours run/openFolder exactly once */
  const finishPendingRef = useRef(false);

  /* --------------------------------------------------- real context boot
     One shot per bridge: seed every number the pages render from the real
     SetupContext. Nothing above this point changes for the dev fallback. */
  useEffect(() => {
    if (!api) return;
    let disposed = false;
    api
      .getContext()
      .then((c) => {
        if (disposed) return;
        setCtx(c);
        if (c.freeBytes != null) setProbedFreeMb(Math.floor(c.freeBytes / 1048576));
        if (c.payloadBytes > 0) setRealPayload(c.payloadBytes, Math.max(1, c.payloadFiles));
        if (c.mode === "uninstall") setMode("uninstall"); // straight into unPage "confirm"
        setInstallDir(c.mode === "uninstall" ? c.defaultUserDir : c.defaultAllDir);
      })
      .catch((err) => console.error("[setup] getContext failed:", err));
    return () => {
      disposed = true;
    };
  }, [api]);

  /* ------------------------------------------------------- page navigation */
  const next = useCallback(() => {
    setPage((p) =>
      p === "welcome" ? "license" : p === "license" ? "destination" : p === "destination" ? "installing" : "finish",
    );
  }, []);
  const back = useCallback(() => {
    setPage((p) => (p === "destination" ? "license" : p === "license" ? "welcome" : p));
  }, []);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  /* Switching scope repoints the path — but only if the user is still on one
     of the two defaults, so a hand-typed path is never clobbered. The two
     defaults come from the real context when it exists; the browser preview
     keeps the design's hardcoded values. */
  const setScope = useCallback(
    (v: "all" | "me") => {
      const dAll = ctx?.defaultAllDir ?? "C:\\Program Files\\NOBODY";
      const dMe = ctx?.defaultUserDir ?? "C:\\Users\\you\\AppData\\Local\\Programs\\NOBODY";
      setScopeState((prev) => {
        const defaults = [dAll, dMe];
        setInstallDir((dir) =>
          defaults.includes(dir)
            ? v === "all"
              ? defaults[0]
              : defaults[1]
            : dir,
        );
        void prev;
        return v;
      });
    },
    [ctx],
  );

  const openDialog = useCallback((d: Exclude<DialogKind, null>) => setDialog(d), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const confirmDialog = useCallback(() => {
    if (dialog === "quit") {
      setDialog(null);
      if (api) {
        // the OS window actually closes; `win` stays "normal"
        api.close().catch((e) => console.error("[setup] close failed:", e));
      } else {
        setWin("closed");
      }
    } else if (dialog === "cancel") {
      setDialog(null);
      setProgress((p) => ({ ...p, running: false }));
      if (api) {
        installActiveRef.current = false;
        api.cancelInstall().catch((e) => console.error("[setup] cancelInstall failed:", e));
        api.close().catch((e) => console.error("[setup] close failed:", e));
      } else {
        setWin("closed");
      }
    } else {
      setDialog(null);
    }
  }, [dialog, api]);

  const acceptLicense = useCallback(() => {
    setLicenseAccepted(true);
    setPage("destination");
  }, []);

  const startInstall = useCallback(() => {
    if (api) {
      installActiveRef.current = true;
      installHistRef.current = [];
      setInstallError(null);
      /* seed exactly what the sim seeded so the page never flashes "idle" */
      setProgress({ ...IDLE, running: true, total: TOTAL_BYTES });
      api
        .startInstall({
          destDir: installDir,
          scope,
          desktop: options.desktop,
          launchAfter: options.run,
          openFolder: options.openFolder,
        })
        .then((r) => {
          if (!r.ok) {
            installActiveRef.current = false;
            setProgress((p) => ({ ...p, running: false }));
            setInstallError(r.error ?? "startInstall failed");
            console.error("[setup] startInstall rejected:", r.error);
          }
        })
        .catch((e) => {
          installActiveRef.current = false;
          setProgress((p) => ({ ...p, running: false }));
          setInstallError(String(e));
          console.error("[setup] startInstall threw:", e);
        });
      return;
    }
    setProgress({ ...IDLE, running: true, total: TOTAL_BYTES });
  }, [api, installDir, scope, options]);

  const cancelInstall = useCallback(() => {
    if (api) {
      api.cancelInstall().catch((e) => console.error("[setup] cancelInstall failed:", e));
      return;
    }
    setProgress((p) => ({ ...p, running: false }));
  }, [api]);

  const toggleOption = useCallback((k: "run" | "desktop" | "openFolder") => {
    setOptions((o) => ({ ...o, [k]: !o[k] }));
  }, []);

  const minimize = useCallback(() => {
    if (api) {
      // the OS window actually minimises; `win` stays "normal"
      api.minimize().catch((e) => console.error("[setup] minimize failed:", e));
      return;
    }
    setWin("minimized");
  }, [api]);
  const restore = useCallback(() => setWin("normal"), []);
  const closeWindow = useCallback(() => {
    if (api) {
      /* the Finish page routes here: honour run/openFolder once, then close */
      if (finishPendingRef.current) {
        finishPendingRef.current = false;
        if (mode === "setup" && options.run) {
          api.launchApp().catch((e) => console.error("[setup] launchApp failed:", e));
        }
        if (mode === "setup" && options.openFolder) {
          api.openFolder().catch((e) => console.error("[setup] openFolder failed:", e));
        }
      }
      api.close().catch((e) => console.error("[setup] close failed:", e));
      return; // `win` stays "normal" — the OS window goes away
    }
    setWin("closed");
  }, [api, mode, options]);
  const replayCurtain = useCallback(() => setCurtain((n) => n + 1), []);
  const fireBurst = useCallback(() => setBurst((n) => n + 1), []);

  const restart = useCallback(() => {
    setPage("welcome");
    setCurtain((n) => n + 1);
    setBurst(0);
    setProgress(IDLE);
    setUnProgress(IDLE);
    setDialog(null);
    setMode("setup");
    setUnPage("confirm");
    setWin("normal");
    setLicenseAccepted(false);
    setLicenseRead(false);
    setInstallError(null);
    installActiveRef.current = false;
    unActiveRef.current = false;
    finishPendingRef.current = false;
  }, []);

  /* energy: derived, not stored — one source of truth */
  const energy =
    mode === "setup" && page === "installing"
      ? progress.running
        ? 0.55 + 0.45 * progress.frac
        : 0.2
      : mode === "setup" && page === "finish"
        ? 0.85
        : mode === "uninstall" && unPage === "progress"
          ? 0.6
          : mode === "uninstall" && unPage === "done"
            ? 0.75
            : 0.26;

  /* a one-shot celebration the moment the install actually lands */
  const atFinish = (mode === "setup" && page === "finish") || (mode === "uninstall" && unPage === "done");
  useEffect(() => {
    if (atFinish) setBurst((n) => n + 1);
  }, [atFinish]);

  /* armed when the setup flow lands on Finish so the final close carries the
     run/openFolder options over the real bridge (dev fallback ignores it) */
  useEffect(() => {
    if (mode === "setup" && page === "finish") finishPendingRef.current = true;
  }, [mode, page]);

  const launchUninstaller = useCallback(() => {
    setMode("uninstall");
    setUnPage("confirm");
    setUnProgress(IDLE);
    setWin("normal");
  }, []);
  const unNext = useCallback(() => {
    if (api) {
      if (unPage === "confirm") {
        // the real pipeline starts HERE, on the confirm page's remove button
        unActiveRef.current = true;
        unHistRef.current = [];
        setUnProgress({ ...IDLE, running: true });
        api
          .startUninstall({ keepData })
          .then((r) => {
            if (!r.ok) {
              unActiveRef.current = false;
              setUnProgress((p) => ({ ...p, running: false }));
              setInstallError(r.error ?? "startUninstall failed");
              console.error("[setup] startUninstall rejected:", r.error);
            }
          })
          .catch((e) => {
            unActiveRef.current = false;
            setUnProgress((p) => ({ ...p, running: false }));
            setInstallError(String(e));
            console.error("[setup] startUninstall threw:", e);
          });
        setUnPage("progress");
        return;
      }
      setUnPage("done");
      return;
    }
    setUnPage((p) => (p === "confirm" ? "progress" : "done"));
  }, [api, unPage, keepData]);
  const unBack = useCallback(() => {
    setUnPage((p) => (p === "done" ? "confirm" : p));
    if (unPage === "confirm") setMode("setup");
  }, [unPage]);

  /* ---------------------------------------------------- real event pipeline
     ONE subscription for the whole wizard lifetime. startInstall /
     startUninstall flip the routing refs, so every ProgressEvent lands on the
     progress that is actually running (install and uninstall never overlap in
     this wizard). The mapping keeps the sim's semantics: running fracs clamp
     at 0.999, the landing event reads frac 1 / phase 5 / rate 0, and the same
     420 ms (install) / 380 ms (uninstall) hand-off to the final page fires. */
  useEffect(() => {
    if (!api) return;
    const push = (h: number[], rate: number) => {
      h.push(rate);
      if (h.length > 48) h.shift();
    };
    const unsub = api.onEvent((ev: SetupEvent) => {
      if (ev.type === "progress") {
        if (installActiveRef.current) {
          const h = installHistRef.current;
          push(h, ev.rate);
          setProgress({
            frac: ev.done ? 1 : Math.min(0.999, ev.frac),
            bytes: ev.bytes,
            total: ev.total,
            file: ev.done ? "" : ev.file,
            fileIndex: ev.fileIndex,
            phase: ev.done ? 5 : ev.phase,
            rate: ev.done ? 0 : ev.rate,
            elapsedMs: ev.elapsedMs,
            running: ev.running,
            done: ev.done,
            hist: [...h],
          });
          if (ev.done) {
            installActiveRef.current = false;
            window.setTimeout(() => setPage("finish"), 420);
          }
          return;
        }
        if (unActiveRef.current) {
          const h = unHistRef.current;
          push(h, ev.rate);
          setUnProgress({
            frac: ev.done ? 1 : Math.min(0.999, ev.frac),
            bytes: ev.bytes,
            total: ev.total,
            file: ev.done ? "" : ev.file,
            fileIndex: ev.fileIndex,
            phase: ev.done ? 5 : ev.phase,
            rate: ev.done ? 0 : ev.rate,
            elapsedMs: ev.elapsedMs,
            running: ev.running,
            done: ev.done,
            hist: [...h],
          });
          if (ev.done) {
            unActiveRef.current = false;
            window.setTimeout(() => setUnPage("done"), 380);
          }
        }
        return;
      }
      if (ev.type === "stage") {
        // uninstall milestone — keys the Progress page already highlights
        if (unActiveRef.current) {
          setUnProgress((p) => ({ ...p, file: ev.key, running: true, done: false }));
        }
        return;
      }
      if (ev.type === "log") {
        console.info("[setup]", ev.message);
        return;
      }
      if (ev.type === "error") {
        console.error("[setup] error:", ev.message);
        if (installActiveRef.current) {
          installActiveRef.current = false;
          setProgress((p) => ({ ...p, running: false }));
        }
        if (unActiveRef.current) {
          unActiveRef.current = false;
          setUnProgress((p) => ({ ...p, running: false }));
        }
        setInstallError(ev.message);
        return;
      }
      /* done */
      if (ev.ok) {
        if (installActiveRef.current) {
          installActiveRef.current = false;
          setProgress((p) => ({ ...p, frac: 1, done: true, running: false, phase: 5 }));
          window.setTimeout(() => setPage("finish"), 420);
        } else if (unActiveRef.current) {
          unActiveRef.current = false;
          setUnProgress((p) => ({ ...p, frac: 1, done: true, running: false, phase: 5 }));
          window.setTimeout(() => setUnPage("done"), 380);
        }
      } else {
        console.error("[setup] failed:", ev.message);
        if (installActiveRef.current) {
          installActiveRef.current = false;
          setProgress((p) => ({ ...p, running: false }));
        }
        if (unActiveRef.current) {
          unActiveRef.current = false;
          setUnProgress((p) => ({ ...p, running: false }));
        }
        setInstallError(ev.message ?? "install failed");
      }
    });
    return unsub;
  }, [api]);

  /* ------------------------------------------------- dev-fallback engines
     Both rAF simulators are dev-browser only; with the real bridge present
     the pipeline streams the identical Progress shape instead. */

  /* install engine: walks the real manifest. bytes → file index via OFFSETS,
     rate shaped by a per-file jitter (same texture as an NVMe extract),
     4 % / 2 % reserved for the shortcut and registry stages the NSIS script
     performs. */
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const engine = useRef({ bytes: 0, last: 0, elapsed: 0, post: -1, postT: 0, rate: 0, hist: [] as number[] });
  useEffect(() => {
    if (api) return;
    if (page !== "installing") return;
    if (progress.done || !progress.running) return;
    let raf = 0;
    let lastPaint = 0;
    engine.current = { bytes: 0, last: 0, elapsed: 0, post: -1, postT: 0, rate: 0, hist: [] };

    const tick = (now: number) => {
      const e = engine.current;
      if (!e.last) e.last = now;
      const dt = Math.min(64, now - e.last) / 1000;
      e.last = now;
      e.elapsed += dt * 1000;

      let frac: number;
      if (e.post < 0) {
        const idx = Math.min(PAYLOAD.length - 1, fileIndexFor(e.bytes));
        e.rate = BASE_RATE * speedRef.current * readJitter(idx) * (0.85 + 0.3 * Math.sin(now / 420));
        e.bytes = Math.min(TOTAL_BYTES, e.bytes + e.rate * dt);
        const f = e.bytes / TOTAL_BYTES;
        if (e.bytes >= TOTAL_BYTES) {
          e.post = 0;
          e.postT = 0;
        }
        frac = f * 0.94;
      } else {
        // shortcuts + registry: 6 % of the bar, monotonically — the bar must
        // never run backwards, not even for one frame
        const st = POST_STAGES[Math.min(e.post, POST_STAGES.length - 1)];
        e.postT += dt * 1000;
        e.rate = BASE_RATE * speedRef.current * 0.4;
        const done = e.post + Math.min(1, e.postT / st.ms);
        frac = 0.94 + (done / POST_STAGES.length) * 0.06;
        if (e.postT >= st.ms) {
          e.post += 1;
          e.postT = 0;
        }
      }

      const idx = Math.min(PAYLOAD.length - 1, fileIndexFor(e.bytes));
      const inPost = engine.current.post >= 0;
      const phase = inPost
        ? POST_STAGES[Math.min(engine.current.post, POST_STAGES.length - 1)].phase
        : PAYLOAD[idx].phase;
      const finished = inPost && engine.current.post >= POST_STAGES.length;

      if (now - lastPaint > 45 || finished) {
        lastPaint = now;
        // sparkline feed: real samples, newest last, capped at 48
        const h = engine.current.hist;
        h.push(e.rate);
        if (h.length > 48) h.shift();
        setProgress({
          frac: finished ? 1 : Math.min(0.999, frac),
          bytes: e.bytes,
          total: TOTAL_BYTES,
          file: finished ? "" : inPost ? "" : PAYLOAD[idx].name,
          fileIndex: inPost ? PAYLOAD.length : idx,
          phase: finished ? 5 : phase,
          rate: finished ? 0 : e.rate,
          elapsedMs: e.elapsed,
          running: !finished,
          done: finished,
          hist: [...h],
        });
      }
      if (finished) {
        setProgress((p) => ({ ...p, frac: 1, done: true, running: false, phase: 5 }));
        window.setTimeout(() => setPage("finish"), 420);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, page, progress.running, progress.done]);

  /* ------------------------------------------------------ uninstall engine */
  const UN_STAGES = useMemo(
    () => [
      { key: "shortcuts", ms: 620 },
      { key: "registry", ms: 520 },
      { key: "files", ms: 1500 },
      { key: keepData ? "skip-data" : "user data", ms: keepData ? 120 : 900 },
      { key: "final", ms: 260 },
    ],
    [keepData],
  );
  const unEngine = useRef({ start: 0, elapsed: 0 });
  useEffect(() => {
    if (api) return;
    if (mode !== "uninstall" || unPage !== "progress") return;
    if (unProgress.done) return;
    let raf = 0;
    let lastPaint = 0;
    const total = UN_STAGES.reduce((n, s) => n + s.ms, 0);
    unEngine.current = { start: 0, elapsed: 0 };
    const tick = (now: number) => {
      const e = unEngine.current;
      if (!e.start) e.start = now;
      e.elapsed = now - e.start;
      let acc = 0;
      let i = 0;
      for (let k = 0; k < UN_STAGES.length; k++) {
        if (e.elapsed < acc + UN_STAGES[k].ms) {
          i = k;
          break;
        }
        acc += UN_STAGES[k].ms;
        i = k + 1;
      }
      const finished = i >= UN_STAGES.length;
      const frac = Math.min(1, e.elapsed / total);
      if (now - lastPaint > 45 || finished) {
        lastPaint = now;
        setUnProgress({
          ...IDLE,
          frac: finished ? 1 : Math.min(0.999, frac),
          phase: 5,
          file: finished ? "" : UN_STAGES[Math.min(i, UN_STAGES.length - 1)].key,
          elapsedMs: e.elapsed,
          running: !finished,
          done: finished,
        });
      }
      if (finished) {
        window.setTimeout(() => setUnPage("done"), 380);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, mode, unPage, unProgress.done, UN_STAGES]);

  /* --------------------------------------------------------------- keyboard */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (dialog) {
          closeDialog();
          return;
        }
        if (mode === "uninstall") return;
        openDialog(page === "installing" ? "cancel" : "quit");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, page, mode, closeDialog, openDialog]);

  /* the native directory picker — used by the Browse dialog in real mode;
     dev fallback returns null so the dialog's own input stays authoritative */
  const chooseDir = useCallback(
    async (current: string): Promise<string | null> => {
      if (!api) return null;
      try {
        return await api.chooseDir(current);
      } catch (e) {
        console.error("[setup] chooseDir failed:", e);
        return null;
      }
    },
    [api],
  );

  const value: Setup = {
    lang,
    dir,
    setLang,
    page,
    next,
    back,
    dialog,
    openDialog,
    closeDialog,
    confirmDialog,
    progress,
    startInstall,
    cancelInstall,
    installDir,
    setInstallDir,
    scope,
    setScope,
    freeMb,
    upgrade,
    options,
    toggleOption,
    licenseRead,
    setLicenseRead,
    licenseAccepted,
    acceptLicense,
    win,
    minimize,
    restore,
    closeWindow,
    restart,
    mode,
    unPage,
    launchUninstaller,
    unNext,
    unBack,
    unProgress,
    keepData,
    setKeepData,
    /* QA */
    scale,
    setScale,
    narrow,
    setNarrow,
    showDesktop,
    setShowDesktop,
    speed,
    setSpeed,
    forceUpgrade,
    setForceUpgrade,
    deliverablesOpen,
    setDeliverablesOpen,
    lowDisk,
    setLowDisk,
    motionOn,
    setMotionOn,
    ambient,
    setAmbient,
    curtain,
    replayCurtain,
    burst,
    fireBurst,
    atFinish,
    energy,
    /* real pipeline */
    hasApi: api !== null,
    ctx,
    installError,
    setInstallError,
    chooseDir,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function fileIndexFor(bytes: number): number {
  let lo = 0;
  let hi = OFFSETS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (OFFSETS[mid] <= bytes) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
