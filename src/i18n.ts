import { Language } from "./types";

export interface TranslationDictionary {
  appName: string;
  subtitle: string;
  designedBy: string;
  nav: {
    focus: string;
    library: string;
    lyrics: string;
    downloads: string;
    contact: string;
    donate: string;
    settings: string;
  };
  pageTitles: {
    focus: string;
    library: string;
    lyrics: string;
    downloads: string;
    contact: string;
    donate: string;
    settings: string;
  };
  focus: {
    signature: string;
    play: string;
    pause: string;
    viewLiveLyrics: string;
  };
  library: {
    collection: string;
    addFolder: string;
    addFolderHint: string;
    addMusic: string;
    colNum: string;
    colTitle: string;
    colAlbum: string;
    colTime: string;
    noResults: string;
    noResultsDesc: string;
    viewSyncedLyrics: string;
    autoLrcBadge: string;
    addToUrQueue: string;
    inUrQueue: string;
  };
  queue: {
    upNextTab: string;
    urQueueTab: string;
    emptyUrQueue: string;
    removeFromQueue: string;
  };
  playlists: {
    sectionTitle: string;
    createBtn: string;
    createTitle: string;
    createSubtitle: string;
    namePlaceholder: string;
    createConfirm: string;
    cancel: string;
    likedName: string;
    allTracks: string;
    empty: string;
    addTo: string;
    added: string;
    tracks: string;
    remove: string;
    doneBtn: string;
    like: string;
    colorLabel: string;
    iconLabel: string;
  };
  lyrics: {
    externalLrcActive: string;
    nobodySync: string;
    loadLrcBtn: string;
    linesUnit: string;
    voidTitle: string;
    noSyncedLyricsDesc: string;
    autoFindAction: string;
    autoFindLoading: string;
    autoFindApplied: string;
    autoFindPlain: string;
    autoFindNone: string;
    autoFindError: string;
  };
  contact: {
    headingTag: string;
    headingTitle: string;
    headingSubtitle: string;
    prefixText: string;
    telegramBtn: string;
    githubBtn: string;
    connectMsg: string;
    tabContact: string;
    tabDedication: string;
    dedicationTitle: string;
    dedicationBody: string;
    dedicationSign: string;
    fromCreatorTag: string;
    creatorBody: string;
    creatorSign: string;
    dedicationFooter: string;
    emailBtn: string;
    instagramBtn: string;
    instagramSoon: string;
  };
  donate: {
    headingTag: string;
    headingTitle: string;
    headingSubtitle: string;
    usdtLabel: string;
    trxLabel: string;
    btcLabel: string;
    reymitTitle: string;
    reymitDesc: string;
    reymitBtn: string;
    copyAddressBtn: string;
    copiedMsg: string;
    thankYouTitle: string;
    thankYouDesc: string;
  };
  settings: {
    headingTag: string;
    headingTitle: string;
    headingSubtitle: string;
    appearanceGroup: string;
    autoColor: string;
    autoColorDesc: string;
    ambientMotion: string;
    ambientMotionDesc: string;
    highContrast: string;
    highContrastDesc: string;
    darkAdaptive: string;
    lyricsGroup: string;
    showTranslation: string;
    showTranslationDesc: string;
    lyricSize: string;
    smallText: string;
    largeText: string;
    lyricStyleLabel: string;
    lyricStyleDesc: string;
    lyricStyleClassic: string;
    lyricStyleKaraoke: string;
    lyricStyleMinimal: string;
    interfaceGroup: string;
    interfaceDesc: string;
    interfaceClassic: string;
    interfaceCinema: string;
    interfaceEela: string;
    interfaceAlok: string;
    idleEqLabel: string;
    idleEqDesc: string;
    idleEqBars: string;
    idleEqWave: string;
    idleEqOrbit: string;
    idleEqRandom: string;
    compactStyleLabel: string;
    compactStyleDesc: string;
    compactStyleClassic: string;
    compactStyleCover: string;
    compactStyleMinimal: string;
    languageSelect: string;
    languageDesc: string;
    musicFolder: string;
    musicFolderDesc: string;
    changeFolder: string;
    aboutVersion: string;
  };
  compact: {
    enterCompact: string;
    exitCompact: string;
    hoverHint: string;
  };
  nudge: {
    donateTitle: string;
    donateBody: string;
    starTitle: string;
    starBody: string;
    starAction: string;
    donateAction: string;
    dismiss: string;
  };
}

export const DICTIONARY: Record<Language, TranslationDictionary> = {
  fa: {
    appName: "NOBODY",
    subtitle: "DESKTOP PLAYER BY EPODONIOS",
    designedBy: "طراحی شده توسط EPODONIOS",
    nav: {
      focus: "خانه",
      library: "کتابخانه",
      lyrics: "متن ترانه",
      downloads: "دانلودها",
      contact: "ارتباط با من",
      donate: "حمایت (Donate)",
      settings: "تنظیمات",
    },
    pageTitles: {
      focus: "اکنون می‌شنوی",
      library: "کتابخانه شخصی",
      lyrics: "همخوانی زنده",
      downloads: "مرکز دانلود",
      contact: "ارتباط با طراح (Contact Me)",
      donate: "حمایت از توسعه Nobody",
      settings: "تنظیمات برنامه",
    },
    focus: {
      signature: "NOBODY SIGNATURE LISTENING • EPODONIOS ARCHITECTURE",
      play: "پخش",
      pause: "توقف",
      viewLiveLyrics: "مشاهده متن زنده",
    },
    library: {
      collection: "EPODONIOS COLLECTION ARCHIVE",
      addFolder: "افزودن پوشه با اسکن خودکار LRC و کاور",
      addFolderHint:
        "هنگام انتخاب پوشه یا آهنگ، تمام فرمت‌های صوتی، کاورهای داخلی (ID3/FLAC) و فایل‌های lrc همنام به‌صورت خودکار توسط سیستم EPODONIOS اسکن می‌شوند.",
      addMusic: "افزودن موسیقی",
      colNum: "#",
      colTitle: "عنوان",
      colAlbum: "آلبوم",
      colTime: "زمان",
      noResults: "نتیجه‌ای پیدا نشد",
      noResultsDesc: "عبارت دیگری را جست‌وجو کن.",
      viewSyncedLyrics: "متن هماهنگ آهنگ در حال پخش",
      autoLrcBadge: "LRC همنام متصل شد",
      addToUrQueue: "+ Ur Queue",
      inUrQueue: "در Ur Queue",
    },
    queue: {
      upNextTab: "Up Next (پیش‌فرض)",
      urQueueTab: "Ur Queue (صف انتخابی شما)",
      emptyUrQueue: "هنوز آهنگی به Ur Queue اضافه نکرده‌اید. در کتابخانه روی + Ur Queue کلیک کنید.",
      removeFromQueue: "حذف از صف",
    },
    playlists: {
      sectionTitle: "پلی‌لیست‌های اختصاصی شما",
      createBtn: "ساخت پلی‌لیست تازه",
      createTitle: "ایجاد پلی‌لیست جدید",
      createSubtitle: "با طراحی لوکس و انتخاب رنگ و آیکون دلخواه، مجموعه موسیقی خود را سازماندهی کنید.",
      namePlaceholder: "مثلاً: شب‌های بارانی و تاریک...",
      createConfirm: "ساخت پلی‌لیست",
      cancel: "انصراف",
      likedName: "آهنگ‌های محبوب",
      allTracks: "همه آهنگ‌ها",
      empty: "این پلی‌لیست هنوز خالی است.",
      addTo: "افزودن به پلی‌لیست",
      added: "افزوده شد",
      tracks: "قطعه",
      remove: "حذف پلی‌لیست",
      doneBtn: "تمام شد",
      like: "افزودن به محبوب‌ها",
      colorLabel: "رنگ تم سفارشی",
      iconLabel: "نماد یا آیکون اختصاصی",
    },
    lyrics: {
      externalLrcActive: "LRC خودکار از پوشه فعال است • EPODONIOS SYNC",
      nobodySync: "Nobody Sync Engine",
      loadLrcBtn: "بارگذاری فایل LRC",
      linesUnit: "خط",
      voidTitle: "این ترانه هنوز متنِ همگام ندارد",
      noSyncedLyricsDesc:
        "این اثر در خالص‌ترین فرم موسیقیایی و بدون فایل همگام‌سازی‌شده (LRC) اجرا می‌شود. فایل .lrc همنام با آهنگ را در پوشه موسیقی قرار دهید، همین‌جا بارگذاری کنید، یا بگذارید Nobody آن را برایتان پیدا کند.",
      autoFindAction: "پیدا کردن خودکار متن (LRCLIB)",
      autoFindLoading: "در حال جست‌وجوی متن…",
      autoFindApplied: "متن همگام پیدا شد و فعال گردید ✓",
      autoFindPlain: "فقط متن ساده (بدون تایم‌لاین) پیدا شد؛ از مرکز دانلود می‌توانی ذخیره‌اش کنی.",
      autoFindNone: "متنی برای این ترانه پیدا نشد.",
      autoFindError: "اتصال به LRCLIB برقرار نشد؛ دوباره تلاش کن.",
    },
    contact: {
      headingTag: "DESIGN ARCHITECTURE BY EPODONIOS",
      headingTitle: "ارتباط با طراح برنامه (Contact Me)",
      headingSubtitle: "پردیس هنر و کدنویسی صوتی EPODONIOS؛ پلتفرمی برای زیستن درون موسیقی.",
      prefixText: "Aaaaaaaaaaaaaa music is ",
      telegramBtn: "ارتباط از طریق تلگرام (Telegram)",
      githubBtn: "مشاهده پروژه‌ها در گیت‌هاب (GitHub)",
      connectMsg: "برای همکاری، گزارش اشکال و گفتگو درباره طراحی‌های بعدی Nobody توسط EPODONIOS در تماس باشید.",
      tabContact: "تماس",
      tabDedication: "تقدیم‌نامه",
      dedicationTitle: "DEDICATION",
      dedicationBody:
        "آقا نوبادی ازت ممنونه — امروز رو با اینکه خودِ واقعیت بودی، یه چیز خاص و متفاوت کردی. هیچ‌کس مثل تو تا حالا تو این دنیا به دنیا نیومده و من عاشق همین وجودتم.",
      dedicationSign: "NOBODY",
      fromCreatorTag: "FROM THE CREATOR",
      creatorBody: "سلام آدم‌ها! من اِپودونیوس‌ام؛ این برنامه رو تقدیم می‌کنم به آقا نوبادی — امیدوارم به کارت بیاد.",
      creatorSign: "EPODONIOS",
      dedicationFooter: "NOBODY x EPODONIOS • BUILT WITH LOVE • 2026",
      emailBtn: "رایانامه (Email)",
      instagramBtn: "اینستاگرام (Instagram)",
      instagramSoon: "به‌زودی",
    },
    donate: {
      headingTag: "EPODONIOS AUDIO PATRONAGE",
      headingTitle: "حمایت از توسعه Nobody (Donate)",
      headingSubtitle: "پردیس آزاد و مستقل موسیقی دسکتاپ؛ با حمایت مالی شما از طریق ارز دیجیتال و درگاه‌های مستقیم، توسعه معماری صوتی EPODONIOS با قدرت ادامه می‌یابد.",
      usdtLabel: "آدرس تتر (Tether USDT - TRC20 / ERC20):",
      trxLabel: "آدرس ترون (Tron TRX):",
      btcLabel: "آدرس بیت‌کوین (Bitcoin BTC):",
      reymitTitle: "حمایت مستقیم از طریق درگاه Reymit",
      reymitDesc: "برای پرداخت سریع و ایمن جهت حمایت از طراحی‌های بعدی EPODONIOS می‌توانید از درگاه اختصاصی Reymit استفاده کنید.",
      reymitBtn: "ورود به درگاه حمایت Reymit",
      copyAddressBtn: "کپی آدرس کیف پول",
      copiedMsg: "آدرس کپی شد!",
      thankYouTitle: "از همراهی، حمایت و اصالت شما سپاسگزاریم",
      thankYouDesc: "تمامی حمایت‌های مالی صرف تحقیق و توسعه نسخه‌های آتی Nobody و خلق قابلیت‌های خلاقانه توسط EPODONIOS خواهد شد.",
    },
    settings: {
      headingTag: "PERSONALIZE NOBODY BY EPODONIOS",
      headingTitle: "فضا را شبیه خودت کن.",
      headingSubtitle:
        "ظاهر، زبان برنامه، جلوه‌های پویا و تجربه همخوانی را بدون خروج از موسیقی تنظیم کن.",
      appearanceGroup: "ظاهر پویا و تم برنامه",
      autoColor: "رنگ هوشمند کاور",
      autoColorDesc: "رنگ محیط و انیمیشن‌ها از کاور هر آهنگ استخراج شود.",
      ambientMotion: "حرکت محیطی",
      ambientMotionDesc: "نورها و تغییر صفحات به نرمی حرکت کنند.",
      highContrast: "کنتراست بیشتر",
      highContrastDesc: "خوانایی نوشته‌ها در پس‌زمینه تیره افزایش یابد.",
      darkAdaptive: "تاریک سینمایی (Cinema Dark)",
      lyricsGroup: "متن، زبان و همخوانی",
      showTranslation: "نمایش ترجمه",
      showTranslationDesc: "ترجمه زیر هر خط از متن نمایش داده شود.",
      lyricSize: "اندازه متن فعال",
      smallText: "ظریف",
      largeText: "درشت",
      lyricStyleLabel: "استایل نمایش لیریک",
      lyricStyleDesc: "ظاهر بصری متن سینک‌شده را انتخاب کن",
      lyricStyleClassic: "کلاسیک",
      lyricStyleKaraoke: "کارائوکه",
      lyricStyleMinimal: "مینیمال",
      interfaceGroup: "رابط کاربری (UI)",
      interfaceDesc: "چهرهٔ NOBODY را انتخاب کن — جابه‌جایی با یک معرفی کوتاه همراه است.",
      interfaceClassic: "کلاسیک",
      interfaceCinema: "سینما",
      interfaceEela: "ایلا",
      interfaceAlok: "آلوک",
      idleEqLabel: "استایل اکولایز حالت بی‌تعاملی",
      idleEqDesc: "شکل انیمیشن صدا در صفحه‌ی نمایش بی‌تعاملی را انتخاب کن",
      idleEqBars: "میله‌ای",
      idleEqWave: "موجی",
      idleEqOrbit: "مداری",
      idleEqRandom: "تصادفی هر آهنگ",
      compactStyleLabel: "استایل حالت کامپکت",
      compactStyleDesc: "چیدمان پخش‌کننده‌ی کوچک (مینی‌پلیر) را انتخاب کن",
      compactStyleClassic: "کلاسیک",
      compactStyleCover: "کاور محور",
      compactStyleMinimal: "مینیمال",
      languageSelect: "زبان رابط کاربری (UI Language)",
      languageDesc: "زبان نمایش منوها، متن‌ها و پیام‌های برنامه را انتخاب کنید.",
      musicFolder: "پوشه پیش‌فرض موسیقی",
      musicFolderDesc: "C:\\Users\\Nobody\\Music",
      changeFolder: "تغییر پوشه",
      aboutVersion: "NOBODY DESKTOP PLAYER • DESIGNED BY EPODONIOS • BUILD 2026.04",
    },
    compact: {
      enterCompact: "حالت کامپکت (Mini Player)",
      exitCompact: "خروج از حالت کامپکت",
      hoverHint: "برای مشاهده دکمه‌های کنترلی ماوس را بیرون از متن قرار دهید",
    },
    nudge: {
      donateTitle: "به NOBODY سوخت برسون",
      donateBody: "NOBODY رایگان و مستقله — یه کمک کوچیک باعث می‌شه موسیقی ادامه پیدا کنه.",
      starTitle: "توی گیت‌هاب ستاره بزن",
      starBody: "از پلیر خوشت اومده؟ یه ستاره توی گیت‌هاب بهترین تشخازه.",
      starAction: "ستاره در گیت‌هاب",
      donateAction: "کمک مالی",
      dismiss: "بعداً",
    },
  },

  en: {
    appName: "NOBODY",
    subtitle: "DESKTOP PLAYER BY EPODONIOS",
    designedBy: "Designed by EPODONIOS",
    nav: {
      focus: "Focus",
      library: "Library",
      lyrics: "Live Lyrics",
      downloads: "Downloads",
      contact: "Contact Me",
      donate: "Donate",
      settings: "Settings",
    },
    pageTitles: {
      focus: "Now Listening",
      library: "Personal Library",
      lyrics: "Synchronized Lyrics",
      downloads: "Download Center",
      contact: "Contact Creator",
      donate: "Support Nobody Development",
      settings: "Player Settings",
    },
    focus: {
      signature: "NOBODY SIGNATURE LISTENING • EPODONIOS ARCHITECTURE",
      play: "Play",
      pause: "Pause",
      viewLiveLyrics: "View Live Lyrics",
    },
    library: {
      collection: "EPODONIOS COLLECTION ARCHIVE",
      addFolder: "Add Folder (Auto-scan LRC & Cover)",
      addFolderHint:
        "When importing a music folder, Nobody scans audio files, ID3/FLAC cover art, and pairs matching same-name .lrc files automatically via EPODONIOS engine.",
      addMusic: "Add Track",
      colNum: "#",
      colTitle: "Title",
      colAlbum: "Album",
      colTime: "Time",
      noResults: "No music found",
      noResultsDesc: "Try searching with different keywords.",
      viewSyncedLyrics: "Synced lyrics for current track",
      autoLrcBadge: "Matched same-name LRC",
      addToUrQueue: "+ Ur Queue",
      inUrQueue: "In Ur Queue",
    },
    queue: {
      upNextTab: "Up Next (Default)",
      urQueueTab: "Ur Queue (Custom Selection)",
      emptyUrQueue: "Ur Queue is currently empty. Click '+ Ur Queue' on any track in Library to build your list.",
      removeFromQueue: "Remove from queue",
    },
    playlists: {
      sectionTitle: "Your Exclusive Playlists",
      createBtn: "Create New Playlist",
      createTitle: "Create Custom Playlist",
      createSubtitle: "Organize your listening archives with custom accent colors, icons, and luxury mood aesthetics.",
      namePlaceholder: "e.g. Endless Dark Nights...",
      createConfirm: "Create Playlist",
      cancel: "Cancel",
      likedName: "Liked Songs",
      allTracks: "All Tracks",
      empty: "This playlist is still empty.",
      addTo: "Add to playlist",
      added: "Added",
      tracks: "tracks",
      remove: "Delete playlist",
      doneBtn: "Done",
      like: "Add to liked songs",
      colorLabel: "Custom Accent Theme",
      iconLabel: "Playlist Emblem",
    },
    lyrics: {
      externalLrcActive: "Folder Auto-LRC Active • EPODONIOS SYNC",
      nobodySync: "Nobody Sync Engine",
      loadLrcBtn: "Load LRC File",
      linesUnit: "LINES",
      voidTitle: "No Synced Lyrics on this Track — Yet",
      noSyncedLyricsDesc:
        "This track is playing in its purest musical form, without synchronized timestamp tags. Place a same-name .lrc file next to the audio, load one right here, or let Nobody find it for you.",
      autoFindAction: "Auto-find Lyrics (LRCLIB)",
      autoFindLoading: "Searching for lyrics…",
      autoFindApplied: "Synced lyrics found & applied ✓",
      autoFindPlain: "Only plain (untimed) lyrics were found — you can save them from the Download Center.",
      autoFindNone: "No lyrics were found for this track.",
      autoFindError: "Could not reach LRCLIB — please try again.",
    },
    contact: {
      headingTag: "DESIGN ARCHITECTURE BY EPODONIOS",
      headingTitle: "Contact Me & Project Network",
      headingSubtitle: "Audio engineering and interface aesthetics tailored for immersive desktops by EPODONIOS.",
      prefixText: "Aaaaaaaaaaaaaa music is ",
      telegramBtn: "Connect on Telegram",
      githubBtn: "Explore on GitHub",
      connectMsg: "Get in touch for bug reports, architectural collaborations, and future Nobody builds by EPODONIOS.",
      tabContact: "Contact",
      tabDedication: "Dedication",
      dedicationTitle: "DEDICATION",
      dedicationBody:
        "Mr. NOBODY thanks you — you turned today into something special just by being your true self. No one like you has ever been born into this world, and I honestly love your existence.",
      dedicationSign: "NOBODY",
      fromCreatorTag: "FROM THE CREATOR",
      creatorBody: "Hey humans — EPODONIOS here. This app is my little dedication to Mr. NOBODY. I hope it serves you well.",
      creatorSign: "EPODONIOS",
      dedicationFooter: "NOBODY x EPODONIOS • BUILT WITH LOVE • 2026",
      emailBtn: "Email",
      instagramBtn: "Instagram",
      instagramSoon: "Coming soon",
    },
    donate: {
      headingTag: "EPODONIOS AUDIO PATRONAGE",
      headingTitle: "Support Nobody Development (Donate)",
      headingSubtitle: "An independent, sovereign desktop audio experience. Your support through cryptocurrencies and direct portals empowers borderless sonic architecture by EPODONIOS.",
      usdtLabel: "Tether (USDT - TRC20 / ERC20) Address:",
      trxLabel: "Tron (TRX) Address:",
      btcLabel: "Bitcoin (BTC) Address:",
      reymitTitle: "Direct Support via Reymit Portal",
      reymitDesc: "For fast and secure direct support of upcoming EPODONIOS audio tools, visit our verified Reymit page.",
      reymitBtn: "Open Reymit Patron Portal",
      copyAddressBtn: "Copy Wallet Address",
      copiedMsg: "Address Copied!",
      thankYouTitle: "Thank You for Your Patronage & Authenticity",
      thankYouDesc: "All contributions directly fund research and development of future Nobody iterations and cinematic interface engineering by EPODONIOS.",
    },
    settings: {
      headingTag: "PERSONALIZE NOBODY BY EPODONIOS",
      headingTitle: "Shape your listening space.",
      headingSubtitle:
        "Customize interface language, dynamic cover colors, ambient motion, and lyric text size.",
      appearanceGroup: "Dynamic Theme & Appearance",
      autoColor: "Smart Cover Colors",
      autoColorDesc: "Extract accent colors dynamically from album art.",
      ambientMotion: "Ambient Motion",
      ambientMotionDesc: "Enable smooth background glow and kinetic transitions.",
      highContrast: "High Contrast",
      highContrastDesc: "Increase legibility of text over dark backgrounds.",
      darkAdaptive: "Cinema Dark Mode",
      lyricsGroup: "Lyrics & Translation",
      showTranslation: "Show Translation",
      showTranslationDesc: "Display translated line below each lyric line.",
      lyricSize: "Active Lyric Size",
      smallText: "Subtle",
      largeText: "Bold",
      lyricStyleLabel: "Lyrics Display Style",
      lyricStyleDesc: "Choose how synchronized lyrics look on screen",
      lyricStyleClassic: "Classic",
      lyricStyleKaraoke: "Karaoke",
      lyricStyleMinimal: "Minimal",
      interfaceGroup: "Interface (UI)",
      interfaceDesc: "Choose the face of NOBODY — switching plays a short intro.",
      interfaceClassic: "Classic",
      interfaceCinema: "Cinema",
      interfaceEela: "EELA",
      interfaceAlok: "ALOK",
      idleEqLabel: "Idle Mode Equalizer Style",
      idleEqDesc: "Choose the audio animation shown on the idle screensaver",
      idleEqBars: "Bars",
      idleEqWave: "Wave",
      idleEqOrbit: "Orbit",
      idleEqRandom: "Random per track",
      compactStyleLabel: "Compact Mode Style",
      compactStyleDesc: "Choose the mini-player's layout",
      compactStyleClassic: "Classic",
      compactStyleCover: "Cover-focused",
      compactStyleMinimal: "Minimal",
      languageSelect: "UI Language",
      languageDesc: "Select language for menus, buttons, and quotes.",
      musicFolder: "Default Music Library",
      musicFolderDesc: "C:\\Users\\Nobody\\Music",
      changeFolder: "Change Folder",
      aboutVersion: "NOBODY DESKTOP PLAYER • DESIGNED BY EPODONIOS • BUILD 2026.04",
    },
    compact: {
      enterCompact: "Compact Mode (Mini Player)",
      exitCompact: "Exit Compact Mode",
      hoverHint: "Hover outside text to view playback controls",
    },
    nudge: {
      donateTitle: "Fuel NOBODY",
      donateBody: "NOBODY is free and independent — a small donation keeps the music playing.",
      starTitle: "Star NOBODY on GitHub",
      starBody: "Enjoying the player? A GitHub star is the best thank-you.",
      starAction: "Star on GitHub",
      donateAction: "Donate",
      dismiss: "Later",
    },
  },

  tr: {
    appName: "NOBODY",
    subtitle: "MASAÜSTÜ OYNATICI • EPODONIOS",
    designedBy: "EPODONIOS tarafından tasarlandı",
    nav: {
      focus: "Ana Sayfa",
      library: "Kütüphane",
      lyrics: "Canlı Şarkı Sözü",
      downloads: "İndirilenler",
      contact: "İletişim",
      donate: "Bağış (Donate)",
      settings: "Ayarlar",
    },
    pageTitles: {
      focus: "Şimdi Çalıyor",
      library: "Kişisel Kütüphane",
      lyrics: "Senkronize Sözler",
      downloads: "İndirme Merkezi",
      contact: "Yaratıcıyla İletişim",
      donate: "Nobody Gelişimini Destekle",
      settings: "Oynatıcı Ayarları",
    },
    focus: {
      signature: "EPODONIOS İMZALI NOBODY DENEYİMİ",
      play: "Oynat",
      pause: "Duraklat",
      viewLiveLyrics: "Canlı Sözleri Gör",
    },
    library: {
      collection: "EPODONIOS KOLEKSİYON ARŞİVİ",
      addFolder: "Klasör Ekle (LRC & Kapak Tara)",
      addFolderHint:
        "Bir klasör veya şarkı seçildiğinde ses dosyaları, gömülü albüm kapakları (ID3/FLAC) ve aynı isme sahip .lrc dosyaları EPODONIOS motoruyla otomatik eşleştirilir.",
      addMusic: "Şarkı Ekle",
      colNum: "#",
      colTitle: "Başlık",
      colAlbum: "Albüm",
      colTime: "Süre",
      noResults: "Sonuç bulunamadı",
      noResultsDesc: "Farklı anahtar kelimelerle aramayı deneyin.",
      viewSyncedLyrics: "Çalan şarkı için senkronize sözler",
      autoLrcBadge: "Aynı isimli LRC eşleşti",
      addToUrQueue: "+ Ur Queue",
      inUrQueue: "Ur Queue'de",
    },
    queue: {
      upNextTab: "Up Next (Varsayılan)",
      urQueueTab: "Ur Queue (Özel Seçiminiz)",
      emptyUrQueue: "Ur Queue henüz boş. Şarkı listesinden + Ur Queue butonuna basarak kütüphanenizden şarkı ekleyin.",
      removeFromQueue: "Listeden çıkar",
    },
    playlists: {
      sectionTitle: "Özel Çalma Listeleriniz",
      createBtn: "Yeni Çalma Listesi Oluştur",
      createTitle: "Yeni Listesi Oluştur",
      createSubtitle: "Lüks renk teması, sembol ve adla dinleme gecelerinizi özelleştirin.",
      namePlaceholder: "örn. Sonsuz Karanlık Geceler...",
      createConfirm: "Listeyi Oluştur",
      cancel: "İptal",
      likedName: "Beğenilen Şarkılar",
      allTracks: "Tüm Parçalar",
      empty: "Bu çalma listesi henüz boş.",
      addTo: "Çalma listesine ekle",
      added: "Eklendi",
      tracks: "parça",
      remove: "Listeyi sil",
      doneBtn: "Tamam",
      like: "Beğenilenlere ekle",
      colorLabel: "Özel Renk Teması",
      iconLabel: "Liste Sembolü",
    },
    lyrics: {
      externalLrcActive: "Klasör Otomatik LRC Aktif • EPODONIOS SYNC",
      nobodySync: "Nobody Sync Motoru",
      loadLrcBtn: "LRC Dosyası Yükle",
      linesUnit: "satır",
      voidTitle: "Bu parçada henüz senkronize söz yok",
      noSyncedLyricsDesc:
        "Bu eser en saf müzikal formunda, senkronize zaman damgası (LRC) olmadan çalıyor. Aynı isimli bir .lrc dosyasını müzik klasörüne koyun, buradan yükleyin ya da Nobody sizin için bulsun.",
      autoFindAction: "Sözleri Otomatik Bul (LRCLIB)",
      autoFindLoading: "Sözler aranıyor…",
      autoFindApplied: "Senkronize söz bulundu ve uygulandı ✓",
      autoFindPlain: "Yalnızca düz (zamansız) söz bulundu — İndirme Merkezi'nden kaydedebilirsin.",
      autoFindNone: "Bu parça için hiç söz bulunamadı.",
      autoFindError: "LRCLIB'e ulaşılamadı — lütfen tekrar dene.",
    },
    contact: {
      headingTag: "DESIGN ARCHITECTURE BY EPODONIOS",
      headingTitle: "İletişim ve Proje Ağı (Contact Me)",
      headingSubtitle: "EPODONIOS tarafından masaüstünüz için tasarlanmış sürükleyici müzik ve estetik mühendisliği.",
      prefixText: "Aaaaaaaaaaaaaa music is ",
      telegramBtn: "Telegram'dan Bağlan",
      githubBtn: "GitHub'da İncele",
      connectMsg: "Geri bildirim, hata bildirimi ve EPODONIOS tasarımlı gelecekteki Nobody projeleri için iletişime geçin.",
      tabContact: "İletişim",
      tabDedication: "İthaf",
      dedicationTitle: "DEDICATION",
      dedicationBody:
        "Bay NOBODY sana teşekkür eder — bugünü, sadece kendi öz benliğin olarak kaldığın için özel ve farklı bir güne dönüştürdün. Senin gibi biri bu dünyaya daha önce gelmedi ve ben senin varlığını gerçekten seviyorum.",
      dedicationSign: "NOBODY",
      fromCreatorTag: "FROM THE CREATOR",
      creatorBody: "Selam insanlar! Ben EPODONIOS. Bu uygulamayı Bay NOBODY'ye adıyorum — umarım işine yarar.",
      creatorSign: "EPODONIOS",
      dedicationFooter: "NOBODY x EPODONIOS • BUILT WITH LOVE • 2026",
      emailBtn: "E-posta",
      instagramBtn: "Instagram",
      instagramSoon: "Yakında",
    },
    donate: {
      headingTag: "EPODONIOS AUDIO PATRONAGE",
      headingTitle: "Nobody Gelişimini Destekle (Donate)",
      headingSubtitle: "Bağımsız ve sınırsız bir masaüstü müzik platformu. Kripto ve doğrudan ödeme ağları üzerinden desteğiniz EPODONIOS ses estetiğini güçlendirir.",
      usdtLabel: "Tether (USDT - TRC20 / ERC20) Adresi:",
      trxLabel: "Tron (TRX) Adresi:",
      btcLabel: "Bitcoin (BTC) Adresi:",
      reymitTitle: "Reymit Üzerinden Doğrudan Destek",
      reymitDesc: "EPODONIOS ses projelerini güvenli ve hızlı bir şekilde desteklemek için doğrulanmış Reymit sayfamızı ziyaret edin.",
      reymitBtn: "Reymit Destek Portalını Aç",
      copyAddressBtn: "Cüzdan Adresini Kopyala",
      copiedMsg: "Adres Kopyalandı!",
      thankYouTitle: "Desteğiniz ve Asaletiniz İçin Teşekkürler",
      thankYouDesc: "Tüm katkılar doğrudan EPODONIOS tarafından Nobody platformunun yeni nesil sürümlerinin geliştirilmesinde kullanılacaktır.",
    },
    settings: {
      headingTag: "EPODONIOS İLE KİŞİSELLEŞTİRİN",
      headingTitle: "Alanınızı kendinize göre tasarlayın.",
      headingSubtitle:
        "Arayüz dilini, kapak renklerini, arka plan hareketini ve söz boyutunu kolayca özelleştirin.",
      appearanceGroup: "Dinamik Tema ve Görünüm",
      autoColor: "Akıllı Kapak Renkleri",
      autoColorDesc: "Albüm kapağındaki ana renkleri ve animasyonları otomatik çıkarın.",
      ambientMotion: "Ortam Hareketi",
      ambientMotionDesc: "Yumuşak ışık geçişleri ve tipografi animasyonlarını açın.",
      highContrast: "Yüksek Kontrast",
      highContrastDesc: "Koyu arka plan üzerinde metin netliğini artırın.",
      darkAdaptive: "Sinematik Karanlık Mod",
      lyricsGroup: "Şarkı Sözleri ve Çeviri",
      showTranslation: "Çevirileri Göster",
      showTranslationDesc: "Her satırın altında çevirisini görüntüleyin.",
      lyricSize: "Aktif Söz Boyutu",
      smallText: "Zarif",
      largeText: "Büyük",
      lyricStyleLabel: "Söz Görünüm Stili",
      lyricStyleDesc: "Senkronize sözlerin ekrandaki görünümünü seç",
      lyricStyleClassic: "Klasik",
      lyricStyleKaraoke: "Karaoke",
      lyricStyleMinimal: "Minimal",
      interfaceGroup: "Arayüz (UI)",
      interfaceDesc: "NOBODY'nin yüzünü seçin — geçiş kısa bir tanıtımla açılır.",
      interfaceClassic: "Klasik",
      interfaceCinema: "Sinema",
      interfaceEela: "EELA",
      interfaceAlok: "ALOK",
      idleEqLabel: "Boşta Modu Ekolayzer Stili",
      idleEqDesc: "Ekran koruyucudaki ses animasyonunu seç",
      idleEqBars: "Çubuklar",
      idleEqWave: "Dalga",
      idleEqOrbit: "Yörünge",
      idleEqRandom: "Şarkı başına rastgele",
      compactStyleLabel: "Kompakt Mod Stili",
      compactStyleDesc: "Mini oynatıcının düzenini seç",
      compactStyleClassic: "Klasik",
      compactStyleCover: "Kapak Odaklı",
      compactStyleMinimal: "Minimal",
      languageSelect: "Arayüz Dili (UI Language)",
      languageDesc: "Menüler, metinler ve ilham sözleri için dil seçin.",
      musicFolder: "Varsayılan Müzik Klasörü",
      musicFolderDesc: "C:\\Users\\Nobody\\Music",
      changeFolder: "Klasör Değiştir",
      aboutVersion: "NOBODY DESKTOP PLAYER • EPODONIOS TARAFINDAN TASARLANDI • BUILD 2026.04",
    },
    compact: {
      enterCompact: "Kompakt Mod (Mini Player)",
      exitCompact: "Kompakt Moddan Çık",
      hoverHint: "Kontrolleri görmek için fareyi metnin dışına getirin",
    },
    nudge: {
      donateTitle: "NOBODY'yi destekle",
      donateBody: "NOBODY ücretsiz ve bağımsız — küçük bir bağış müziğin devamını sağlar.",
      starTitle: "GitHub'da yıldız ver",
      starBody: "Oynatıcıyı sevdiysen en iyi teşekkür bir GitHub yıldızı.",
      starAction: "GitHub'da yıldızla",
      donateAction: "Bağış yap",
      dismiss: "Sonra",
    },
  },

  ru: {
    appName: "NOBODY",
    subtitle: "ДЕСКТОП-ПЛЕЕР ОТ EPODONIOS",
    designedBy: "Дизайн — EPODONIOS",
    nav: {
      focus: "Главная",
      library: "Библиотека",
      lyrics: "Текст песни",
      downloads: "Загрузки",
      contact: "Связаться",
      donate: "Поддержать",
      settings: "Настройки",
    },
    pageTitles: {
      focus: "Сейчас играет",
      library: "Личная библиотека",
      lyrics: "Синхронный текст",
      downloads: "Центр загрузок",
      contact: "Связь с автором",
      donate: "Поддержать разработку NOBODY",
      settings: "Настройки плеера",
    },
    focus: {
      signature: "ФИРМЕННОЕ ЗВУЧАНИЕ NOBODY • АРХИТЕКТУРА EPODONIOS",
      play: "Играть",
      pause: "Пауза",
      viewLiveLyrics: "Открыть живой текст",
    },
    library: {
      collection: "АРХИВ КОЛЛЕКЦИИ EPODONIOS",
      addFolder: "Добавить папку (автопоиск LRC и обложек)",
      addFolderHint:
        "При выборе папки или трека движок EPODONIOS автоматически находит все аудиофайлы, встроенные обложки (ID3/FLAC) и одноимённые файлы .lrc.",
      addMusic: "Добавить музыку",
      colNum: "#",
      colTitle: "Название",
      colAlbum: "Альбом",
      colTime: "Время",
      noResults: "Ничего не найдено",
      noResultsDesc: "Попробуйте поискать по другим словам.",
      viewSyncedLyrics: "Синхронный текст текущего трека",
      autoLrcBadge: "Найден одноимённый LRC",
      addToUrQueue: "+ Ur Queue",
      inUrQueue: "В Ur Queue",
    },
    queue: {
      upNextTab: "Далее (по умолчанию)",
      urQueueTab: "Ur Queue (ваш выбор)",
      emptyUrQueue: "Очередь Ur Queue пока пуста. Нажмите «+ Ur Queue» у любого трека в библиотеке, чтобы собрать свой список.",
      removeFromQueue: "Убрать из очереди",
    },
    playlists: {
      sectionTitle: "Ваши личные плейлисты",
      createBtn: "Создать плейлист",
      createTitle: "Новый плейлист",
      createSubtitle: "Организуйте свою коллекцию с фирменным цветом темы, значком и атмосферой люкс.",
      namePlaceholder: "например: Бесконечные тёмные ночи...",
      createConfirm: "Создать плейлист",
      cancel: "Отмена",
      likedName: "Любимые треки",
      allTracks: "Все треки",
      empty: "Этот плейлист пока пуст.",
      addTo: "Добавить в плейлист",
      added: "Добавлено",
      tracks: "треков",
      remove: "Удалить плейлист",
      doneBtn: "Готово",
      like: "В любимые треки",
      colorLabel: "Фирменный цвет темы",
      iconLabel: "Значок плейлиста",
    },
    lyrics: {
      externalLrcActive: "Авто-LRC из папки активен • EPODONIOS SYNC",
      nobodySync: "Движок Nobody Sync",
      loadLrcBtn: "Загрузить файл LRC",
      linesUnit: "строк",
      voidTitle: "У этого трека пока нет синхронного текста",
      noSyncedLyricsDesc:
        "Трек играет в своей чистейшей музыкальной форме — без синхронизации по времени. Положите одноимённый .lrc-файл рядом с аудио, загрузите его прямо здесь или позвольте Nobody найти текст за вас.",
      autoFindAction: "Найти текст автоматически (LRCLIB)",
      autoFindLoading: "Ищу текст песни…",
      autoFindApplied: "Синхронный текст найден и применён ✓",
      autoFindPlain: "Найден только простой текст (без таймингов) — его можно сохранить в Центре загрузок.",
      autoFindNone: "Для этого трека текст не найден.",
      autoFindError: "Не удалось связаться с LRCLIB — попробуйте ещё раз.",
    },
    contact: {
      headingTag: "ДИЗАЙН И АРХИТЕКТУРА — EPODONIOS",
      headingTitle: "Связь с автором (Contact Me)",
      headingSubtitle: "Звуковая инженерия и эстетика интерфейса от EPODONIOS; пространство, чтобы жить внутри музыки.",
      prefixText: "Aaaaaaaaaaaaaa music is ",
      telegramBtn: "Написать в Telegram",
      githubBtn: "Проекты на GitHub",
      connectMsg: "Пишите: отчёты об ошибках, совместные проекты и будущие сборки NOBODY от EPODONIOS.",
      tabContact: "Контакты",
      tabDedication: "Посвящение",
      dedicationTitle: "DEDICATION",
      dedicationBody:
        "Мистер NOBODY благодарит тебя — ты сделал этот день особенным просто тем, что оставался собой. Никого похожего на тебя в этом мире ещё не рождалось, и я в самом деле люблю твоё существование.",
      dedicationSign: "NOBODY",
      fromCreatorTag: "ОТ АВТОРА",
      creatorBody: "Привет, люди! Я EPODONIOS. Приложение — мой маленький подарок мистеру NOBODY. Пусть служит тебе верой и правдой.",
      creatorSign: "EPODONIOS",
      dedicationFooter: "NOBODY x EPODONIOS • СОЗДАНО С ЛЮБОВЬЮ • 2026",
      emailBtn: "Почта",
      instagramBtn: "Инстаграм",
      instagramSoon: "Скоро",
    },
    donate: {
      headingTag: "АУДИО-МЕЦЕНАТСТВО EPODONIOS",
      headingTitle: "Поддержать разработку NOBODY (Donate)",
      headingSubtitle: "Независимая, свободная десктоп-сцена. Ваша поддержка через криптовалюту и прямые каналы питает звуковую архитектуру EPODONIOS.",
      usdtLabel: "Адрес Tether (USDT - TRC20 / ERC20):",
      trxLabel: "Адрес Tron (TRX):",
      btcLabel: "Адрес Bitcoin (BTC):",
      reymitTitle: "Прямая поддержка через шлюз Reymit",
      reymitDesc: "Для быстрого и безопасного взноса в развитие будущих аудио-инструментов EPODONIOS воспользуйтесь проверенной страницей Reymit.",
      reymitBtn: "Открыть шлюз поддержки Reymit",
      copyAddressBtn: "Скопировать адрес кошелька",
      copiedMsg: "Адрес скопирован!",
      thankYouTitle: "Спасибо за вашу поддержку и верность",
      thankYouDesc: "Все взносы идут напрямую на исследование и разработку будущих версий NOBODY и кинематографичных интерфейсов EPODONIOS.",
    },
    settings: {
      headingTag: "ПЕРСОНАЛИЗИРУЙТЕ NOBODY ОТ EPODONIOS",
      headingTitle: "Сделайте пространство своим.",
      headingSubtitle:
        "Язык интерфейса, динамические цвета обложек, фоновое движение и размер текста песен — всё настраивается, не выходя из музыки.",
      appearanceGroup: "Динамическая тема и внешний вид",
      autoColor: "Умные цвета обложки",
      autoColorDesc: "Акцентные цвета интерфейса извлекаются из обложки альбома.",
      ambientMotion: "Фоновое движение",
      ambientMotionDesc: "Плавные световые переходы и кинетические анимации.",
      highContrast: "Повышенный контраст",
      highContrastDesc: "Текст легче читать на тёмном фоне.",
      darkAdaptive: "Кинематографичный тёмный режим",
      lyricsGroup: "Текст и перевод",
      showTranslation: "Показывать перевод",
      showTranslationDesc: "Перевод отображается под каждой строкой текста.",
      lyricSize: "Размер активной строки",
      smallText: "Тонкий",
      largeText: "Крупный",
      lyricStyleLabel: "Стиль отображения текста",
      lyricStyleDesc: "Выберите, как выглядит синхронный текст на экране",
      lyricStyleClassic: "Классика",
      lyricStyleKaraoke: "Караоке",
      lyricStyleMinimal: "Минимализм",
      interfaceGroup: "Интерфейс (UI)",
      interfaceDesc: "Выберите лицо NOBODY — переключение сопровождается коротким интро.",
      interfaceClassic: "Классика",
      interfaceCinema: "Cinema",
      interfaceEela: "EELA",
      interfaceAlok: "ALOK",
      idleEqLabel: "Стиль эквалайзера в режиме простоя",
      idleEqDesc: "Выберите анимацию звука на экране ожидания",
      idleEqBars: "Полосы",
      idleEqWave: "Волна",
      idleEqOrbit: "Орбита",
      idleEqRandom: "Случайно для каждого трека",
      compactStyleLabel: "Стиль компактного режима",
      compactStyleDesc: "Выберите раскладку мини-плеера",
      compactStyleClassic: "Классика",
      compactStyleCover: "С упором на обложку",
      compactStyleMinimal: "Минимализм",
      languageSelect: "Язык интерфейса (UI Language)",
      languageDesc: "Выберите язык меню, надписей и сообщений приложения.",
      musicFolder: "Папка музыки по умолчанию",
      musicFolderDesc: "C:\\Users\\Nobody\\Music",
      changeFolder: "Сменить папку",
      aboutVersion: "NOBODY DESKTOP PLAYER • ДИЗАЙН EPODONIOS • BUILD 2026.04",
    },
    compact: {
      enterCompact: "Компактный режим (мини-плеер)",
      exitCompact: "Выйти из компактного режима",
      hoverHint: "Наведите курсор за пределы текста, чтобы увидеть кнопки управления",
    },
    nudge: {
      donateTitle: "Поддержи NOBODY",
      donateBody: "NOBODY бесплатный и независимый. Маленькое пожертвование помогает проекту развиваться.",
      starTitle: "Поставь звезду на GitHub",
      starBody: "Понравился плеер? Звезда на GitHub — лучшее «спасибо» разработчику.",
      starAction: "Звезда на GitHub",
      donateAction: "Поддержать",
      dismiss: "Позже",
    },
  },
};
