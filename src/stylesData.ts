import { CSSProperties } from "react";

export const MUSIC_ADJECTIVES: string[] = [
  "immortal",
  "transcendent",
  "divine",
  "infinite",
  "therapeutic",
  "cosmic",
  "eternal",
  "intoxicating",
  "healing",
  "luminous",
  "ethereal",
  "hypnotic",
  "celestial",
  "liberating",
  "transformative",
  "unbound",
  "unearthly",
  "magnetic",
  "profound",
  "boundless",
  "cathartic",
  "mesmerizing",
  "otherworldly",
  "enigmatic",
  "timeless",
  "unfathomable",
  "radiant",
  "ecstatic",
  "subliminal",
  "invincible",
  "mystic",
  "euphoric",
  "ineffable",
  "sacred",
  "soothing",
  "vibrant",
  "electrifying",
  "captivating",
  "soul-shaking",
  "weightless",
  "cinematic",
  "atmospheric",
  "undeniable",
  "irresistible",
  "unyielding",
  "rejuvenating",
  "translucent",
  "spellbinding",
  "miraculous",
  "restorative",
  "resplendent",
  "poetic",
  "invigorating",
  "incomparable",
  "soaring",
  "omnipotent",
  "dreamlike",
  "kaleidoscopic",
  "transcendental",
  "prismatic",
  "seraphic",
  "majestic",
  "seductive",
  "lucid",
  "immaculate",
  "unapologetic",
  "limitless",
  "graceful",
  "velvet-dark",
  "moonlit",
  "electronic",
  "volcanic",
  "elegant",
  "sensory",
  "resonant",
  "opulent",
  "silken",
  "chromatic",
  "liquid",
  "magical",
  "stellar",
  "architectural",
  "nocturnal",
  "vivid",
  "magnetized",
  "levitating",
  "haunting",
  "adrenaline-lit",
  "symphonic",
  "futuristic",
  "secretive",
  "crystalline",
  "restless",
  "shimmering",
  "magnetic-slowfire",
  "dimensional",
  "lunar",
  "monumental",
  "gilded",
  "soulborne",
  "midnight-born",
  "EPODONIOS architectural",
];

export interface TitleAnimConfig {
  name: string;
  className: string;
  style: CSSProperties;
}

/* PHASE-1 PERF FIX — GPU-SAFE TITLE ANIMATION POOL:
   The old pool mixed 25 classes, ~62% of which animated EXPENSIVE properties
   on the giant 96px title — filter (drop-shadow / hue-rotate), text-shadow,
   letter-spacing (re-layouts the title every frame!) and background-position
   on clipped gradients. Those keyframes still exist in index.css but are no
   longer selectable. This pool only contains transform/opacity-only
   animations (plus two static classes with no animation at all), so every
   pick is compositor-cheap. 10 classes × 40 CSS-var variants = 400 configs. */
const ANIMATION_CLASSES = [
  "anim-kinetic-float",   // transform translateY
  "anim-depth-slide",     // transform translateY (static shadow)
  "anim-zoom-soft",       // opacity + transform scale
  "anim-aurora-glow",     // opacity only
  "anim-matrix-drift",    // transform translateY
  "anim-cosmic-shimmer",  // opacity only
  "anim-electric-voltage",// transform translateX (steps)
  "anim-supernova-rise",  // transform + opacity
  "anim-velvet-shadow",   // static text-shadow, no animation
  "anim-vinyl-spinlight", // static gradient + one-time filter, no animation
];

// Generate 400 unique title animation configurations
export const TITLE_ANIMATIONS: TitleAnimConfig[] = Array.from({ length: 400 }, (_, idx) => {
  const animClass = ANIMATION_CLASSES[idx % ANIMATION_CLASSES.length];
  const hueShift = (idx * 19) % 360;
  const shadowSpread = 12 + (idx % 28);
  const letterSpace = -0.065 + ((idx % 15) * 0.007);
  const duration = 2.4 + ((idx % 18) * 0.2);
  const floatDist = 4 + (idx % 8);

  return {
    name: `EPODONIOS Effect ${idx + 1}`,
    className: `focus-title-dynamic ${animClass}`,
    style: {
      "--anim-idx": idx,
      "--hue-rotate": `${hueShift}deg`,
      "--glow-blur": `${shadowSpread}px`,
      "--anim-duration": `${duration}s`,
      "--float-dist": `${floatDist}px`,
      letterSpacing: `${letterSpace}em`,
    } as CSSProperties,
  };
});

export function getRandomTitleAnim(): TitleAnimConfig {
  const randomIndex = Math.floor(Math.random() * TITLE_ANIMATIONS.length);
  return TITLE_ANIMATIONS[randomIndex];
}

// 400 UNIQUE ENGLISH ARTIST FONT STYLES
const FONT_FAMILIES = [
  "Cinzel",
  "Montserrat",
  "Playfair Display",
  "Bebas Neue",
  "Orbitron",
  "Rajdhani",
  "Syne",
  "Space Grotesk",
  "Righteous",
  "Archivo Black",
  "Fredoka",
  "Satisfy",
  "Cormorant Garamond",
  "Josefin Sans",
  "Abril Fatface",
  "Lobster",
  "Pacifico",
  "Chakra Petch",
  "Russo One",
  "Exo 2",
  "Quantico",
  "Syncopate",
  "Monoton",
  "Megrim",
  "Unica One",
  "Electrolize",
  "Julius Sans One",
  "Michroma",
  "Oxanium",
  "Saira Stencil One",
  "Faster One",
  "Wallpoet",
  "Revalia",
  "Iceberg",
  "Tomorrow",
  "Bungee",
  "Teko",
  "Oswald",
  "Anton",
  "Comfortaa",
];

export interface ArtistFontPreset {
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
  textTransform: "uppercase" | "lowercase" | "capitalize" | "none";
  fontStyle: "normal" | "italic";
  textShadow?: string;
}

export const ARTIST_FONTS_400: ArtistFontPreset[] = [];

FONT_FAMILIES.forEach((family) => {
  for (let variant = 0; variant < 10; variant++) {
    const weights = [300, 400, 500, 600, 700, 800, 900, 400, 700, 300];
    const spacings = [
      "0em",
      "0.06em",
      "0.12em",
      "0.2em",
      "-0.02em",
      "0.04em",
      "0.16em",
      "0.1em",
      "0.25em",
      "-0.03em",
    ];
    const transforms: ("uppercase" | "lowercase" | "capitalize" | "none")[] = [
      "uppercase",
      "none",
      "capitalize",
      "uppercase",
      "lowercase",
      "none",
      "uppercase",
      "capitalize",
      "uppercase",
      "none",
    ];
    const styles: ("normal" | "italic")[] = [
      "normal",
      "normal",
      "italic",
      "normal",
      "normal",
      "italic",
      "normal",
      "normal",
      "italic",
      "normal",
    ];

    let shadow: string | undefined;
    if (variant === 2 || variant === 6) {
      shadow = "0 0 16px color-mix(in srgb, var(--accent) 55%, transparent)";
    } else if (variant === 4 || variant === 8) {
      shadow = "2px 2px 0px rgba(0,0,0,0.5)";
    } else if (variant === 9) {
      shadow = "0 0 25px var(--secondary)";
    }

    ARTIST_FONTS_400.push({
      fontFamily: `"${family}", "Segoe UI", sans-serif`,
      fontWeight: weights[variant],
      letterSpacing: spacings[variant],
      textTransform: transforms[variant],
      fontStyle: styles[variant],
      textShadow: shadow,
    });
  }
});

export function shouldUseArtistFont(artistName: string): boolean {
  return /^[A-Za-z0-9\s.'&()\-_/!]+$/.test(artistName.trim());
}

export function getArtistFontStyle(artistName: string): CSSProperties {
  let hash = 0;
  for (let i = 0; i < artistName.length; i++) {
    hash = (hash << 5) - hash + artistName.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);
  const preset = ARTIST_FONTS_400[posHash % ARTIST_FONTS_400.length];

  return {
    fontFamily: preset.fontFamily,
    fontWeight: preset.fontWeight,
    letterSpacing: preset.letterSpacing,
    textTransform: preset.textTransform,
    fontStyle: preset.fontStyle,
    textShadow: preset.textShadow,
  };
}
