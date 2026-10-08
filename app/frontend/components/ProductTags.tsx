import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tones } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

export type Budget = 'budget' | 'mid-range' | 'premium';

const BUDGET_LABEL: Record<Budget, string> = {
  budget: '$ Budget',
  'mid-range': '$$ Mid-range',
  premium: '$$$ Premium',
};
const BUDGET_RANK: Record<Budget, number> = { budget: 0, 'mid-range': 1, premium: 2 };

export function isBudget(v: unknown): v is Budget {
  return v === 'budget' || v === 'mid-range' || v === 'premium';
}

// A cheap product isn't good value if it's a poor substitute.
const MIN_VALUE_MATCH = 70;

// Index of the cheapest decent match (≥70%), but only when the candidates actually differ in
// price tier — "best value" on a list where everything costs the same would be meaningless.
export function bestValueIndex(items: { budget?: string | null; match_score: number }[]): number | null {
  const ranked = items
    .map((it, i) => ({ i, rank: isBudget(it.budget) ? BUDGET_RANK[it.budget] : null, score: it.match_score }))
    .filter((x): x is { i: number; rank: number; score: number } => x.rank !== null && x.score >= MIN_VALUE_MATCH);
  if (ranked.length < 2 || new Set(ranked.map(r => r.rank)).size < 2) return null;
  ranked.sort((a, b) => a.rank - b.rank || b.score - a.score);
  return ranked[0].i;
}

function Tag({ label, toneName, solid }: { label: string; toneName: keyof Tones; solid?: boolean }) {
  const tone = useTheme().tones[toneName];
  return (
    <View style={[styles.tag, { backgroundColor: solid ? tone.fill : tone.bg }]}>
      <Text style={[styles.tagText, { color: solid ? tone.onFill : tone.text }]}>{label}</Text>
    </View>
  );
}

// Price tier is an AI estimate, so it's shown as a neutral chip rather than a claim.
export function BudgetTag({ budget }: { budget?: string | null }) {
  if (!isBudget(budget)) return null;
  return <Tag label={BUDGET_LABEL[budget]} toneName="neutral" />;
}

export function BestMatchTag() {
  return <Tag label="Best match" toneName="match" solid />;
}

export function BestValueTag() {
  return <Tag label="Best value" toneName="highlight" solid />;
}

const styles = StyleSheet.create({
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 11, fontWeight: '700' },
});
