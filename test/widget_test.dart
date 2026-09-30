import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:moodbow_web/main.dart';

void main() {
  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets('renders without overflow at ${width.toInt()} px, 200% text',
        (tester) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.reset);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await tester.pumpWidget(const MoodbowApp());
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('A journal that learns your story.'), findsOneWidget);
      expect(find.text('Coming soon'), findsOneWidget);
      expect(find.text('Get notified'), findsOneWidget);
      expect(find.text('A BurrowSoft product'), findsOneWidget);
      expect(find.text('© 2026 BurrowSoft'), findsOneWidget);
    });
  }

  testWidgets('dark mode renders', (tester) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);

    await tester.pumpWidget(const MoodbowApp());
    await tester.pumpAndSettle();

    final context = tester.element(find.text('Get notified'));
    expect(Theme.of(context).brightness, Brightness.dark);
  });
}
