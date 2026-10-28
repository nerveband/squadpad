import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReservedRegionsProvider } from 'react-native-reserved-regions';
import { StyleSheet } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSettings } from '../src/hooks/useSettings';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { settings } = useSettings();
  const [fontsLoaded, fontError] = useFonts({
    'Outfit-Regular': require('../assets/fonts/Outfit-Regular.ttf'),
    'Outfit-SemiBold': require('../assets/fonts/Outfit-SemiBold.ttf'),
    'Outfit-Bold': require('../assets/fonts/Outfit-Bold.ttf'),
    'Outfit-ExtraBold': require('../assets/fonts/Outfit-ExtraBold.ttf'),
    'Ioskeley-Mono': require('../assets/fonts/Ioskeley-Mono.ttf'),
    'Ioskeley-Mono-Semibold': require('../assets/fonts/Ioskeley-Mono-Semibold.ttf'),
    'Ioskeley-Mono-Bold': require('../assets/fonts/Ioskeley-Mono-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Global orientation preference. iOS 27 (iPhone Duo inner display, Split View,
  // iPhone Mirroring) and Android large screens may refuse orientation locks, so
  // swallow rejections and always lay out from live window dimensions.
  useEffect(() => {
    if (settings.allowPortrait) {
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
  }, [settings.allowPortrait]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ReservedRegionsProvider style={styles.root}>
        <GestureHandlerRootView style={styles.root}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0d0b1a' },
              animation: 'slide_from_right',
            }}
          />
        </GestureHandlerRootView>
      </ReservedRegionsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0b1a' },
});
