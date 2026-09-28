// ── NOBODY · central support & contact data (V1.4.0) ─────────────────────────
// ONE source of truth for every face (classic / cinema / EELA / ALOK):
// donation wallets + direct-support portal + creator contact points.
// The data mirrors the CLASSIC donate/contact sections (user request #11:
// "اطلاعات بخش دونیت رو از classic ui بگیر"). When the donation info is
// updated later, THIS file is the only place that needs touching.

export interface SupportWallet {
  code: string;
  network: string;
  name: string;
  address: string;
  color: string;
  mono: string;
}

/** Crypto wallets — byte-identical to the classic UI's DonateView. */
export const DONATE_WALLETS: SupportWallet[] = [
  { code: "USDT", network: "TRC-20", name: "Tether", address: "TXYZ987654321USDT_PLACEHOLDER_TRC20", color: "#26a17b", mono: "₮" },
  { code: "TRX", network: "Tron", name: "Tron", address: "TRX1234567890_PLACEHOLDER_ADDRESS", color: "#ef0027", mono: "T" },
  { code: "BTC", network: "Bitcoin", name: "Bitcoin", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", color: "#f7931a", mono: "₿" },
];

/** Direct-support portal (classic's Reymit card). */
export const DONATE_DIRECT = {
  label: "Reymit",
  href: "https://reymit.ir/epodonios",
};

/** Creator contact points (user request #7). Instagram has no real page yet —
 *  it renders as a disabled "coming soon" row everywhere. */
export const CONTACT = {
  email: "Epodonios@gmail.com",
  telegramHandle: "@nowheremans",
  telegramHref: "https://t.me/nowheremans",
  githubHandle: "Epodonios/NOBODY-player",
  githubHref: "https://github.com/Epodonios/NOBODY-player",
  instagramHandle: "@epodonios",
  instagramHref: "", // not launched yet → "coming soon"
};

/** Copy an address to the clipboard with the legacy textarea fallback
 *  (the classic UI's proven approach — clipboard API can be blocked). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}
