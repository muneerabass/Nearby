/** @type {import('expo/config').ExpoConfig} */
const { withAndroidManifest } = require('@expo/config-plugins');

const withOptionalPortraitFeature = (config) =>
  withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    const usesFeatures = manifest['uses-feature'] ?? [];
    const portraitFeature = usesFeatures.find(
      (feature) =>
        feature.$?.['android:name'] === 'android.hardware.screen.portrait'
    );

    if (portraitFeature) {
      portraitFeature.$['android:required'] = 'false';
    } else {
      usesFeatures.push({
        $: {
          'android:name': 'android.hardware.screen.portrait',
          'android:required': 'false',
        },
      });
    }

    manifest['uses-feature'] = usesFeatures;
    return manifestConfig;
  });

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  // EAS Build sets EAS_BUILD=true and EAS_BUILD_PROFILE to the profile name.
  // Fail hard here so a misconfigured distribution build is caught before
  // native configuration is generated — not after users install the app.
  const easProfile = process.env.EAS_BUILD_PROFILE;
  const isDistributionBuild =
    process.env.EAS_BUILD === 'true' &&
    (easProfile === 'release-apk' || easProfile === 'production');

  if (isDistributionBuild) {
    // C-001: require a stable backend URL — never a tunnel, emulator, or loopback.
    if (!apiUrl) {
      throw new Error(
        `[${easProfile}] EXPO_PUBLIC_API_URL is not set.\n` +
          'Supply it via EAS Secrets:\n' +
          '  eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://<your-backend-domain>'
      );
    }
    const devPatterns = ['ngrok', 'localhost', '127.0.0.1', '10.0.2.2', '0.0.0.0'];
    if (devPatterns.some((p) => apiUrl.includes(p))) {
      throw new Error(
        `[${easProfile}] EXPO_PUBLIC_API_URL contains a development address.\n` +
          'Set it to the stable production backend URL in EAS Secrets.'
      );
    }

    // H-006: require the Maps API key so the native SDK is configured at build time.
    if (!googleMapsApiKey) {
      throw new Error(
        `[${easProfile}] GOOGLE_MAPS_API_KEY is not set.\n` +
          'Supply it via EAS Secrets:\n' +
          '  eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value <your-key>\n\n' +
          'Restrictions to apply in Google Cloud Console before distribution:\n' +
          '  Android: restrict to your app package name + SHA-1 certificate fingerprint\n' +
          '  iOS: restrict to your app bundle ID\n' +
          '  APIs to enable: Maps SDK for Android, Maps SDK for iOS, Geocoding API'
      );
    }
  }

  const plugins = [...(config.plugins ?? [])];

  if (googleMapsApiKey) {
    plugins.push([
      'react-native-maps',
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
        iosGoogleMapsApiKey: googleMapsApiKey,
      },
    ]);
  }

  return withOptionalPortraitFeature({
    ...config,
    plugins,
  });
};
