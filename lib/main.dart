import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'coming_soon_page.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Build the semantics tree up front so screen readers and keyboard users
  // don't have to find Flutter's hidden "Enable accessibility" button first.
  SemanticsBinding.instance.ensureSemantics();
  runApp(const MoodbowApp());
}

class MoodbowApp extends StatelessWidget {
  const MoodbowApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Moodbow — A journal that learns your story',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      home: const ComingSoonPage(),
    );
  }
}
