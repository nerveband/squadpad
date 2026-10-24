import { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Joystick } from '../src/components/Joystick';
import { ActionButtons } from '../src/components/ActionButtons';
import { HudBar } from '../src/components/HudBar';
import { ControllerHud } from '../src/components/ControllerHud';
import { ConnectionOverlay } from '../src/components/ConnectionOverlay';
import { useController } from '../src/hooks/useController';
import { useSettings } from '../src/hooks/useSettings';
import { ConnectionManager, type ConnectionStatus } from '../src/connection/connection-manager';
import type { ConnectionMode } from '../src/connection/failure-messages';
import { Colors } from '../src/theme/colors';

export default function ControllerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ host?: string; room?: string; name?: string; mode?: string }>();
  const { width, height } = useWindowDimensions();
  const { settings, update, loaded } = useSettings();
  const isPortrait = height > width;
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

  const joystick = (
    <Joystick
      onMove={controller.setJoystick}
      sensitivity={settings.sensitivity}
      mode={settings.joystickStyle}
    />
  );
  const buttons = (
    <ActionButtons
      onPressIn={controller.pressButton}
      onPressOut={controller.releaseButton}
      hapticsEnabled={settings.hapticsEnabled}
      hapticIntensity={settings.hapticIntensity}
    />
  );

  return (
    <View style={styles.container}>
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

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <HudBar
          playerName={playerName}
          lagMs={controller.lagMs}
          connectTime={controller.connectTime}
          onBack={handleLeave}
          onSettings={() => setHudVisible(true)}
          editingName={editingName}
          editNameValue={tempName}
          onNamePress={handleNamePress}
          onNameChange={setTempName}
          onNameSubmit={handleNameSave}
        />

        {isPortrait ? (
          <View style={styles.portraitContainer}>
            <View style={styles.portraitSpacer} />
            <View style={styles.portraitControls}>
              <View style={styles.portraitJoystick}>{joystick}</View>
              <View style={styles.portraitButtons}>{buttons}</View>
            </View>
          </View>
        ) : (
          <View style={styles.landscapeControls}>
            <View style={styles.joystickZone}>{joystick}</View>
            <View style={styles.buttonsZone}>{buttons}</View>
          </View>
        )}
      </SafeAreaView>

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
    paddingHorizontal: 12,
  },
  joystickZone: {
    flex: 1,
  },
  buttonsZone: {
    flex: 1,
  },
  portraitContainer: {
    flex: 1,
  },
  portraitSpacer: {
    flex: 0.1,
  },
  portraitControls: {
    flex: 0.9,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  portraitJoystick: {
    flex: 1,
  },
  portraitButtons: {
    flex: 1,
  },
});
