import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ServerWakeIndicator from './components/ServerWakeIndicator';
import { NavigationContainer } from '@react-navigation/native';
import { DefaultTheme as NavDefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { tokens } from './theme/colors';
import { loadByokKeys, clearLegacyByokKeys } from './lib/byok';
import AuthScreen from './screens/AuthScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ByokOnboardingScreen from './screens/ByokOnboardingScreen';
import HomeScreen from './screens/HomeScreen';
import MapScreen from './screens/MapScreen';
import ListScreen from './screens/ListScreen';
import ProfileScreen from './screens/ProfileScreen';
import MagicLensScreen from './screens/MagicLensScreen';

const BYOK_ONLY = process.env.EXPO_PUBLIC_BYOK_ONLY === 'true';

// Navigation theme wired to the design tokens
const navTheme = {
  ...NavDefaultTheme,
  colors: {
    ...NavDefaultTheme.colors,
    background: tokens.bgApp,
    card: tokens.bgSurface,
    text: tokens.textPrimary,
    border: tokens.borderDefault,
    primary: tokens.accentIcon,
    notification: tokens.highlightFill,
  },
};

const Tab = createBottomTabNavigator();

function MainTabNavigator() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          height: 90,
          paddingBottom: 30,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.borderDefault,
          elevation: 0,
          backgroundColor: colors.bgSurface,
        },
        tabBarActiveTintColor: colors.accentIcon,   // active nav: accent/icon (sits on the white tab bar)
        tabBarInactiveTintColor: colors.textSecondary,
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-variant" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map-marker-radius" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MagicLens"
        component={MagicLensScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: colors.actionPrimary,
              justifyContent: 'center', alignItems: 'center',
              marginBottom: 30,
              borderWidth: 4, borderColor: colors.bgSurface,
              shadowColor: colors.actionPrimary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
            }}>
              <MaterialCommunityIcons name="scan-helper" size={32} color={colors.onActionPrimary} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="List"
        component={ListScreen}
        options={{
          tabBarLabel: 'Recipes',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="silverware-fork-knife" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { user, profile, loading } = useAuth();
  const { colors } = useTheme();
  // Tracks whether the BYOK-only build has a usable LLM key. `null` until first check.
  const [hasLlmKey, setHasLlmKey] = useState<boolean | null>(BYOK_ONLY ? null : true);

  // One-shot cleanup of orphaned BYOK entries from older builds (Maps key, Tavily,
  // Firecrawl, explicit provider override). Safe to call repeatedly.
  useEffect(() => {
    clearLegacyByokKeys();
  }, []);

  useEffect(() => {
    if (!BYOK_ONLY) return;
    if (!user) return;  // re-check after sign-in
    loadByokKeys().then(k => setHasLlmKey(!!k.llmKey));
  }, [user]);

  const refreshLlmKey = () => {
    loadByokKeys().then(k => setHasLlmKey(!!k.llmKey));
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgApp }]}>
        <ActivityIndicator size="large" color={colors.accentIcon} />
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (profile === undefined) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgApp }]}>
        <ActivityIndicator size="large" color={colors.accentIcon} />
      </View>
    );
  }

  if (!profile?.onboarding_completed) {
    return <OnboardingScreen />;
  }

  // BYOK-only build: block the main UI until the user has stored an LLM key.
  if (BYOK_ONLY) {
    if (hasLlmKey === null) {
      return (
        <View style={[styles.centered, { backgroundColor: colors.bgApp }]}>
          <ActivityIndicator size="large" color={colors.accentIcon} />
        </View>
      );
    }
    if (!hasLlmKey) {
      return <ByokOnboardingScreen onConfigured={refreshLlmKey} />;
    }
  }

  return (
    <NavigationContainer theme={navTheme}>
      <MainTabNavigator />
    </NavigationContainer>
  );
}

// The UI is designed phone-first; on wide screens keep it in a centered column
// rather than stretching cards and the tab bar edge to edge.
function AppFrame({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.frameOuter, { backgroundColor: colors.bgApp }]}>
      <View style={[styles.frameInner, { backgroundColor: colors.bgApp, borderColor: colors.borderDefault }]}>
        {children}
        <ServerWakeIndicator />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <StatusBar style="dark" />
          <AppFrame>
            <AppContent />
          </AppFrame>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frameOuter: { flex: 1, alignItems: 'center' },
  frameInner: { flex: 1, width: '100%', maxWidth: 640, borderLeftWidth: 1, borderRightWidth: 1 },
});
