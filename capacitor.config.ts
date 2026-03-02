import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pdfreaderpro.app',
  appName: 'PDF Reader Pro',
  webDir: 'dist',

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: false, // We hide it manually after init
      backgroundColor: '#0f0f14',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0f0f14',
      overlaysWebView: false,
    },
  },

  android: {
    allowMixedContent: false,
  },
};

export default config;
