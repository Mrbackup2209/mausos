import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/home/HomeScreen';
import ContactsScreen from '../screens/contacts/ContactsScreen';
import HistoryScreen from '../screens/history/HistoryScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { useContacts } from '../context/ContactsContext';
import { colors } from '../utils/theme';

const Tab = createBottomTabNavigator();

// The SOS tab is first and is the screen the app opens on, so the trigger is
// always one tap or zero taps away. History sits next to it: after an alert,
// the record is the next thing the user is likely to look for. Settings is
// last: it is visited rarely, and never in a hurry.
const ICONS = {
  SOS: ['shield', 'shield-outline'],
  History: ['time', 'time-outline'],
  Settings: ['settings', 'settings-outline'],
  Contacts: ['people', 'people-outline'],
};

export default function MainTabs() {
  const { contacts, loading } = useContacts();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = ICONS[route.name];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="SOS" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          // A red dot while there are no contacts: the one piece of setup the
          // alert cannot work without.
          tabBarBadge: !loading && contacts.length === 0 ? '' : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.danger,
            minWidth: 10,
            maxHeight: 10,
            borderRadius: 5,
            fontSize: 0,
            top: 4,
          },
        }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
