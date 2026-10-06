import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Modal, Linking, FlatList,
} from 'react-native';
import { Alert } from '../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import {
  ByokKeys, loadByokKeys, saveByokKeys, clearAllByokKeys,
  detectLLMProvider, providerDisplayName,
} from '../lib/byok';
import {
  ModelOption, modelsForProvider, visionModels,
  defaultVisionModel, defaultTextModel, formatPrice,
} from '../lib/models';
import { fetchOpenRouterModels, sortByPrice } from '../lib/openrouter';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const LLM_PROVIDER_LINKS = [
  { label: 'Get an OpenRouter key', url: 'https://openrouter.ai/keys' },
  { label: 'Get an OpenAI key', url: 'https://platform.openai.com/api-keys' },
  { label: 'Get an Anthropic key', url: 'https://console.anthropic.com/settings/keys' },
];

// On Settings load, swap a stale stored model for the provider's default if it
// isn't valid for the currently-detected provider. Catches the case where a user
// switched key types between sessions (e.g. picked an OpenRouter model on an old
// install, then pasted an Anthropic key — the OpenRouter model ID would silently
// 404 against Anthropic's API). For OpenRouter we trust the user's pick because
// the live /models endpoint exposes 300+ models that aren't in our static fallback.
function autoCorrectModels(loaded: ByokKeys): ByokKeys {
  const provider = detectLLMProvider(loaded.llmKey);
  if (provider === 'openrouter') return loaded;
  const validIds = new Set(modelsForProvider(provider).map(m => m.id));
  const fixed = { ...loaded };
  if (fixed.llmVisionModel && !validIds.has(fixed.llmVisionModel)) {
    fixed.llmVisionModel = defaultVisionModel(provider);
  }
  if (fixed.llmTextModel && !validIds.has(fixed.llmTextModel)) {
    fixed.llmTextModel = defaultTextModel(provider);
  }
  return fixed;
}

export default function SettingsScreen({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<ByokKeys>({});
  const [reveal, setReveal] = useState(false);
  const [orModels, setOrModels] = useState<ModelOption[]>([]);
  const [orFetching, setOrFetching] = useState(false);
  const [modelPicker, setModelPicker] = useState<null | { kind: 'vision' | 'text' }>(null);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setLoading(true);
      try {
        const loaded = await loadByokKeys();
        setKeys(autoCorrectModels(loaded));
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  // Single source of truth: provider is derived from the key prefix. The backend uses
  // the same logic in providers.py:detect_provider, so what we show in the picker is
  // what actually gets routed. There is intentionally no explicit-provider override —
  // a previous version of this screen had one, and it silently diverged the model list
  // from the backend's routing (sk-or key + manually-picked Anthropic-native model ID
  // → backend called OpenRouter with the wrong model ID → silent 404).
  const detectedProvider = detectLLMProvider(keys.llmKey);

  useEffect(() => {
    if (!visible || detectedProvider !== 'openrouter') return;
    setOrFetching(true);
    fetchOpenRouterModels()
      .then(setOrModels)
      .catch(() => setOrModels([]))  // silently fall back to hardcoded list
      .finally(() => setOrFetching(false));
  }, [visible, detectedProvider]);

  const availableModels = useMemo(
    () => modelsForProvider(detectedProvider, orModels),
    [detectedProvider, orModels],
  );

  const visionOnly = useMemo(() => sortByPrice(visionModels(availableModels)), [availableModels]);
  const allModels = useMemo(() => sortByPrice(availableModels), [availableModels]);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveByokKeys(keys);
      Alert.alert('Saved', 'Your key and model picks are saved in this browser only.');
      onClose();
    } catch (e: any) {
      Alert.alert('Save failed', e.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const onClearAll = () => {
    Alert.alert(
      'Clear your LLM key?',
      'You will be sent back to the BYOK setup screen until you add a key again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllByokKeys();
            setKeys({});
            Alert.alert('Cleared', 'Your LLM key has been removed from this browser.');
          },
        },
      ],
    );
  };

  // Whenever the key changes, reset models if the detected provider changed (stale
  // models from a different provider will silently fail at API call time — e.g.
  // OpenRouter API doesn't know Anthropic-native model IDs).
  const onLlmKeyChange = (v: string) => {
    setKeys(prev => {
      const next = { ...prev, llmKey: v };
      const prevProvider = detectLLMProvider(prev.llmKey);
      const nextProvider = detectLLMProvider(v);
      if (prevProvider !== nextProvider || !next.llmVisionModel) {
        next.llmVisionModel = defaultVisionModel(nextProvider);
      }
      if (prevProvider !== nextProvider || !next.llmTextModel) {
        next.llmTextModel = defaultTextModel(nextProvider);
      }
      return next;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgApp }]} edges={['top']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>LLM API Key</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Use your own provider credits. Your key is saved only in this browser and passed through HomeCart's server to your provider on each request — never stored there. Don't save it on a shared computer.
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 28, lineHeight: 30 }}>×</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accentIcon} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Section title="Your key" icon="key-variant"
              description="Paste an OpenRouter, OpenAI, or Anthropic key. We auto-detect which one it is from the prefix."
              colors={colors}>
              <KeyInput
                value={keys.llmKey || ''}
                onChangeText={onLlmKeyChange}
                placeholder="sk-or-... / sk-... / sk-ant-..."
                reveal={reveal}
                onToggleReveal={() => setReveal(r => !r)}
                colors={colors}
              />
              {keys.llmKey ? (
                <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
                  Detected: {providerDisplayName(detectedProvider)} (from key prefix)
                </Text>
              ) : null}

              <View style={styles.linkRow}>
                {LLM_PROVIDER_LINKS.map(l => (
                  <TouchableOpacity key={l.url} onPress={() => Linking.openURL(l.url)}>
                    <Text style={[styles.linkText, { color: colors.textAccent }]}>{l.label} →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Section>

            {keys.llmKey ? (
              <Section title="Models" icon="brain"
                description={`Only ${providerDisplayName(detectedProvider)} models are shown — these are the only ones that will work with your key.`}
                colors={colors}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  VISION MODEL (product scans)
                  {orFetching && detectedProvider === 'openrouter' && (
                    <Text style={{ color: colors.textSecondary, fontSize: 10 }}>  · fetching live list…</Text>
                  )}
                </Text>
                <ModelButton
                  model={visionOnly.find(m => m.id === keys.llmVisionModel) || null}
                  fallbackLabel={keys.llmVisionModel || 'Pick a model'}
                  colors={colors}
                  onPress={() => setModelPicker({ kind: 'vision' })}
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>
                  TEXT MODEL (recipe parsing)
                </Text>
                <ModelButton
                  model={allModels.find(m => m.id === keys.llmTextModel) || null}
                  fallbackLabel={keys.llmTextModel || 'Pick a model'}
                  colors={colors}
                  onPress={() => setModelPicker({ kind: 'text' })}
                />
              </Section>
            ) : null}

            {keys.llmKey ? (
              <TouchableOpacity onPress={onClearAll} style={styles.clearLink}>
                <Text style={{ color: colors.errorText, fontSize: 13, fontWeight: '600' }}>Clear key</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        )}

        <View style={[styles.footer, { borderTopColor: colors.borderDefault, backgroundColor: colors.bgApp }]}>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.actionPrimary, opacity: saving ? 0.5 : 1 }]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={colors.onActionPrimary} /> : <Text style={[styles.saveText, { color: colors.onActionPrimary }]}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ModelPickerModal
          visible={!!modelPicker}
          kind={modelPicker?.kind || 'vision'}
          models={modelPicker?.kind === 'vision' ? visionOnly : allModels}
          currentId={modelPicker?.kind === 'vision' ? keys.llmVisionModel : keys.llmTextModel}
          colors={colors}
          onPick={(id) => {
            if (modelPicker?.kind === 'vision') setKeys(k => ({ ...k, llmVisionModel: id }));
            else setKeys(k => ({ ...k, llmTextModel: id }));
            setModelPicker(null);
          }}
          onClose={() => setModelPicker(null)}
        />
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, icon, description, colors, children }: {
  title: string; icon: any; description: string; colors: any; children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.accentSubtle }]}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accentIcon} />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>{description}</Text>
      {children}
    </View>
  );
}

function KeyInput({ value, onChangeText, placeholder, reveal, onToggleReveal, colors }: {
  value: string; onChangeText: (v: string) => void; placeholder: string;
  reveal: boolean; onToggleReveal: () => void; colors: any;
}) {
  return (
    <View style={[styles.inputRow, { backgroundColor: colors.bgApp, borderColor: colors.borderDefault }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        secureTextEntry={!reveal}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={[styles.input, { color: colors.textPrimary }]}
      />
      <TouchableOpacity onPress={onToggleReveal} style={styles.revealBtn}>
        <MaterialCommunityIcons name={reveal ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

function ModelButton({ model, fallbackLabel, colors, onPress }: {
  model: ModelOption | null; fallbackLabel: string; colors: any; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.modelButton, { backgroundColor: colors.bgApp, borderColor: colors.borderDefault }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.modelButtonLabel, { color: colors.textPrimary }]}>
          {model?.label || fallbackLabel}
        </Text>
        {model && (
          <Text style={[styles.modelButtonPrice, { color: colors.textSecondary }]}>
            {formatPrice(model.inputPerM)} in · {formatPrice(model.outputPerM)} out per 1M tokens
          </Text>
        )}
      </View>
      <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

function ModelPickerModal({ visible, kind, models, currentId, colors, onPick, onClose }: {
  visible: boolean; kind: 'vision' | 'text'; models: ModelOption[]; currentId?: string;
  colors: any; onPick: (id: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgApp }]} edges={['top']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Pick {kind === 'vision' ? 'vision' : 'text'} model
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {kind === 'vision' ? 'Used for scanning product images.' : 'Used for parsing recipes.'}
              {' '}Sorted cheapest first.
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 28, lineHeight: 30 }}>×</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={models}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 20, paddingTop: 0 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => {
            const isActive = item.id === currentId;
            return (
              <TouchableOpacity
                onPress={() => onPick(item.id)}
                style={[styles.modelRow, {
                  backgroundColor: colors.bgSurface,
                  borderColor: isActive ? colors.actionPrimary : colors.borderDefault,
                  borderWidth: isActive ? 2 : 1,
                }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modelRowLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Text style={[styles.modelRowId, { color: colors.textSecondary }]}>{item.id}</Text>
                  <Text style={[styles.modelRowPrice, { color: colors.textSecondary }]}>
                    {formatPrice(item.inputPerM)} in · {formatPrice(item.outputPerM)} out / 1M
                    {item.vision ? '  · 👁 vision' : ''}
                  </Text>
                  {item.notes && (
                    <Text style={[styles.modelRowNotes, { color: colors.textSecondary }]}>{item.notes}</Text>
                  )}
                </View>
                {isActive && (
                  <MaterialCommunityIcons name="check-circle" size={22} color={colors.accentIcon} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary }}>No models available. Add a key first.</Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  closeBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingTop: 0, paddingBottom: 24 },
  section: { padding: 16, borderRadius: 14, borderWidth: 1, marginTop: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionDesc: { fontSize: 12, lineHeight: 17, marginTop: 6, marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1 },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, fontFamily: 'monospace' },
  revealBtn: { padding: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  fieldHint: { fontSize: 11, marginTop: 8 },
  modelButton: {
    flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, gap: 8,
  },
  modelButtonLabel: { fontSize: 14, fontWeight: '600' },
  modelButtonPrice: { fontSize: 11, marginTop: 2 },
  modelRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 },
  modelRowLabel: { fontSize: 15, fontWeight: '600' },
  modelRowId: { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  modelRowPrice: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  modelRowNotes: { fontSize: 11, marginTop: 4, lineHeight: 15, fontStyle: 'italic' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  linkText: { fontSize: 12, fontWeight: '600' },
  clearLink: { padding: 16, alignItems: 'center', marginTop: 12 },
  footer: { padding: 20, paddingBottom: 28, borderTopWidth: 1 },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
  saveText: { fontSize: 16, fontWeight: '700' },
});
