import { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Joystick } from '../src/components/Joystick';
import { ActionButtons } from '../src/components/ActionButtons';
import { HudBar } from '../src/components/HudBar';
import { ControllerHud } from '../src/components/ControllerHud';
import { useController } from '../src/hooks/useController';
import { useSettings } from '../src/hooks/useSettings';
import { ConnectionManager } from '../src/connection/connection-manager';
import { Colors } from '../src/theme/colors';
import { FontSize, FontWeight } from '../src/theme/typography';
import { Spacing, Radius } from '../src/theme/spacing';

export default function ControllerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ host?: string; room?: string; name?: string; mode?: string }>();
  const { width, height } = useWindowDimensions();
  const { settings, update } = useSettings();
  const isPortrait = height > width;
  const [hudVisible, setHudVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(params.name || settings.playerName || 'Player');
  const [tempName, setTempName] = useState(displayName);

  const connectionManagerRef = useRef(
    new ConnectionManager({
      onStatusChange: (status) => {
        if (status === 'connected') controller.markConnected();
        if (status === 'disconnected') controller.markDisconnected();
      },
      onLagUpdate: (ms) => controller.pushLag(ms),
      onError: (msg) => setError(msg),
    })
  );

  const controller = useController({ connectionManager: connectionManagerRef.current });
  const [error, setError] = useState<string | null>(null);

  // Connect on mount
  useEffect(() => {
    const cm = connectionManagerRef.current;
    const playerName = params.name || 'Player';

    if (params.mode === 'lan' && params.host) {
      cm.connectLan(params.host, playerName);
    } else if (params.mode === 'relay' && params.room) {
      cm.connectRelay(
        'wss://squadpad-relay.fly.dev',
        params.room,
        playerName,
      );
    }

    return () => {
      cm.disconnect();
    };
  }, [params.host, params.room, params.name, params.mode]);

  const handleNamePress = useCallback(() => {
    setTempName(displayName);
    setEditingName(true);
  }, [displayName]);

  const handleNameSave = useCallback(() => {
    const trimmed = tempName.trim() || 'Player';
    setDisplayName(trimmed);
    update({ playerName: trimmed });
    setEditingName(false);
  }, [tempName, update]);

  const handleAllSettings = useCallback(() => {
    setHudVisible(false);
    router.push('/settings');
  }, [router]);

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
          playerName={displayName}
          lagMs={controller.lagMs}
          connectTime={controller.connectTime}
          onBack={() => router.back()}
          onSettings={() => setHudVisible(true)}
          onNamePress={handleNamePress}
        />

        {isPortrait ? (
          <View style={styles.portraitContainer}>
            <View style={styles.portraitSpacer} />
            <View style={styles.portraitControls}>
              <View style={styles.portraitJoystick}>
                <Joystick onMove={controller.setJoystick} sensitivity={settings.sensitivity} />
              </View>
              <View style={styles.portraitButtons}>
                <ActionButtons
                  onPressIn={controller.pressButton}
                  onPressOut={controller.releaseButton}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.landscapeControls}>
            <View style={styles.joystickZone}>
              <Joystick onMove={controller.setJoystick} sensitivity={settings.sensitivity} />
            </View>
            <View style={styles.buttonsZone}>
              <ActionButtons
                onPressIn={controller.pressButton}
                onPressOut={controller.releaseButton}
              />
            </View>
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
        connectionMode={params.mode || 'unknown'}
        host={params.host || params.room || ''}
        onAllSettings={handleAllSettings}
      />

      {/* Name editing modal */}
      <Modal visible={editingName} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.nameModalWrap}
        >
          <Pressable style={styles.nameModalBackdrop} onPress={() => setEditingName(false)} />
          <View style={styles.nameModalCard}>
            <Text style={styles.nameModalTitle}>Player Name</Text>
            <TextInput
              value={tempName}
              onChangeText={setTempName}
              style={styles.nameModalInput}
              placeholder="Player"
              placeholderTextColor={Colors.textDim}
              autoFocus
              maxLength={20}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleNameSave}
              selectTextOnFocus
            />
            <Pressable onPress={handleNameSave} style={styles.nameModalBtn}>
              <Text style={styles.nameModalBtnText}>Done</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
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
  // Name editing modal
  nameModalWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  nameModalCard: {
    width: 280,
    backgroundColor: 'rgba(20,16,36,0.98)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  nameModalTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  nameModalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: FontSize.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  nameModalBtn: {
    backgroundColor: Colors.purple,
    borderRadius: Radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nameModalBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(232,84,72,0.2)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  errorText: {
    color: Colors.danger,
    textAlign: 'center',
    fontSize: 14,
  },
});
