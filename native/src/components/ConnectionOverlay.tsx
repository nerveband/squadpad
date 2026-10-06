import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { WarningCircleIcon } from 'phosphor-react-native';
import { PrimaryButton } from './PrimaryButton';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight } from '../theme/typography';
import { Radius, Spacing } from '../theme/spacing';
import { describeFailure, STAGE_TEXT, type ConnectionMode } from '../connection/failure-messages';
import type { ConnectionStatus } from '../connection/connection-manager';

interface ConnectionOverlayProps {
  status: ConnectionStatus;
  mode: ConnectionMode;
  /** Host IP or room code, shown so the player can spot a typo. */
  target: string;
  onRetry: () => void;
  onLeave: () => void;
}

/** Covers the controls until the player is actually in the game. */
export function ConnectionOverlay({ status, mode, target, onRetry, onLeave }: ConnectionOverlayProps) {
  if (status.kind === 'connected' || status.kind === 'idle') return null;

  const failed = status.kind === 'failed';
  const title = failed
    ? 'Couldn\'t connect'
    : status.kind === 'reconnecting'
      ? 'Reconnecting...'
      : STAGE_TEXT[status.stage];
  const targetLabel = mode === 'relay' ? `Room ${target}` : target;

  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.overlay}>
      <View style={styles.card} accessibilityLiveRegion="polite">
        {failed
          ? <WarningCircleIcon size={36} color={Colors.danger} weight="fill" />
          : <ActivityIndicator size="large" color={Colors.teal} />}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.target}>{targetLabel}</Text>
        {failed && <Text style={styles.message}>{describeFailure(status.failure, mode)}</Text>}
        {status.kind === 'reconnecting' && (
          <Text style={styles.message}>Attempt {status.attempt} of {status.maxAttempts}</Text>
        )}

        <View style={styles.actions}>
          {failed && <PrimaryButton title="Try Again" onPress={onRetry} style={styles.retry} />}
          <Pressable onPress={onLeave} style={styles.leave} hitSlop={8} accessibilityRole="button">
            <Text style={styles.leaveText}>{failed ? 'Back' : 'Cancel'}</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(13,11,26,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    zIndex: 100,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  target: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
  },
  message: {
    color: Colors.text,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  retry: {
    alignSelf: 'stretch',
  },
  leave: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  leaveText: {
    color: Colors.textDim,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
});
