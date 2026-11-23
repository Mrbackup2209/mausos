import React from 'react';
import { View, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import EditContactScreen from '../screens/contacts/EditContactScreen';
import CountdownScreen from '../screens/home/CountdownScreen';
import AlertStatusScreen from '../screens/home/AlertStatusScreen';
import AlertDetailScreen from '../screens/history/AlertDetailScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import DevToolsScreen from '../screens/dev/DevToolsScreen';
import Logo from '../components/Logo';
import ShakeTrigger from './ShakeTrigger';
import { navigationRef } from './navigationRef';
import StealthSetupScreen from '../screens/settings/StealthSetupScreen';
import CalculatorScreen from '../screens/stealth/CalculatorScreen';
import { useStealth } from '../context/StealthContext';
import { useContacts } from '../context/ContactsContext';
import { sendDuressAlert } from '../services/alertService';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../utils/theme';

const Stack = createNativeStackNavigator();


// ---------------------------------------------------------------------------
// Decides which part of the app the user sees.
//
// While Firebase is restoring the saved session we show a splash screen. Once
// `initialising` is false we either render the auth screens or the main app.
// Nothing in the app calls navigation.navigate() to sign in or out: changing
// `user` swaps the whole tree, which means there is no way to end up on a
// signed-in screen without a session, or vice versa.
// ---------------------------------------------------------------------------

function Splash() {
  return (
    <View style={styles.splash}>
      <Logo size={104} />
      <ActivityIndicator color={colors.primary} style={styles.spinner} />
    </View>
  );
}

// The tab bar is the base of the signed-in app. Screens that are a task rather
// than a destination — editing a contact, an alert in progress — open above it,
// so the tab bar is hidden while the task is in progress and returns when it
// ends.
function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen
        name="EditContact"
        component={EditContactScreen}
        options={{
          headerShown: true,
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerTintColor: colors.primary,
          headerTitleStyle: { ...typography.h3 },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />

      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          headerShown: true,
          title: 'Your details',
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerTintColor: colors.primary,
          headerTitleStyle: { ...typography.h3 },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="StealthSetup"
        component={StealthSetupScreen}
        options={{
          headerShown: true,
          title: 'Stealth mode',
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerTintColor: colors.primary,
          headerTitleStyle: { ...typography.h3 },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="AlertDetail"
        component={AlertDetailScreen}
        options={{
          headerShown: true,
          title: 'Alert',
          headerTintColor: colors.primary,
          headerTitleStyle: { ...typography.h3 },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />

      {/* The alert flow. Swipe-back is disabled on both so an alert can only be
          left deliberately: Cancel on the countdown, or the buttons on the
          status screen once sending has finished. */}
      <Stack.Screen
        name="Countdown"
        component={CountdownScreen}
        options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen
        name="AlertStatus"
        component={AlertStatusScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />

      {__DEV__ ? (
        <Stack.Screen
          name="DevTools"
          component={DevToolsScreen}
          options={{
            headerShown: true,
            title: 'Developer tools',
            headerTintColor: colors.primary,
            headerTitleStyle: { ...typography.h3 },
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
          }}
        />
      ) : null}
    </Stack.Navigator>
  );
}

// The calculator disguise. Drawn over the whole app rather than
// replacing it, so anything running underneath — an alert being sent — keeps
// running while the calculator is showing.
//
// It is shown in a Modal, which Android draws as a separate window above the
// app. An ordinary view, even with a high z-index, was drawn *behind* the
// navigator's native screens and so was invisible. The back button is
// ignored while it shows, so the disguise cannot be dismissed without a code.
function StealthGate() {
  const { user, profile } = useAuth();
  const { contacts } = useContacts();
  const { enabled, locked, unlock } = useStealth();
  if (!enabled || !locked) return null;

  function duress() {
    if (!user) return;
    sendDuressAlert({ uid: user.uid, profile, contacts }).catch((error) =>
      console.log('[MauSOS] Duress alert failed:', error?.message)
    );
  }

  return (
    <Modal visible animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <CalculatorScreen onUnlock={unlock} onDuress={duress} />
    </Modal>
  );
}

export default function RootNavigator() {
  const { user, initialising } = useAuth();
  const stealth = useStealth();

  // Until we know whether stealth mode is on, show nothing that names the app.
  if (!stealth.ready) return <View style={styles.blank} />;

  if (initialising) {
    return (
      <>
        <Splash />
        <StealthGate />
      </>
    );
  }

  return (
    <>
      <NavigationContainer ref={navigationRef}>
        {user ? <MainStack /> : <AuthStack />}
        {user && !stealth.locked ? <ShakeTrigger navigationRef={navigationRef} /> : null}
      </NavigationContainer>
      <StealthGate />
    </>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: '#101114' },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  spinner: { marginTop: spacing.xl },
});
