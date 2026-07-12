import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

type VariantConfig = {
  name: string;
  applicationId: string;
};

const variantConfig: Record<AppVariant, VariantConfig> = {
  development: {
    name: 'Liqi Match Dev',
    applicationId: 'com.quemanhmcr.liqimatch.dev',
  },
  preview: {
    name: 'Liqi Match Preview',
    applicationId: 'com.quemanhmcr.liqimatch.preview',
  },
  production: {
    name: 'Liqi Match',
    applicationId: 'com.quemanhmcr.liqimatch',
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

  const resolvedConfig: ExpoConfig = {
    ...config,
    name: selectedConfig.name,
    owner: 'manhliqi',
    slug: 'liqimatch',
    scheme: 'liqimatch',
    version: '1.0.0',
    orientation: 'portrait',
    backgroundColor: '#030711',
    userInterfaceStyle: 'dark',
    icon: './assets/images/icon.png',
    ios: {
      ...config.ios,
      bundleIdentifier: selectedConfig.applicationId,
    },
    android: {
      ...config.android,
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
      'expo-dev-client',
      'expo-font',
      'expo-sharing',
      [
        'expo-media-library',
        {
          photosPermission:
            'Cho phép Liqi Match lưu ảnh hồ sơ chia sẻ vào thư viện ảnh của bạn.',
          savePhotosPermission:
            'Cho phép Liqi Match lưu ảnh hồ sơ chia sẻ vào thư viện ảnh của bạn.',
        },
      ],
      './plugins/withAndroidMaterialVersion',
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
      publicEnv: {
        apiUrl: process.env.EXPO_PUBLIC_API_URL,
        mediaBaseUrl: process.env.EXPO_PUBLIC_MEDIA_BASE_URL,
        supabasePublishableKey:
          process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      },
      eas: {
        projectId: '7ee062c0-f96d-4e09-9c94-794c49dd6e9c',
      },
    },
  };

  return resolvedConfig;
};
