import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Joystick } from '../src/components/Joystick';
import { ActionButtons } from '../src/components/ActionButtons';
import { HudBar } from '../src/components/HudBar';
import { ControllerHud } from '../src/components/ControllerHud';
import { ConnectionOverlay } from '../src/components/ConnectionOverlay';
import { useController } from '../src/hooks/useController';
import { useSettings } from '../src/hooks/useSettings';
import { useFoldable } from '../src/hooks/useFoldable';
import { useGamepad } from '../src/hooks/useGamepad';
import { ConnectionManager, type ConnectionStatus } from '../src/connection/connection-manager';
import type { ConnectionMode } from '../src/connection/failure-messages';
import { Colors } from '../src/theme/colors';
import { Fonts, FontSize, FontWeight } from '../src/theme/typography';
import { Radius, Spacing } from '../src/theme/spacing';

export default function ControllerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ host?: string; room?: string; name?: string; mode?: string }>();
  const { settings, update, loaded } = useSettings();
  const { insets, isPortrait, fold, posture, isTabletopController } = useFoldable();
  const mode: ConnectionMode = params.mode === 'relay' ? 'relay' : 'lan';
  const target = (mode === 'relay' ? params.room : params.host) || '';

  const [hudVisible, setHudVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  // The saved name wins so edits here or in Settings show at once.
  const playerName = settings.playerName || params.name || 'Player';
  const [status, setStatus] = useState<ConnectionStatus>({ kind: 'connecting', stage: 'connecting' });
  const [attempt, setAttempt] = useState(0);

  // Created once and never during render: its callbacks only touch this
  // screen after it has mounted.
  const managerRef = useRef<ConnectionManager | null>(null);
  const eventsRef = useRef({
    onStatusChange: (_status: ConnectionStatus) => {},
    onLagUpdate: (_ms: number) => {},
  });
  if (!managerRef.current) {
    managerRef.current = new ConnectionManager({
      onStatusChange: (s) => eventsRef.current.onStatusChange(s),
      onLagUpdate: (ms) => eventsRef.current.onLagUpdate(ms),
    });
  }
  const manager = managerRef.current;
  const controller = useController({ connectionManager: manager });

  eventsRef.current = {
    onStatusChange: (s) => {
      setStatus(s);
      if (s.kind === 'connected') controller.markConnected();
      else controller.markDisconnected();
    },
    onLagUpdate: controller.pushLag,
  };

  // Connect once settings are loaded (the relay URL lives there); reconnect on Retry.
  useEffect(() => {
    if (!loaded || !target) return;
    const name = params.name || 'Player';
    if (mode === 'lan') manager.connectLan(target, name);
    else manager.connectRelay(settings.relayUrl, target, name);
    return () => manager.disconnect();
    // settings.relayUrl is read at connect time; changing it mid-session should not reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, mode, target, params.name, attempt, manager]);

  const handleRetry = useCallback(() => setAttempt((n) => n + 1), []);
  const handleLeave = useCallback(() => router.back(), [router]);

  const handleNamePress = useCallback(() => {
    setTempName(playerName);
    setEditingName(true);
  }, [playerName]);

  const handleNameSave = useCallback(() => {
    const trimmed = tempName.trim() || 'Player';
    update({ playerName: trimmed });
    setEditingName(false);
  }, [tempName, update]);

  const handleAllSettings = useCallback(() => {
    setHudVisible(false);
    router.push('/settings');
  }, [router]);

  const handleRunChange = useCallback(
    (running: boolean) => {
      if (running) controller.pressButton('run');
      else controller.releaseButton('run');
    },
    [controller],
  );

  const handleMenuPress = useCallback(() => {
    controller.pressButton('menu');
  }, [controller]);

  const handleMenuRelease = useCallback(() => {
    controller.releaseButton('menu');
  }, [controller]);

  const joystick = (
    <Joystick
      onMove={controller.setJoystick}
      onRunChange={handleRunChange}
      sensitivity={settings.sensitivity}
      mode={settings.joystickStyle}
      mirrored={settings.leftHanded}
      stickEdgeRun={settings.runMode === 'stickEdge'}
    />
  );
  const buttons = (
    <ActionButtons
      onPressIn={controller.pressButton}
      onPressOut={controller.releaseButton}
      hapticsEnabled={settings.hapticsEnabled}
      hapticIntensity={settings.hapticIntensity}
      runMode={settings.runMode}
      mirrored={settings.leftHanded}
    />
  );

  const leftControl = settings.leftHanded ? buttons : joystick;
  const rightControl = settings.leftHanded ? joystick : buttons;

  // When a vertical fold division is active (Book posture on iPhone Duo or Android
  // foldable), size the left zone up to the fold and leave a clear crease gutter.
  const hasVerticalFold = fold?.orientation === 'vertical';
  const leftZoneStyle = hasVerticalFold
    ? { width: Math.max(160, fold.x - insets.left) }
    : styles.zoneFlex;
  const verticalFoldGutter = hasVerticalFold ? Math.max(24, fold.width + 20) : 0;

  // When a horizontal fold division is active (Tabletop / Flex posture), keep the
  // status deck above `fold.y` and the touch controls below `fold.y + fold.height`.
  const hasHorizontalFold = fold?.orientation === 'horizontal';
  const tabletopTopStyle = hasHorizontalFold
    ? { height: Math.max(110, fold.y - 48) }
    : styles.tabletopTopDefault;
  const horizontalFoldGutter = hasHorizontalFold ? Math.max(20, fold.height + 16) : 12;

  const controlPadStyle = {
    paddingLeft: Math.max(insets.left + 8, 12),
    paddingRight: Math.max(insets.right + 8, 12),
    paddingBottom: Math.max(insets.bottom + 8, 12),
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden verticalBarBehaviorIOS="disabled" />
      {/* Background gradients */}
      <LinearGradient
        colors={['rgba(92,196,176,0.10)', 'transparent', 'transparent']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0.8 }}
        end={{ x: 0.8, y: 0.2 }}
      />
      <LinearGradient
        colors={['rgba(155,107,190,0.10)', 'transparent', 'transparent']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.8, y: 0.8 }}
        end={{ x: 0.2, y: 0.2 }}
      />
      <LinearGradient
        colors={['rgba(232,200,64,0.06)', 'transparent', 'transparent']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 0.8 }}
      />

      <View style={styles.safeArea}>
        <HudBar
          playerName={playerName}
          lagMs={controller.lagMs}
          connectTime={controller.connectTime}
          onBack={handleLeave}
          onSettings={() => setHudVisible(true)}
          onMenuPress={handleMenuPress}
          onMenuRelease={handleMenuRelease}
          editingName={editingName}
          editNameValue={tempName}
          onNamePress={handleNamePress}
          onNameChange={setTempName}
          onNameSubmit={handleNameSave}
        />

        {isTabletopController ? (
          <View style={[styles.tabletopContainer, controlPadStyle]}>
            <View style={[styles.tabletopDeck, tabletopTopStyle]}>
              <View style={styles.deckCard}>
                <View style={styles.deckRow}>
                  <View>
                    <Text style={styles.deckLabel}>
                      {mode === 'relay' ? 'ONLINE ROOM' : 'WI-FI HOST'}
                    </Text>
                    <Text style={styles.deckTarget}>{target || 'Connected'}</Text>
                  </View>
                  <View style={styles.deckBadges}>
                    <Pressable
                      onPress={() => update({ leftHanded: !settings.leftHanded })}
                      style={[styles.deckPill, settings.leftHanded && styles.deckPillActive]}
                    >
                      <Text style={styles.deckPillText}>
                        {settings.leftHanded ? 'Left-Handed' : 'Right-Handed'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        update({
                          runMode:
                            settings.runMode === 'buttonHold'
                              ? 'button'
                              : settings.runMode === 'button'
                                ? 'stickEdge'
                                : 'buttonHold',
                        })
                      }
                      style={styles.deckPill}
                    >
                      <Text style={styles.deckPillText}>Run: {settings.runMode}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
            <View style={{ height: horizontalFoldGutter }} />
            <View style={styles.tabletopControls}>
              <View style={styles.zoneFlex}>{leftControl}</View>
              <View style={styles.zoneFlex}>{rightControl}</View>
            </View>
          </View>
        ) : isPortrait ? (
          <View style={[styles.portraitContainer, controlPadStyle]}>
            <View style={styles.portraitSpacer} />
            <View style={styles.portraitControls}>
              <View style={styles.zoneFlex}>{leftControl}</View>
              <View style={styles.zoneFlex}>{rightControl}</View>
            </View>
          </View>
        ) : (
          <View style={[styles.landscapeControls, controlPadStyle]}>
            <View style={leftZoneStyle}>{leftControl}</View>
            {verticalFoldGutter > 0 && <View style={{ width: verticalFoldGutter }} />}
            <View style={styles.zoneFlex}>{rightControl}</View>
          </View>
        )}
      </View>

      {/* Live HUD overlay */}
      <ControllerHud
        visible={hudVisible}
        onClose={() => setHudVisible(false)}
        settings={settings}
        onUpdate={update}
        lagMs={controller.lagMs}
        connectTime={controller.connectTime}
        connectionMode={mode}
        host={target}
        onAllSettings={handleAllSettings}
      />

      <ConnectionOverlay
        status={status}
        mode={mode}
        target={target}
        onRetry={handleRetry}
        onLeave={handleLeave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  safeArea: {
    flex: 1,
  },
  landscapeControls: {
    flex: 1,
    flexDirection: 'row',
  },
  zoneFlex: {
    flex: 1,
  },
  portraitContainer: {
    flex: 1,
  },
  portraitSpacer: {
    flex: 0.15,
  },
  portraitControls: {
    flex: 0.85,
    flexDirection: 'row',
  },
  tabletopContainer: {
    flex: 1,
  },
  tabletopDeck: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  tabletopTopDefault: {
    flex: 0.36,
  },
  tabletopControls: {
    flex: 1,
    flexDirection: 'row',
  },
  deckCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  deckLabel: {
    fontFamily: Fonts.semibold,
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1,
  },
  deckTarget: {
    fontFamily: Fonts.monoBold,
    color: Colors.teal,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },
  deckBadges: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  deckPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deckPillActive: {
    backgroundColor: 'rgba(155,107,190,0.2)',
    borderColor: Colors.purple,
  },
  deckPillText: {
    fontFamily: Fonts.semibold,
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
