import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ArrowLeft, GearSix } from 'phosphor-react-native';
import { LagIndicator } from './LagIndicator';
import { Colors } from '../theme/colors';
import { Fonts, FontSize, FontWeight } from '../theme/typography';

interface HudBarProps {
  playerName: string;
  lagMs: number | null;
  connectTime: string;
  onBack: () => void;
  onSettings: () => void;
  onNamePress?: () => void;
}

export function HudBar({ playerName, lagMs, connectTime, onBack, onSettings, onNamePress }: HudBarProps) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={16}>
        <ArrowLeft size={22} color={Colors.text} weight="bold" />
      </Pressable>

      <Text style={styles.name} numberOfLines={1}>{playerName || 'Player'}</Text>

      <Text style={styles.brand}>SquadPad</Text>

      <View style={styles.right}>
        <Text style={styles.timer}>{connectTime}</Text>
        <LagIndicator lagMs={lagMs} />
      </View>

      <Pressable onPress={onSettings} style={styles.settingsBtn} hitSlop={16}>
        <GearSix size={24} color={Colors.textDim} weight="fill" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    maxWidth: 120,
  },
  brand: {
    flex: 1,
    color: Colors.textDim,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timer: {
    fontFamily: Fonts.mono,
    color: Colors.teal,
    fontSize: FontSize.xs,
    fontVariant: ['tabular-nums'],
    opacity: 0.7,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
