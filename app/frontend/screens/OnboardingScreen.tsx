import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import CountryPicker from '../components/CountryPicker';
import { homeCuisinesFor } from '../lib/countries';


const LANGUAGES = ['English', 'Spanish', 'Mandarin', 'Hindi', 'French', 'Japanese', 'Portuguese', 'Arabic', 'Korean', 'Vietnamese'];
const DIETARY = ['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-Free', 'Lactose-Free', 'Pescatarian'];
const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'Beginner — I follow recipes closely',
  2: 'Casual — I cook simple dishes',
  3: 'Home cook — I improvise sometimes',
  4: 'Confident — I experiment freely',
  5: 'Expert — I cook from memory',
};

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [language, setLanguage] = useState('English');
  const [confidence, setConfidence] = useState(3);
  const [dietary, setDietary] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const TOTAL_STEPS = 4;

  const toggleDietary = (item: string) =>
    setDietary(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);

  const handleComplete = async () => {
    if (!user || !selectedCountryId) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        home_country: selectedCountryId,
        home_region: selectedRegion || null,
        home_cuisines: homeCuisinesFor(selectedCountryId, selectedRegion),
        preferred_language: language,
        cooking_confidence: confidence,
        dietary_preferences: dietary,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await refreshProfile();
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>Where are you from?</Text>
      <Text style={[styles.subheader, { color: colors.textSecondary }]}>
        Select your home country and region so we can tailor ingredient translations to your cuisine.
      </Text>

      <CountryPicker
        countryId={selectedCountryId}
        region={selectedRegion}
        onChangeCountry={setSelectedCountryId}
        onChangeRegion={setSelectedRegion}
      />
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>Preferred Language</Text>
      <Text style={[styles.subheader, { color: colors.textSecondary }]}>Select the language you'd like AI responses in.</Text>
      <View style={styles.list}>
        {LANGUAGES.map(item => {
          const sel = language === item;
          return (
            <TouchableOpacity
              key={item}
              style={[
                styles.listItem,
                { backgroundColor: colors.surface, borderColor: sel ? colors.primary : colors.border },
                sel && { backgroundColor: colors.primarySubtle },
              ]}
              onPress={() => setLanguage(item)}
            >
              <Text style={{ color: sel ? colors.primary : colors.textPrimary, fontWeight: sel ? '700' : '500', fontSize: 15 }}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>Cooking Confidence</Text>
      <Text style={[styles.subheader, { color: colors.textSecondary }]}>This helps us pitch recipes at the right level.</Text>

      <View style={[styles.confidenceCard, { backgroundColor: colors.primarySubtle, borderColor: colors.primary + '40' }]}>
        <Text style={[styles.confidenceLevel, { color: colors.primary }]}>{confidence}/5</Text>
        <Text style={[styles.confidenceDesc, { color: colors.textPrimary }]}>{CONFIDENCE_LABELS[confidence]}</Text>
      </View>

      <View style={styles.confidenceRow}>
        {[1, 2, 3, 4, 5].map(n => {
          const sel = confidence === n;
          return (
            <TouchableOpacity
              key={n}
              style={[
                styles.confidenceBtn,
                { backgroundColor: sel ? colors.primary : colors.surface, borderColor: sel ? colors.primary : colors.border },
              ]}
              onPress={() => setConfidence(n)}
            >
              <Text style={{ color: sel ? '#fff' : colors.textTertiary, fontWeight: '700', fontSize: 18 }}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>Dietary Preferences</Text>
      <Text style={[styles.subheader, { color: colors.textSecondary }]}>Optional: tell us about your dietary needs so we suggest the right brands.</Text>
      <View style={styles.chipContainer}>
        {DIETARY.map(item => {
          const sel = dietary.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[
                styles.chip,
                { backgroundColor: sel ? colors.primary : colors.surface, borderColor: sel ? colors.primary : colors.border },
              ]}
              onPress={() => toggleDietary(item)}
            >
              <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: sel ? '700' : '500', fontSize: 14 }}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const canAdvance = () => step === 1 ? !!selectedCountryId : true;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.progressBar, { backgroundColor: colors.surface }]}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%`, backgroundColor: colors.primary }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {step > 1 && (
          <TouchableOpacity
            style={[styles.backButton, { borderColor: colors.border }]}
            onPress={() => setStep(step - 1)}
          >
            <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.nextButton,
            { backgroundColor: canAdvance() ? colors.primary : colors.surface, opacity: isSubmitting ? 0.6 : 1 },
          ]}
          onPress={() => step < TOTAL_STEPS ? setStep(step + 1) : handleComplete()}
          disabled={!canAdvance() || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.nextButtonText, { color: canAdvance() ? '#fff' : colors.textTertiary }]}>
              {step === TOTAL_STEPS ? 'Get Started' : 'Next'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressBar: { height: 3, width: '100%' },
  progressFill: { height: '100%' },
  scrollContent: { padding: 24, paddingBottom: 16 },
  stepContainer: { flex: 1 },
  header: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  subheader: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  list: { gap: 10 },
  listItem: { padding: 16, borderRadius: 14, borderWidth: 1 },
  confidenceCard: {
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
  },
  confidenceLevel: { fontSize: 44, fontWeight: '800' },
  confidenceDesc: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  confidenceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  confidenceBtn: {
    flex: 1, height: 56, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center',
  },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, borderWidth: 1 },
  footer: { padding: 20, flexDirection: 'row', gap: 10, borderTopWidth: 1 },
  backButton: { flex: 1, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  backButtonText: { fontSize: 15, fontWeight: '600' },
  nextButton: { flex: 2, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  nextButtonText: { fontSize: 15, fontWeight: '700' },
});
