import { useState, useEffect, useCallback, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Linking } from 'react-native';
import { useRouter, useLocalSearchParams, useIsFocused, useFocusEffect } from 'expo-router';
import { useFoldable } from '../src/hooks/useFoldable';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

const GradientMask = MaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
}>;
import { WifiHigh, Globe, CaretDown, CaretUp, Info } from 'phosphor-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, FadeIn } from 'react-native-reanimated';
import { StyledTextInput } from '../src/components/StyledTextInput';
import { GameList } from '../src/components/GameList';
import { RoomCodeInput } from '../src/components/RoomCodeInput';
import { GlassCard } from '../src/components/GlassCard';
import { useDiscovery } from '../src/hooks/useDiscovery';
import { useConnectionHistory } from '../src/hooks/useConnectionHistory';
import { useSettings } from '../src/hooks/useSettings';
import { Colors } from '../src/theme/colors';
import { Fonts, FontSize, FontWeight } from '../src/theme/typography';
import { Spacing, Radius } from '../src/theme/spacing';
import type { DiscoveredGame } from '../src/connection/discovery';

export default function HomeScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ room?: string; name?: string }>();
  const { settings, update, loaded } = useSettings();
  const { insets, isWide, fold } = useFoldable();
  const [playerName, setPlayerName] = useState(settings.playerName);
  const [connecting, setConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHostInfo, setShowHostInfo] = useState(false);
  const [manualIp, setManualIp] = useState('');
  // Scan only while this screen is visible; the controller screen sits on top of it.
  const isFocused = useIsFocused();
  const { games, scanning, error: discoveryError } = useDiscovery(isFocused);
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

  // Coming back from the controller: buttons are usable again.
  useFocusEffect(useCallback(() => setConnecting(false), []));

  // Settings load asynchronously; fill in the saved name once they arrive.
  useEffect(() => {
    if (loaded && !playerName && settings.playerName) setPlayerName(settings.playerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Handle deep link (squadpad://?room=word+word&name=...)
  useEffect(() => {
    if (searchParams.room) {
      const name = searchParams.name?.trim();
      if (name) setPlayerName(name);
      // Same normalisation as the web client: QR links use "+" or "-" between words.
      const code = searchParams.room.toLowerCase().split(/[\s+\-]+/).filter(Boolean).join(' ');
      handleJoinRoom(code, name || getName());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.room]);

  // Persist name changes
  useEffect(() => {
    if (loaded && playerName !== settings.playerName) {
      update({ playerName: playerName.trim() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName]);

  const getName = () => playerName.trim() || 'Player';

  const handleSelectGame = (game: DiscoveredGame) => {
    setConnecting(true);
    router.push({
      pathname: '/controller',
      params: { host: game.address, name: getName(), mode: 'lan' },
    });
  };

  const handleJoinRoom = (roomCode: string, name: string = getName()) => {
    setConnecting(true);
    addToHistory(roomCode);
    router.push({
      pathname: '/controller',
      params: { room: roomCode, name, mode: 'relay' },
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

  const padStyle = {
    paddingTop: Math.max(insets.top + Spacing.sm, Spacing.lg),
    paddingBottom: Math.max(insets.bottom + Spacing.xl, Spacing.xxl),
    paddingLeft: Math.max(insets.left + Spacing.lg, Spacing.lg),
    paddingRight: Math.max(insets.right + Spacing.lg, Spacing.lg),
  };

  // When a vertical fold division is active, size the left pane up to the fold
  // and leave a clear gutter over the crease.
  const hasVerticalFold = fold?.orientation === 'vertical';
  const leftPaneStyle = hasVerticalFold
    ? { width: Math.max(240, fold.x - Math.max(insets.left + Spacing.lg, Spacing.lg) - 14) }
    : styles.paneFlex;
  const foldGap = hasVerticalFold ? Math.max(28, fold.width + 28) : 28;

  const nearbyCard = (
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
        onManualEntry={() => setShowAdvanced(true)}
      />
    </GlassCard>
  );

  const relayAndAdvanced = (
    <>
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
                mono
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
              Players on the same Wi-Fi will see it under &quot;Nearby Games&quot; automatically.
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
    </>
  );

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

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isWide && styles.contentWide,
          padStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {isWide ? (
          <View style={[styles.twoPaneRow, { gap: foldGap }]}>
            <View style={[styles.paneCol, leftPaneStyle]}>
              <View style={styles.brand}>
                <Animated.View style={[styles.bombIconWrap, floatStyle]}>
                  <Image
                    source={require('../assets/icon-hero.png')}
                    style={styles.bombIconCompact}
                    resizeMode="contain"
                  />
                </Animated.View>
                <GradientMask maskElement={<Text style={styles.titleMask}>SquadPad</Text>}>
                  <LinearGradient
                    colors={[Colors.teal, Colors.purple, Colors.gold]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={[styles.titleMask, { opacity: 0 }]}>SquadPad</Text>
                  </LinearGradient>
                </GradientMask>
                <Text style={styles.subtitle}>Game Controller for BombSquad</Text>
              </View>

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

              {nearbyCard}
            </View>

            <View style={[styles.paneCol, styles.paneFlex]}>
              {relayAndAdvanced}
              <Pressable onPress={() => router.push('/settings')} style={styles.settingsLink}>
                <Text style={styles.settingsLinkText}>Settings</Text>
              </Pressable>
              <View style={styles.footer}>
                <Text style={styles.credits}>
                  Unofficial companion app. BombSquad is made by Eric Froemling.
                </Text>
                <Pressable
                  onPress={() => Linking.openURL('https://github.com/nerveband/squadpad')}
                  hitSlop={8}
                >
                  <Text style={styles.openSourceLink}>Open Source</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Brand: bomb icon + gradient title matching web */}
            <View style={styles.brand}>
              <Animated.View style={[styles.bombIconWrap, floatStyle]}>
                <Image
                  source={require('../assets/icon-hero.png')}
                  style={styles.bombIcon}
                  resizeMode="contain"
                />
              </Animated.View>
              <GradientMask
                maskElement={<Text style={styles.titleMask}>SquadPad</Text>}
              >
                <LinearGradient
                  colors={[Colors.teal, Colors.purple, Colors.gold]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={[styles.titleMask, { opacity: 0 }]}>SquadPad</Text>
                </LinearGradient>
              </GradientMask>
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

            {nearbyCard}
            {relayAndAdvanced}

            {/* Settings link */}
            <Pressable onPress={() => router.push('/settings')} style={styles.settingsLink}>
              <Text style={styles.settingsLinkText}>Settings</Text>
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.credits}>
                Unofficial companion app. BombSquad is made by Eric Froemling.
              </Text>
              <Pressable
                onPress={() => Linking.openURL('https://github.com/nerveband/squadpad')}
                hitSlop={8}
              >
                <Text style={styles.openSourceLink}>Open Source</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  bgGradient: {
    ...StyleSheet.absoluteFill,
  },
  content: {
    gap: Spacing.lg,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  contentWide: {
    maxWidth: 960,
  },
  twoPaneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  paneCol: {
    gap: Spacing.lg,
  },
  paneFlex: {
    flex: 1,
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
  bombIconCompact: {
    width: 96,
    height: 106,
    marginBottom: -6,
  },
  titleMask: {
    fontFamily: Fonts.extrabold,
    fontSize: 36,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Fonts.primary,
    color: Colors.textDim,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  section: {
    gap: Spacing.sm,
  },
  label: {
    fontFamily: Fonts.semibold,
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
    fontFamily: Fonts.bold,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  cardDescription: {
    fontFamily: Fonts.primary,
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
    fontFamily: Fonts.semibold,
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
    fontFamily: Fonts.monoSemibold,
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
    fontFamily: Fonts.semibold,
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
    fontFamily: Fonts.bold,
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
    fontFamily: Fonts.primary,
    color: Colors.textDim,
    fontSize: FontSize.sm,
  },
  hostInfoText: {
    fontFamily: Fonts.primary,
    color: Colors.text,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  settingsLink: {
    alignSelf: 'center',
    paddingVertical: Spacing.xs,
  },
  settingsLinkText: {
    fontFamily: Fonts.semibold,
    color: Colors.purple,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  credits: {
    fontFamily: Fonts.primary,
    color: Colors.textDim,
    fontSize: FontSize.xs,
    textAlign: 'center',
    opacity: 0.6,
  },
  openSourceLink: {
    fontFamily: Fonts.semibold,
    color: Colors.teal,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    opacity: 0.7,
  },
});
