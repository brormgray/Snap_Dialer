import React, { useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { getDatabase } from './src/db/database';
import { Colors } from './src/theme/colors';

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
  useEffect(() => {
    getDatabase().catch((e) => console.warn('Database initialization note:', e));

    // Register PWA Service Worker on Web for 100% Offline Resilience & Auto-Updates
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('SnapDialer PWA Service Worker registered:', reg.scope);
            // Detect background updates
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
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.sacredGreenDeep} />
        <AppNavigator />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.sacredGreenDeep,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 12,
  },
  errorDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
