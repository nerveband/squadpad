import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { X, GearSix } from 'phosphor-react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Fonts } from '../theme/typography';
import { Spacing, Radius } from '../theme/spacing';
import type { Settings } from '../hooks/useSettings';

interface ControllerHudProps {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
  lagMs: number | null;
  connectTime: string;
  connectionMode: string;
  host: string;
  onAllSettings?: () => void;
}

function HudToggle({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={hudStyles.toggleRow}>
      <Text style={hudStyles.label}>{label}</Text>
      <View style={[hudStyles.pill, value && hudStyles.pillActive]}>
        <Text style={[hudStyles.pillText, value && hudStyles.pillTextActive]}>
          {value ? 'On' : 'Off'}
        </Text>
      </View>
    </Pressable>
  );
}

function SensitivitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  return (
    <View style={hudStyles.settingBlock}>
      <View style={hudStyles.toggleRow}>
        <Text style={hudStyles.label}>Sensitivity</Text>
        <Text style={hudStyles.valueText}>{value}x</Text>
      </View>
      <View style={hudStyles.segments}>
        {steps.map((s) => (
          <Pressable
            key={s}
            onPress={() => onChange(s)}
            style={[hudStyles.seg, value === s && hudStyles.segActive]}
          >
            <Text style={[hudStyles.segText, value === s && hudStyles.segTextActive]}>
              {s}x
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ControllerHud({
  visible,
  onClose,
  settings,
  onUpdate,
  lagMs,
  connectTime,
  connectionMode,
  host,
  onAllSettings,
}: ControllerHudProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const lagColor = lagMs == null ? Colors.textDim
    : lagMs < 80 ? Colors.teal
    : lagMs <= 150 ? Colors.gold
    : Colors.danger;

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={hudStyles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        entering={SlideInRight.duration(200)}
        exiting={SlideOutRight.duration(200)}
        style={[hudStyles.panel, { paddingTop: Math.max(insets.top + 8, Spacing.xl) }]}
      >
        <View style={hudStyles.header}>
          <Text style={hudStyles.title}>Controller</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={20} color={Colors.text} weight="bold" />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 16 }}
        >
          {/* Connection info */}
          <View style={hudStyles.section}>
            <Text style={hudStyles.sectionLabel}>Connection</Text>
            <View style={hudStyles.statRow}>
              <Text style={hudStyles.statLabel}>Mode</Text>
              <Text style={hudStyles.statValue}>{connectionMode}</Text>
            </View>
            <View style={hudStyles.statRow}>
              <Text style={hudStyles.statLabel}>Host</Text>
              <Text style={hudStyles.statValue} numberOfLines={1}>{host}</Text>
            </View>
            <View style={hudStyles.statRow}>
              <Text style={hudStyles.statLabel}>Latency</Text>
              <Text style={[hudStyles.statValue, { color: lagColor, fontFamily: Fonts.mono }]}>
                {lagMs != null ? `${lagMs}ms` : '--'}
              </Text>
            </View>
            <View style={hudStyles.statRow}>
              <Text style={hudStyles.statLabel}>Uptime</Text>
              <Text style={[hudStyles.statValue, { fontFamily: Fonts.mono }]}>{connectTime}</Text>
            </View>
          </View>

          {/* Controls */}
          <View style={hudStyles.section}>
            <Text style={hudStyles.sectionLabel}>Controls</Text>

            <SensitivitySlider
              value={settings.sensitivity}
              onChange={(v) => onUpdate({ sensitivity: v })}
            />

            <HudToggle
              label="Haptics"
              value={settings.hapticsEnabled}
              onToggle={() => onUpdate({ hapticsEnabled: !settings.hapticsEnabled })}
            />

            <HudToggle
              label="Portrait"
              value={settings.allowPortrait}
              onToggle={() => onUpdate({ allowPortrait: !settings.allowPortrait })}
            />
          </View>

          {/* All Settings link */}
          {onAllSettings && (
            <Pressable onPress={onAllSettings} style={hudStyles.allSettingsBtn}>
              <GearSix size={16} color={Colors.purple} weight="bold" />
              <Text style={hudStyles.allSettingsText}>All Settings</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const hudStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 50,
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 260,
    backgroundColor: 'rgba(13,11,26,0.95)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: Spacing.md,
    zIndex: 51,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statLabel: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
  },
  statValue: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    maxWidth: 140,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  label: {
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: {
    backgroundColor: 'rgba(155,107,190,0.2)',
    borderColor: Colors.purple,
  },
  pillText: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  pillTextActive: {
    color: Colors.purple,
  },
  valueText: {
    color: Colors.teal,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    fontFamily: Fonts.mono,
  },
  settingBlock: {
    marginBottom: 4,
  },
  segments: {
    flexDirection: 'row',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.sm,
    padding: 3,
    marginTop: 6,
  },
  seg: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: Radius.sm - 2,
    alignItems: 'center',
  },
  segActive: {
    backgroundColor: 'rgba(155,107,190,0.25)',
  },
  segText: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },
  segTextActive: {
    color: Colors.text,
  },
  allSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(155,107,190,0.25)',
    backgroundColor: 'rgba(155,107,190,0.08)',
  },
  allSettingsText: {
    color: Colors.purple,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});
