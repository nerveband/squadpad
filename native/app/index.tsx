import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { WifiHigh, Globe, CaretDown, CaretUp, Info } from 'phosphor-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, FadeIn } from 'react-native-reanimated';
import { useEffect } from 'react';
import { StyledTextInput } from '../src/components/StyledTextInput';
import { GameList } from '../src/components/GameList';
import { RoomCodeInput } from '../src/components/RoomCodeInput';
import { GlassCard } from '../src/components/GlassCard';
import { useDiscovery } from '../src/hooks/useDiscovery';
import { useConnectionHistory } from '../src/hooks/useConnectionHistory';
import { useSettings } from '../src/hooks/useSettings';
import { Colors } from '../src/theme/colors';
import { FontSize, FontWeight } from '../src/theme/typography';
import { Spacing, Radius } from '../src/theme/spacing';
import type { DiscoveredGame } from '../src/connection/discovery';

export default function HomeScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ room?: string; name?: string }>();
  const { settings, update } = useSettings();
  const [playerName, setPlayerName] = useState(settings.playerName || '');
  const [connecting, setConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHostInfo, setShowHostInfo] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const { games, scanning, error: discoveryError } = useDiscovery();
  const { history, addToHistory } = useConnectionHistory();

  // Floating animation for the brand icon
  const translateY = useSharedValue(0);
  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(-8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [translateY]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Handle deep link
  useEffect(() => {
    if (searchParams.room) {
      if (searchParams.name) setPlayerName(searchParams.name);
      handleJoinRoom(searchParams.room);
    }
  }, [searchParams.room]);

  // Persist name changes
  useEffect(() => {
    if (playerName && playerName !== settings.playerName) {
      update({ playerName });
    }
  }, [playerName]);

  const getName = () => playerName || 'Player';

  const handleSelectGame = (game: DiscoveredGame) => {
    setConnecting(true);
    router.push({
      pathname: '/controller',
      params: { host: game.address, name: getName(), mode: 'lan' },
    });
  };

  const handleJoinRoom = (roomCode: string) => {
    setConnecting(true);
    addToHistory(roomCode);
    router.push({
      pathname: '/controller',
      params: { room: roomCode, name: getName(), mode: 'relay' },
    });
  };

  const handleDirectConnect = () => {
    if (!manualIp.trim()) return;
    setConnecting(true);
    router.push({
      pathname: '/controller',
      params: { host: manualIp.trim(), name: getName(), mode: 'lan' },
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(92,196,176,0.05)', 'transparent']}
        style={styles.bgGradient}
        start={{ x: 0.2, y: 0.8 }}
        end={{ x: 0.8, y: 0.2 }}
      />
      <LinearGradient
        colors={['rgba(155,107,190,0.05)', 'transparent']}
        style={styles.bgGradient}
        start={{ x: 0.8, y: 0.8 }}
        end={{ x: 0.2, y: 0.2 }}
      />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Brand — bomb icon + gradient title matching web */}
          <View style={styles.brand}>
            <Animated.View style={[styles.bombIconWrap, floatStyle]}>
              <Image
                source={require('../assets/icon-hero.png')}
                style={styles.bombIcon}
                resizeMode="contain"
              />
            </Animated.View>
            <MaskedView
              maskElement={<Text style={styles.titleMask}>SquadPad</Text>}
            >
              <LinearGradient
                colors={[Colors.teal, Colors.purple, Colors.gold]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={[styles.titleMask, { opacity: 0 }]}>SquadPad</Text>
              </LinearGradient>
            </MaskedView>
            <Text style={styles.subtitle}>Game Controller for BombSquad</Text>
          </View>

          {/* Player name */}
          <View style={styles.section}>
            <Text style={styles.label}>Your Name</Text>
            <StyledTextInput
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="Player"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={20}
            />
          </View>

          {/* Nearby Games - primary */}
          <GlassCard style={styles.card}>
            <View style={styles.cardHeader}>
              <WifiHigh size={22} color={Colors.teal} weight="bold" />
              <Text style={styles.cardTitle}>Nearby Games</Text>
            </View>
            <Text style={styles.cardDescription}>
              BombSquad games on your Wi-Fi network
            </Text>
            <GameList
              games={games}
              scanning={scanning}
              error={discoveryError}
              onSelect={handleSelectGame}
            />
          </GlassCard>

          {/* Room Code - cloud relay */}
          <GlassCard style={styles.card}>
            <View style={styles.cardHeader}>
              <Globe size={22} color={Colors.purple} weight="bold" />
              <Text style={styles.cardTitle}>Cloud Relay</Text>
            </View>
            <Text style={styles.cardDescription}>
              Join a game anywhere using a room code
            </Text>
            <RoomCodeInput onJoin={handleJoinRoom} loading={connecting} />

            {/* History chips */}
            {history.length > 0 && (
              <View style={styles.historySection}>
                <Text style={styles.historyLabel}>Recent</Text>
                <View style={styles.chips}>
                  {history.map((code) => (
                    <Pressable
                      key={code}
                      onPress={() => handleJoinRoom(code)}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                    >
                      <Text style={styles.chipText}>{code}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </GlassCard>

          {/* Advanced - collapsible */}
          <Pressable
            onPress={() => setShowAdvanced(!showAdvanced)}
            style={styles.advancedToggle}
          >
            <Text style={styles.advancedToggleText}>Advanced</Text>
            {showAdvanced
              ? <CaretUp size={16} color={Colors.textDim} weight="bold" />
              : <CaretDown size={16} color={Colors.textDim} weight="bold" />
            }
          </Pressable>

          {showAdvanced && (
            <Animated.View entering={FadeIn.duration(200)}>
              <GlassCard style={styles.card}>
                <Text style={styles.label}>Direct IP Address</Text>
                <Text style={styles.cardDescription}>
                  Connect directly to a BombSquad host by IP
                </Text>
                <View style={styles.ipRow}>
                  <StyledTextInput
                    value={manualIp}
                    onChangeText={setManualIp}
                    placeholder="192.168.1.100"
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.ipInput}
                    onSubmitEditing={handleDirectConnect}
                  />
                  <Pressable
                    onPress={handleDirectConnect}
                    style={[styles.connectBtn, !manualIp.trim() && styles.connectBtnDisabled]}
                    disabled={!manualIp.trim()}
                  >
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </Pressable>
                </View>
              </GlassCard>
            </Animated.View>
          )}

          {/* How to Host info */}
          <Pressable
            onPress={() => setShowHostInfo(!showHostInfo)}
            style={styles.hostInfoToggle}
          >
            <Info size={16} color={Colors.textDim} weight="bold" />
            <Text style={styles.hostInfoToggleText}>How do I host a game?</Text>
          </Pressable>

          {showHostInfo && (
            <Animated.View entering={FadeIn.duration(200)}>
              <GlassCard style={styles.card}>
                <Text style={styles.hostInfoText}>
                  To host a game, run BombSquad on a computer or tablet on your local network.
                  Players on the same Wi-Fi will see it under "Nearby Games" automatically.
                </Text>
                <Text style={[styles.hostInfoText, { marginTop: 8 }]}>
                  For remote players, use the SquadPad desktop app to create a room code
                  that connects through the cloud relay.
                </Text>
                <Text style={[styles.hostInfoText, { marginTop: 8, color: Colors.textDim }]}>
                  Learn more at squadpad.org
                </Text>
              </GlassCard>
            </Animated.View>
          )}

          {/* Settings link */}
          <Pressable onPress={() => router.push('/settings')} style={styles.settingsLink}>
            <Text style={styles.settingsLinkText}>Settings</Text>
          </Pressable>

          <Text style={styles.credits}>
            Made for BombSquad by Eric Froemling
          </Text>
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
  bgGradient: {
    ...StyleSheet.absoluteFillObject,
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
    paddingBottom: Spacing.xxl,
  },
  brand: {
    alignItems: 'center',
    gap: 0,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  bombIconWrap: {
    // Match web: drop-shadow(0 6px 20px rgba(155,107,190,0.35))
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  bombIcon: {
    width: 120,
    height: 132, // aspect ratio ~719:791
    marginBottom: -8,
  },
  titleMask: {
    fontSize: 36,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  section: {
    gap: Spacing.sm,
  },
  label: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  cardDescription: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  historySection: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  historyLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: 'rgba(155,107,190,0.08)',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(155,107,190,0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipPressed: {
    backgroundColor: 'rgba(155,107,190,0.15)',
  },
  chipText: {
    color: Colors.purple,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  advancedToggleText: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  ipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  ipInput: {
    flex: 1,
  },
  connectBtn: {
    backgroundColor: Colors.purple,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  connectBtnDisabled: {
    opacity: 0.4,
  },
  connectBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  hostInfoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  hostInfoToggleText: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
  },
  hostInfoText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  settingsLink: {
    alignSelf: 'center',
    paddingVertical: Spacing.xs,
  },
  settingsLinkText: {
    color: Colors.purple,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  credits: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    textAlign: 'center',
    opacity: 0.6,
  },
});
