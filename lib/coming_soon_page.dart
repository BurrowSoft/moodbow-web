import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/link.dart';

import 'theme.dart';

final _notifyUri = Uri.parse(
  'mailto:support@burrowsoft.com?subject=Notify%20me%20about%20Moodbow',
);
final _burrowSoftUri = Uri.parse('https://www.burrowsoft.com');

const _maxContentWidth = 560.0;
const _mobileBreakpoint = 600.0;

/// Height / width of the stacked logo SVGs (462 × 340), so the space is
/// reserved before the asset loads.
const _logoAspect = 340 / 462;

class ComingSoonPage extends StatefulWidget {
  const ComingSoonPage({super.key});

  @override
  State<ComingSoonPage> createState() => _ComingSoonPageState();
}

class _ComingSoonPageState extends State<ComingSoonPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _fade = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_fade.isAnimating || _fade.isCompleted) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _fade.value = 1;
    } else {
      _fade.forward();
    }
  }

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.sizeOf(context).width < _mobileBreakpoint;
    final sidePadding = isMobile ? 24.0 : 32.0;

    return Scaffold(
      body: SafeArea(
        child: FadeTransition(
          opacity: CurvedAnimation(parent: _fade, curve: Curves.easeOut),
          // Fills the viewport on tall screens (content centered, footer
          // pinned to the bottom) and scrolls when content is taller, e.g.
          // with large text scaling.
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              child: Container(
                constraints: BoxConstraints(
                  minWidth: constraints.maxWidth,
                  minHeight: constraints.maxHeight,
                ),
                padding: EdgeInsets.symmetric(horizontal: sidePadding),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const SizedBox.shrink(),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          maxWidth: _maxContentWidth,
                        ),
                        child: _Content(isMobile: isMobile),
                      ),
                    ),
                    const _Footer(),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.isMobile});

  final bool isMobile;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final textTheme = Theme.of(context).textTheme;
    final logoWidth = isMobile ? 120.0 : 160.0;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          label: 'Moodbow',
          image: true,
          child: ExcludeSemantics(
            child: SvgPicture.asset(
              palette.logoAsset,
              width: logoWidth,
              height: logoWidth * _logoAspect,
            ),
          ),
        ),
        const SizedBox(height: 32),
        const _ComingSoonPill(),
        const SizedBox(height: 20),
        Semantics(
          header: true,
          child: Text(
            'A journal that learns your story.',
            textAlign: TextAlign.center,
            style: textTheme.headlineMedium?.copyWith(
              fontSize: isMobile ? 28 : 36,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Moodbow is a private journal that helps you notice patterns in '
          'your mood, sleep and habits over time. '
          "We're putting the finishing touches on it.",
          textAlign: TextAlign.center,
          style: textTheme.bodyLarge?.copyWith(fontSize: isMobile ? 16 : 17),
        ),
        const SizedBox(height: 36),
        Link(
          uri: _notifyUri,
          target: LinkTarget.self,
          builder: (context, followLink) => Semantics(
            label: 'Get notified by email when Moodbow launches',
            excludeSemantics: true,
            button: true,
            child: FilledButton(
              onPressed: followLink,
              child: const Text('Get notified'),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          "We'll email you once, when it launches.",
          textAlign: TextAlign.center,
          style: textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _ComingSoonPill extends StatelessWidget {
  const _ComingSoonPill();

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return DecoratedBox(
      decoration: ShapeDecoration(
        color: palette.pillBackground,
        shape: const StadiumBorder(),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Text(
          'Coming soon',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.3,
            color: palette.accent,
          ),
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 4,
        children: [
          Link(
            uri: _burrowSoftUri,
            target: LinkTarget.self,
            builder: (context, followLink) => Semantics(
              label: 'A BurrowSoft product. Visit burrowsoft.com',
              excludeSemantics: true,
              link: true,
              child: TextButton(
                onPressed: followLink,
                child: const Text('A BurrowSoft product'),
              ),
            ),
          ),
          Text('·', style: textTheme.bodySmall),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            child: Text('© 2026 BurrowSoft', style: textTheme.bodySmall),
          ),
        ],
      ),
    );
  }
}
