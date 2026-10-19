// The brand logo, light or dark to match the theme: the system's, or the
// one chosen in Me → Appearance on this device (decision 133). Both images
// are in the page and CSS shows one (globals.css, .logo-light/.logo-dark),
// so a chosen theme wins too and no JS is needed; the hidden one is
// display:none, so it isn't read twice. The SVGs are outlined, so no font
// is needed.
const VARIANTS = {
  stacked: { width: 462, height: 340 },
  horizontal: { width: 686, height: 140 },
} as const;

type Props = {
  variant: keyof typeof VARIANTS;
  // Rendered width in px; the height follows the SVG's aspect ratio.
  width: number;
  // From messages (common.logoAlt); empty when the logo sits inside a link
  // that already has a label.
  alt: string;
  priority?: boolean;
};

export function Logo({ variant, width, alt, priority = false }: Props) {
  const size = VARIANTS[variant];
  const height = Math.round((width * size.height) / size.width);
  return (
    <>
      {(["light", "dark"] as const).map((theme) => (
        // Small static SVGs: next/image would add nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={theme}
          src={`/brand/moodbow-logo-${variant}-${theme}.svg`}
          alt={alt}
          width={width}
          height={height}
          className={`logo-${theme}`}
          fetchPriority={priority ? "high" : undefined}
        />
      ))}
    </>
  );
}
