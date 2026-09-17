import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Users,
  PhoneCall,
  Calendar,
  BarChart3,
  Settings as SettingsIcon,
} from 'lucide-react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ListsScreen from '../screens/ListsScreen';
import ScanSheetScreen from '../screens/ScanSheetScreen';
import DialerHudScreen from '../screens/DialerHudScreen';
import CadenceSettingsScreen from '../screens/CadenceSettingsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import LeadDetailScreen from '../screens/LeadDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PlanningHeatmapScreen from '../screens/PlanningHeatmapScreen';
import { Colors } from '../theme/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();

  // Detect iOS Web or mobile devices for resilient bottom clearance
  const isMobileWeb =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isIOS =
    Platform.OS === 'ios' ||
    (Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      /iPhone|iPad|iPod/i.test(navigator.userAgent));

  // Determine bottom inset: on notched/gesture phones, guarantee at least 26px on iOS and 14px on Android/web
  const fallbackBottom = isIOS ? 26 : isMobileWeb ? 14 : 10;
  const bottomInset = Math.max(insets.bottom, fallbackBottom);

  // Total tab bar height: 56px inner content (22px icon + 14px label + vertical padding) + bottomInset
  const tabBarHeight = 56 + bottomInset;

  return (
    <Tab.Navigator
      initialRouteName="Lists"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.brandAccent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surfaceCard,
          borderTopColor: Colors.borderSubtle,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          lineHeight: 14,
          marginTop: 2,
          marginBottom: 0,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Lists"
        component={ListsScreen}
        options={{
          tabBarLabel: 'Educators',
          tabBarIcon: ({ color }) => <Users color={color} size={22} />,
        }}
      />
      <Tab.Screen
        name="Queue"
        component={DialerHudScreen}
        options={{
          tabBarLabel: 'Queue',
          tabBarIcon: ({ color }) => <PhoneCall color={color} size={22} />,
        }}
      />
      <Tab.Screen
        name="PlanningHeatmap"
        component={PlanningHeatmapScreen}
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ({ color }) => <Calendar color={color} size={22} />,
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: ({ color }) => <BarChart3 color={color} size={22} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <SettingsIcon color={color} size={22} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="MainTabs"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgApp },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
        <Stack.Screen name="DialerHUD" component={DialerHudScreen} />
        <Stack.Screen name="ScanSheet" component={ScanSheetScreen} />
        <Stack.Screen name="CadenceSettings" component={CadenceSettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

