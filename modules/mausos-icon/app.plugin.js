// ---------------------------------------------------------------------------
// Expo config plugin: gives the app two home-screen entries (D-34).
//
// Runs during `npx expo prebuild`. It moves the launcher intent filter off
// MainActivity and onto two activity aliases that both open MainActivity:
//
//   .LauncherDefault     MauSOS icon and name        enabled by default
//   .LauncherCalculator  calculator icon, "Calculator"  disabled by default
//
// The native module (MausosIconModule.kt) enables one and disables the other
// when stealth mode is switched on or off.
// ---------------------------------------------------------------------------

const { withAndroidManifest } = require('expo/config-plugins');

const LAUNCHER = 'android.intent.category.LAUNCHER';
const ALIASES = ['.LauncherDefault', '.LauncherCalculator'];

const launcherFilter = () => [
  {
    action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
    category: [{ $: { 'android:name': LAUNCHER } }],
  },
];

const hasLauncher = (filter) => (filter.category || []).some((c) => c.$['android:name'] === LAUNCHER);

module.exports = function withMausosIcon(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application[0];
    const activities = application.activity || [];
    const main =
      activities.find((a) => (a['intent-filter'] || []).some(hasLauncher)) ||
      activities.find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('mausos-icon: MainActivity not found in AndroidManifest');

    const target = main.$['android:name'];
    main['intent-filter'] = (main['intent-filter'] || []).filter((f) => !hasLauncher(f));

    application['activity-alias'] = (application['activity-alias'] || []).filter(
      (a) => !ALIASES.includes(a.$['android:name'])
    );
    application['activity-alias'].push(
      {
        $: {
          'android:name': '.LauncherDefault',
          'android:targetActivity': target,
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': launcherFilter(),
      },
      {
        $: {
          'android:name': '.LauncherCalculator',
          'android:targetActivity': target,
          'android:enabled': 'false',
          'android:exported': 'true',
          'android:icon': '@mipmap/mausos_calculator_icon',
          'android:roundIcon': '@mipmap/mausos_calculator_icon',
          'android:label': '@string/mausos_calculator_label',
        },
        'intent-filter': launcherFilter(),
      }
    );
    return cfg;
  });
};
