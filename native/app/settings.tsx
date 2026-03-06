import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import Constants from 'expo-constants';
import { GlassCard } from '../src/components/GlassCard';
import { StyledTextInput } from '../src/components/StyledTextInput';
import { useSettings } from '../src/hooks/useSettings';
import { Colors } from '../src/theme/colors';
import { FontSize, FontWeight, Fonts } from '../src/theme/typography';
import { Spacing, Radius } from '../src/theme/spacing';

function ToggleButton({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={styles.toggleRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={[styles.toggle, value && styles.toggleActive]}>
        <Text style={[styles.toggleText, value && styles.toggleTextActive]}>
          {value ? 'On' : 'Off'}
        </Text>
      </View>
    </Pressable>
  );
}

function SegmentPicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.segments}>
        {options.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.segment, value === opt.key && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, value === opt.key && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SensitivityPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  return (
    <View style={styles.settingRow}>
      <View style={styles.sensHeader}>
        <Text style={styles.settingLabel}>Joystick Sensitivity</Text>
        <Text style={styles.sensValue}>{value}x</Text>
      </View>
      <View style={styles.segments}>
        {steps.map((s) => (
          <Pressable
            key={s}
            onPress={() => onChange(s)}
            style={[styles.segment, value === s && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, value === s && styles.segmentTextActive]}>
              {s}x
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, update } = useSettings();

  const deviceInfo = {
    platform: Platform.OS,
    version: Platform.Version,
    appVersion: Constants.expoConfig?.version || '1.0.0',
    sdkVersion: Constants.expoConfig?.sdkVersion || '--',
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <ArrowLeft size={24} color={Colors.text} weight="bold" />
            </Pressable>
            <Text style={styles.headerTitle}>Settings</Text>
          </View>

          {/* Player */}
          <GlassCard>
            <Text style={styles.sectionTitle}>Player</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Name</Text>
            </View>
            <StyledTextInput
              value={settings.playerName}
              onChangeText={(v) => update({ playerName: v })}
              placeholder="Player"
              autoCapitalize="words"
              maxLength={20}
            />
          </GlassCard>

          {/* Controller */}
          <GlassCard>
            <Text style={styles.sectionTitle}>Controller</Text>

            <SensitivityPicker
              value={settings.sensitivity}
              onChange={(v) => update({ sensitivity: v })}
            />

            <ToggleButton
              label="Haptic Feedback"
              value={settings.hapticsEnabled}
              onToggle={() => update({ hapticsEnabled: !settings.hapticsEnabled })}
            />

            {settings.hapticsEnabled && (
              <SegmentPicker
                label="Haptic Intensity"
                options={[
                  { key: 'low' as const, label: 'Low' },
                  { key: 'medium' as const, label: 'Medium' },
                  { key: 'high' as const, label: 'High' },
                ]}
                value={settings.hapticIntensity}
                onChange={(v) => update({ hapticIntensity: v })}
              />
            )}

            <SegmentPicker
              label="Joystick Style"
              options={[
                { key: 'floating' as const, label: 'Floating' },
                { key: 'fixed' as const, label: 'Fixed' },
              ]}
              value={settings.joystickStyle}
              onChange={(v) => update({ joystickStyle: v })}
            />

            <ToggleButton
              label="Allow Portrait Mode"
              value={settings.allowPortrait}
              onToggle={() => update({ allowPortrait: !settings.allowPortrait })}
            />
          </GlassCard>

          {/* Diagnostics */}
          <GlassCard>
            <Text style={styles.sectionTitle}>Diagnostics</Text>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Platform</Text>
              <Text style={styles.diagValue}>{deviceInfo.platform} {deviceInfo.version}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>App Version</Text>
              <Text style={styles.diagValue}>{deviceInfo.appVersion}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Expo SDK</Text>
              <Text style={styles.diagValue}>{deviceInfo.sdkVersion}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Relay</Text>
              <Text style={styles.diagValue} numberOfLines={1}>{settings.relayUrl}</Text>
            </View>
          </GlassCard>

          {/* About */}
          <GlassCard>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.aboutText}>SquadPad v{deviceInfo.appVersion}</Text>
            <Text style={styles.aboutText}>Game controller for BombSquad</Text>
            <Text style={[styles.aboutDim, { marginTop: Spacing.md }]}>
              Made by{' '}
              <Text
                style={styles.aboutLink}
                onPress={() => Linking.openURL('https://ashrafali.net')}
              >
                Ashraf
              </Text>
            </Text>
            <Text style={styles.aboutDim}>squadpad.org</Text>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  safe: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
  },
  settingRow: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  settingLabel: {
    color: Colors.text,
    fontSize: FontSize.md,
  },
  sensHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sensValue: {
    color: Colors.teal,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    fontFamily: Fonts.mono,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  toggle: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleActive: {
    backgroundColor: 'rgba(155,107,190,0.2)',
    borderColor: Colors.purple,
  },
  toggleText: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  toggleTextActive: {
    color: Colors.purple,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.sm,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.sm - 2,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: 'rgba(155,107,190,0.25)',
  },
  segmentText: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  segmentTextActive: {
    color: Colors.text,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  diagLabel: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
  },
  diagValue: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontFamily: Fonts.mono,
    maxWidth: 200,
  },
  aboutText: {
    color: Colors.text,
    fontSize: FontSize.md,
    marginBottom: 4,
  },
  aboutDim: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    marginTop: 4,
  },
  aboutLink: {
    color: Colors.teal,
    fontWeight: FontWeight.semibold,
  },
});
