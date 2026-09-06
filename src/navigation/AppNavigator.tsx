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
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Lists"
        component={ListsScreen}
        options={{
          tabBarLabel: 'Educators',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size || 22} />,
        }}
      />
      <Tab.Screen
        name="Queue"
        component={DialerHudScreen}
        options={{
          tabBarLabel: 'Queue',
          tabBarIcon: ({ color, size }) => <PhoneCall color={color} size={size || 22} />,
        }}
      />
      <Tab.Screen
        name="PlanningHeatmap"
        component={PlanningHeatmapScreen}
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ({ color, size }) => <Calendar color={color} size={size || 22} />,
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size || 22} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size || 22} />,
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

