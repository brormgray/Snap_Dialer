import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ListsScreen from '../screens/ListsScreen';
import ScanSheetScreen from '../screens/ScanSheetScreen';
import DialerHudScreen from '../screens/DialerHudScreen';
import CadenceSettingsScreen from '../screens/CadenceSettingsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import LeadDetailScreen from '../screens/LeadDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PlanningHeatmapScreen from '../screens/PlanningHeatmapScreen';
import { Colors } from '../theme/colors';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Lists"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgApp },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Lists" component={ListsScreen} />
        <Stack.Screen name="ScanSheet" component={ScanSheetScreen} />
        <Stack.Screen name="DialerHUD" component={DialerHudScreen} />
        <Stack.Screen name="CadenceSettings" component={CadenceSettingsScreen} />
        <Stack.Screen name="Analytics" component={AnalyticsScreen} />
        <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="PlanningHeatmap" component={PlanningHeatmapScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
