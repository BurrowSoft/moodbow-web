import 'package:flutter/material.dart';

/// Moodbow brand palette (see the brand kit README).
abstract final class MoodbowColors {
  static const cream = Color(0xFFFBF6F1);
  static const ink = Color(0xFF2B2438);
  static const peach = Color(0xFFF2A07B);
  static const rose = Color(0xFFE27D9A);
  static const deepRose = Color(0xFFA8456A);
  static const lavender = Color(0xFF9B84D6);
  static const mutedLight = Color(0xFF6B6278);
  static const mutedDark = Color(0xFFC9C1D4);
}

/// Colors that differ between light and dark mode, exposed as a theme
/// extension so widgets don't branch on brightness themselves.
@immutable
class MoodbowPalette extends ThemeExtension<MoodbowPalette> {
  const MoodbowPalette({
    required this.background,
    required this.text,
    required this.mutedText,
    required this.accent,
    required this.onAccent,
    required this.pillBackground,
    required this.logoAsset,
  });

  final Color background;
  final Color text;
  final Color mutedText;

  /// Accent used for text, links and the button fill. Deep rose on light
  /// (contrast-safe on cream), rose on dark.
  final Color accent;
  final Color onAccent;
  final Color pillBackground;
  final String logoAsset;

  static const light = MoodbowPalette(
    background: MoodbowColors.cream,
    text: MoodbowColors.ink,
    mutedText: MoodbowColors.mutedLight,
    accent: MoodbowColors.deepRose,
    onAccent: MoodbowColors.cream,
    pillBackground: Color(0xFFF9EAEC),
    logoAsset: 'assets/brand/moodbow-logo-stacked-light.svg',
  );

  static const dark = MoodbowPalette(
    background: MoodbowColors.ink,
    text: MoodbowColors.cream,
    mutedText: MoodbowColors.mutedDark,
    accent: MoodbowColors.rose,
    onAccent: MoodbowColors.ink,
    pillBackground: Color(0xFF382C43),
    logoAsset: 'assets/brand/moodbow-logo-stacked-dark.svg',
  );

  @override
  MoodbowPalette copyWith({
    Color? background,
    Color? text,
    Color? mutedText,
    Color? accent,
    Color? onAccent,
    Color? pillBackground,
    String? logoAsset,
  }) {
    return MoodbowPalette(
      background: background ?? this.background,
      text: text ?? this.text,
      mutedText: mutedText ?? this.mutedText,
      accent: accent ?? this.accent,
      onAccent: onAccent ?? this.onAccent,
      pillBackground: pillBackground ?? this.pillBackground,
      logoAsset: logoAsset ?? this.logoAsset,
    );
  }

  @override
  MoodbowPalette lerp(MoodbowPalette? other, double t) {
    if (other == null) return this;
    return MoodbowPalette(
      background: Color.lerp(background, other.background, t)!,
      text: Color.lerp(text, other.text, t)!,
      mutedText: Color.lerp(mutedText, other.mutedText, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      onAccent: Color.lerp(onAccent, other.onAccent, t)!,
      pillBackground: Color.lerp(pillBackground, other.pillBackground, t)!,
      logoAsset: t < 0.5 ? logoAsset : other.logoAsset,
    );
  }
}

const _fontFamily = 'Poppins';

ThemeData buildTheme(Brightness brightness) {
  final palette =
      brightness == Brightness.light ? MoodbowPalette.light : MoodbowPalette.dark;

  final scheme = ColorScheme.fromSeed(
    seedColor: MoodbowColors.rose,
    brightness: brightness,
  ).copyWith(
    primary: palette.accent,
    onPrimary: palette.onAccent,
    surface: palette.background,
    onSurface: palette.text,
  );

  // Button themes take these styles directly, so they need the font family
  // themselves (ThemeData.fontFamily is only applied to the final text theme).
  final textTheme = TextTheme(
    headlineMedium: TextStyle(
      fontWeight: FontWeight.w500,
      height: 1.2,
      letterSpacing: -0.5,
      color: palette.text,
    ),
    bodyLarge: TextStyle(
      fontWeight: FontWeight.w400,
      height: 1.6,
      color: palette.mutedText,
    ),
    bodySmall: TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w400,
      height: 1.5,
      color: palette.mutedText,
    ),
    labelLarge: const TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.1,
    ),
  ).apply(fontFamily: _fontFamily);

  // A visible ring for keyboard focus; the default overlay alone is too faint.
  final focusRing = WidgetStateProperty.resolveWith<BorderSide?>(
    (states) => states.contains(WidgetState.focused)
        ? BorderSide(color: palette.text, width: 2)
        : null,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: _fontFamily,
    textTheme: textTheme,
    scaffoldBackgroundColor: palette.background,
    extensions: [palette],
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: palette.accent,
        foregroundColor: palette.onAccent,
        minimumSize: const Size(200, 52),
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
        shape: const StadiumBorder(),
        textStyle: textTheme.labelLarge,
      ).copyWith(side: focusRing),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: palette.accent,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        textStyle: textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w500),
        shape: const StadiumBorder(),
      ).copyWith(side: focusRing),
    ),
  );
}

extension MoodbowThemeX on BuildContext {
  MoodbowPalette get palette => Theme.of(this).extension<MoodbowPalette>()!;
}
