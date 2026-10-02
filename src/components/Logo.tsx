// The brand logo, light or dark to match the system theme (no JS: the
// browser picks the <source>). The SVGs are outlined, so no font is needed.
const VARIANTS = {
  stacked: { width: 462, height: 340 },
  horizontal: { width: 686, height: 140 },
} as const;

type Props = {
  variant: keyof typeof VARIANTS;
  // Rendered width in px; the height follows the SVG's aspect ratio.
  width: number;
  // Empty when the logo sits inside a link that already has a label.
  alt?: string;
  priority?: boolean;
};

export function Logo({ variant, width, alt = "Moodbow", priority = false }: Props) {
  const size = VARIANTS[variant];
  const height = Math.round((width * size.height) / size.width);
  return (
    <picture>
      <source srcSet={`/brand/moodbow-logo-${variant}-dark.svg`} media="(prefers-color-scheme: dark)" />
      <img
        src={`/brand/moodbow-logo-${variant}-light.svg`}
        alt={alt}
        width={width}
        height={height}
        fetchPriority={priority ? "high" : undefined}
      />
    </picture>
  );
}
