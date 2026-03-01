/**
 * Capacitor native plugin initialization.
 * Only runs when the app is executing inside a native Android/iOS shell.
 * All code here is guarded by Capacitor.isNativePlatform() so the web
 * build is completely unaffected.
 */
import { Capacitor } from '@capacitor/core';

export async function initCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Dynamic imports keep these packages out of the web bundle
  const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);

  // Match the dark app background
  await StatusBar.setStyle({ style: Style.Dark });
  if (Capacitor.getPlatform() === 'android') {
    await StatusBar.setBackgroundColor({ color: '#0f0f14' });
  }

  // Dismiss the native splash screen with a short fade
  await SplashScreen.hide({ fadeOutDuration: 300 });
}
