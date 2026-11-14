import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { ContactsProvider } from './src/context/ContactsContext';
import { StealthProvider } from './src/context/StealthContext';
import RootNavigator from './src/navigation/RootNavigator';

// ---------------------------------------------------------------------------
// Application entry point.
//
// Provider order matters: SafeAreaProvider supplies screen insets to every
// screen, AuthProvider supplies the session, ContactsProvider reads that
// session to subscribe to the user's contacts, StealthProvider decides whether
// the calculator disguise is showing, and RootNavigator reads all three to
// decide what to render.
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ContactsProvider>
          <StealthProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </StealthProvider>
        </ContactsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
