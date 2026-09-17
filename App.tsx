import React, { useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, AppState, AppStateStatus, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { getDatabase } from './src/db/database';
import { Colors } from './src/theme/colors';
import { SecurityService } from './src/services/securityService';
import PinLockModal from './src/components/PinLockModal';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  state = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMessage: error?.message || String(error) };
  }

  componentDidCatch(error: any, info: any) {
    console.error('App Root ErrorBoundary caught exception:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <StatusBar barStyle="light-content" backgroundColor={Colors.sacredGreenDeep} />
          <Text style={styles.errorTitle}>App Error Detected</Text>
          <Text style={styles.errorDescription}>{this.state.errorMessage}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [isLocked, setIsLocked] = React.useState<boolean>(() => SecurityService.isSessionLocked());

  useEffect(() => {
    getDatabase().catch((e) => console.warn('Database initialization note:', e));

    const checkLockInterval = setInterval(() => {
      if (SecurityService.isSessionLocked()) {
        setIsLocked(true);
      }
    }, 15000); // Check every 15s for inactivity lockout

    const handleUserActivity = () => {
      SecurityService.recordActivity();
    };

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (SecurityService.isPinConfigured()) {
          SecurityService.lockSession();
          setIsLocked(true);
        }
      } else if (nextAppState === 'active') {
        if (SecurityService.isSessionLocked()) {
          setIsLocked(true);
        }
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        if (document.visibilityState === 'hidden') {
          if (SecurityService.isPinConfigured()) {
            SecurityService.lockSession();
            setIsLocked(true);
          }
        } else if (document.visibilityState === 'visible') {
          if (SecurityService.isSessionLocked()) {
            setIsLocked(true);
          }
        }
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('touchstart', handleUserActivity, { passive: true });
      window.addEventListener('mousedown', handleUserActivity, { passive: true });
      window.addEventListener('keydown', handleUserActivity, { passive: true });
    }

    // Inject mobile viewport & input zoom lock CSS on Web
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (!document.getElementById('mobile-ux-viewport-lock')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'mobile-ux-viewport-lock';
        styleEl.innerHTML = `
          html, body, #root {
            height: 100% !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            overflow-x: hidden !important;
            width: 100% !important;
            max-width: 100vw !important;
            touch-action: pan-y manipulation !important;
            -webkit-text-size-adjust: 100% !important;
            -webkit-tap-highlight-color: transparent;
            overscroll-behavior-y: none;
          }
          input, textarea, select {
            font-size: 16px !important;
          }
          * {
            box-sizing: border-box;
          }
        `;
        document.head.appendChild(styleEl);
      }
    }

    // Register PWA Service Worker on Web for 100% Offline Resilience & Auto-Updates
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('SnapDialer PWA Service Worker registered:', reg.scope);
            reg.onupdatefound = () => {
              const installingWorker = reg.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('New SnapDialer version downloaded and cached over-the-air.');
                  }
                };
              }
            };
          })
          .catch((err) => {
            console.log('PWA Service Worker registration note:', err);
          });
      };

      if (typeof document !== 'undefined' && document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }
    }

    return () => {
      clearInterval(checkLockInterval);
      appStateSub.remove();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('touchstart', handleUserActivity);
        window.removeEventListener('mousedown', handleUserActivity);
        window.removeEventListener('keydown', handleUserActivity);
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />
        <AppNavigator />
        <PinLockModal visible={isLocked} onUnlocked={() => setIsLocked(false)} />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.bgApp,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.callHangup,
    marginBottom: 12,
  },
  errorDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
