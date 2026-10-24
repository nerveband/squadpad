import { View, Text, TextInput, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, GearSix, PencilSimple, Check } from 'phosphor-react-native';
import { LagIndicator } from './LagIndicator';
import { Colors } from '../theme/colors';
import { Fonts, FontSize, FontWeight } from '../theme/typography';

interface HudBarProps {
  playerName: string;
  lagMs: number | null;
  connectTime: string;
  onBack: () => void;
  onSettings: () => void;
  editingName: boolean;
  editNameValue: string;
  onNamePress: () => void;
  onNameChange: (text: string) => void;
  onNameSubmit: () => void;
}

export function HudBar({
  playerName,
  lagMs,
  connectTime,
  onBack,
  onSettings,
  editingName,
  editNameValue,
  onNamePress,
  onNameChange,
  onNameSubmit,
}: HudBarProps) {
  const inputRef = useRef<TextInput>(null);
  const { width, height } = useWindowDimensions();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Focus input when editing starts or orientation changes while editing
  useEffect(() => {
    if (editingName) {
      clearTimeout(blurTimer.current);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editingName, width, height]);

  const handleSubmit = useCallback(() => {
    clearTimeout(blurTimer.current);
    onNameSubmit();
  }, [onNameSubmit]);

  const handleBlur = useCallback(() => {
    // Delay save so orientation-change refocus can cancel it
    blurTimer.current = setTimeout(() => {
      onNameSubmit();
    }, 250);
  }, [onNameSubmit]);

  return (
    <View style={styles.bar}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={16}>
        <ArrowLeft size={22} color={Colors.text} weight="bold" />
      </Pressable>

      {editingName ? (
        <View style={styles.nameEditWrap}>
          <TextInput
            ref={inputRef}
            value={editNameValue}
            onChangeText={onNameChange}
            style={styles.nameInput}
            placeholder="Player"
            placeholderTextColor={Colors.textDim}
            autoFocus
            maxLength={20}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            onBlur={handleBlur}
            selectTextOnFocus
          />
          <Pressable onPress={handleSubmit} style={styles.nameDoneBtn} hitSlop={8}>
            <Check size={14} color={Colors.teal} weight="bold" />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onNamePress} style={styles.nameBtn} hitSlop={8}>
          <Text style={styles.name} numberOfLines={1}>{playerName || 'Player'}</Text>
          <PencilSimple size={11} color={Colors.textDim} weight="bold" />
        </Pressable>
      )}

      {/* The brand only fills space; it gives way to the name field while editing. */}
      <Text style={styles.brand} numberOfLines={1}>{editingName ? '' : 'SquadPad'}</Text>

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
  nameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    maxWidth: 100,
  },
  nameEditWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameInput: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.purple,
    paddingVertical: 5,
    paddingHorizontal: 10,
    minWidth: 100,
    maxWidth: 160,
  },
  nameDoneBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(92,196,176,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(92,196,176,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
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
