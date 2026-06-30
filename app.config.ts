import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

type VariantConfig = {
  name: string;
  applicationId: string;
};

type ExpoConfigWithNewArchitecture = ExpoConfig & {
  newArchEnabled: boolean;
};

const variantConfig: Record<AppVariant, VariantConfig> = {
  development: {
    name: 'Liqi Match Dev',
    applicationId: 'com.placeholder.liqimatch.dev',
  },
  preview: {
    name: 'Liqi Match Preview',
    applicationId: 'com.placeholder.liqimatch.preview',
  },
  production: {
    name: 'Liqi Match',
    applicationId: 'com.placeholder.liqimatch',
  },
};

function resolveVariant(value: string | undefined): AppVariant {
  if (value === undefined || value === '') {
    return 'development';
  }

  if (
    value === 'development' ||
    value === 'preview' ||
    value === 'production'
  ) {
    return value;
  }

  throw new Error(
    `Invalid APP_VARIANT "${value}". Expected development, preview, or production.`,
  );
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env.APP_VARIANT);
  const selectedConfig = variantConfig[variant];

  const resolvedConfig: ExpoConfigWithNewArchitecture = {
    ...config,
    name: selectedConfig.name,
    slug: 'liqimatch',
    scheme: 'liqimatch',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    icon: './assets/images/icon.png',
    ios: {
      ...config.ios,
      // TODO: Replace all placeholder application identifiers before the first store build.
      // Application IDs cannot be chosen casually once the store app is created.
      bundleIdentifier: selectedConfig.applicationId,
    },
    android: {
      ...config.android,
      // TODO: Replace all placeholder application identifiers before the first store build.
      // Application IDs cannot be chosen casually once the store app is created.
      package: selectedConfig.applicationId,
      adaptiveIcon: {
        backgroundColor: '#F6F7F9',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
    },
    web: {
      ...config.web,
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F6F7F9',
          android: {
            image: './assets/images/splash-icon.png',
            imageWidth: 76,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...config.extra,
      appVariant: variant,
    },
  };

  return resolvedConfig;
};
