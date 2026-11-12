import { useState, useEffect, useCallback, useRef, type ComponentRef, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Image, Linking } from 'react-native';
import { useRouter, useLocalSearchParams, useIsFocused, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useFoldable } from '../src/hooks/useFoldable';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

const GradientMask = MaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
}>;
import { WifiHigh, Globe, CaretDown, CaretUp, Info, GearSix } from 'phosphor-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, FadeIn } from 'react-native-reanimated';
import { StyledTextInput } from '../src/components/StyledTextInput';
import { GameList } from '../src/components/GameList';
import { RoomCodeInput } from '../src/components/RoomCodeInput';
import { GlassCard } from '../src/components/GlassCard';
import { useDiscovery } from '../src/hooks/useDiscovery';
import { useConnectionHistory } from '../src/hooks/useConnectionHistory';
import { useSettings } from '../src/hooks/useSettings';
import { Colors } from '../src/theme/colors';
import { Fonts, FontSize } from '../src/theme/typography';
import { Spacing, Radius } from '../src/theme/spacing';
import type { DiscoveredGame } from '../src/connection/discovery';

export default function HomeScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ room?: string; name?: string }>();
  const { settings, update, loaded } = useSettings();
  const { width, insets, isPortrait, safeWidth, safeHeight, isWide, fold } = useFoldable();
  const isLandscape = !isPortrait;
  const isShortLandscape = isLandscape && safeHeight < 480;
  const isLargeLandscape = isLandscape && safeWidth >= 1000;
  const landscapeEdgePad = isLandscape ? Math.min(36, Math.max(18, Math.round(width * 0.035))) : 0;
  const safeLeftPad = Math.max(insets.left + Spacing.lg, Spacing.lg) + landscapeEdgePad;
  const safeRightPad = Math.max(insets.right + Spacing.lg, Spacing.lg) + landscapeEdgePad;
  const wideStageMaxWidth = Math.min(1180, Math.max(520, safeWidth - landscapeEdgePad * 2));
  const [playerName, setPlayerName] = useState(settings.playerName);
  const [nameError, setNameError] = useState(false);
  const nameInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [connecting, setConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHostInfo, setShowHostInfo] = useState(false);
  const [manualIp, setManualIp] = useState('');
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

  const handleNameChange = (text: string) => {
    setPlayerName(text);
    if (nameError && text.trim().length > 0) {
      setNameError(false);
    }
  };

  const requireName = (overrideName?: string): string | null => {
    const trimmed = (overrideName ?? playerName).trim();
    if (!trimmed) {
      setNameError(true);
      nameInputRef.current?.focus();
      if (settings.hapticsEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
      return null;
    }
    setNameError(false);
    return trimmed;
  };

  const consumedRoomRef = useRef<string | null>(null);

  // Handle deep link (squadpad://?room=word+word&name=...) once settings load
  useEffect(() => {
    if (!loaded || !searchParams.room) return;
    if (consumedRoomRef.current === searchParams.room) return;
    const name = searchParams.name?.trim();
    if (name) {
      setPlayerName(name);
      setNameError(false);
    }
    // Same normalisation as the web client: QR links use "+" or "-" between words.
    const code = searchParams.room.toLowerCase().split(/[\s+\-]+/).filter(Boolean).join(' ');
    const candidate = name || playerName.trim() || settings.playerName.trim();
    consumedRoomRef.current = searchParams.room;
    if (candidate && code) {
      handleJoinRoom(code, candidate);
    } else {
      setNameError(true);
      nameInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, searchParams.room, searchParams.name]);
  // Persist name changes
  useEffect(() => {
    if (loaded && playerName !== settings.playerName) {
      update({ playerName: playerName.trim() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName]);

  const handleSelectGame = (game: DiscoveredGame) => {
    const name = requireName();
    if (!name) return;
    setConnecting(true);
    router.push({
      pathname: '/controller',
      params: { host: game.address, name, mode: 'lan' },
    });
  };

  const handleJoinRoom = (roomCode: string, overrideName?: string) => {
    const name = requireName(overrideName);
    if (!name) return;
    setConnecting(true);
    addToHistory(roomCode);
    router.push({
      pathname: '/controller',
      params: { room: roomCode, name, mode: 'relay' },
    });
  };

  const handleDirectConnect = () => {
    if (!manualIp.trim()) return;
    const name = requireName();
    if (!name) return;
    setConnecting(true);
    router.push({
      pathname: '/controller',
      params: { host: manualIp.trim(), name, mode: 'lan' },
    });
  };
  const padStyle = {
    paddingTop: isShortLandscape
      ? Math.max(insets.top + 6, Spacing.sm)
      : Math.max(insets.top + Spacing.sm, Spacing.lg) + (isLandscape ? 6 : 0),
    paddingBottom: isShortLandscape
      ? Math.max(insets.bottom + 10, Spacing.md)
      : Math.max(insets.bottom + Spacing.xl, Spacing.xxl) + (isLandscape ? 8 : 0),
    paddingLeft: safeLeftPad,
    paddingRight: safeRightPad,
  };

  // When a vertical fold division is active, size the left pane up to the fold
  // and leave a clear gutter over the crease.
  const hasVerticalFold = fold?.orientation === 'vertical';
  const leftPaneStyle = hasVerticalFold
    ? { width: Math.max(240, fold.x - safeLeftPad - 14) }
    : styles.paneFlex;
  const foldGap = hasVerticalFold ? Math.max(28, fold.width + 28) : isShortLandscape ? 16 : 28;
  const cardStyle = isShortLandscape ? styles.cardCompact : isLargeLandscape ? styles.cardLargeLandscape : styles.card;

  const nearbyCard = (
    <GlassCard style={cardStyle}>
      <View style={styles.cardHeader}>
        <WifiHigh size={20} color={Colors.teal} weight="bold" />
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

  const relayCard = (
    <GlassCard style={cardStyle}>
      <View style={styles.cardHeader}>
        <Globe size={20} color={Colors.purple} weight="bold" />
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
  );

  const advancedAndHostInfo = (
    <>
      <View style={styles.inlineTogglesRow}>
        <Pressable
          onPress={() => setShowAdvanced(!showAdvanced)}
          style={styles.advancedToggle}
        >
          <Text style={styles.advancedToggleText}>Direct IP</Text>
          {showAdvanced
            ? <CaretUp size={15} color={Colors.textDim} weight="bold" />
            : <CaretDown size={15} color={Colors.textDim} weight="bold" />
          }
        </Pressable>

        <Pressable
          onPress={() => setShowHostInfo(!showHostInfo)}
          style={styles.hostInfoToggle}
        >
          <Info size={15} color={Colors.textDim} weight="bold" />
          <Text style={styles.hostInfoToggleText}>How to host</Text>
        </Pressable>
      </View>

      {showAdvanced && (
        <Animated.View entering={FadeIn.duration(200)}>
          <GlassCard style={cardStyle}>
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

      {showHostInfo && (
        <Animated.View entering={FadeIn.duration(200)}>
          <GlassCard style={cardStyle}>
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
          isWide && { maxWidth: wideStageMaxWidth },
          isShortLandscape && styles.contentCompact,
          isLargeLandscape && styles.contentLargeLandscape,
          padStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {isWide ? (
          <>
            {/* Horizontal Top Bar: Brand lockup on left, Your Name + Settings on right */}
            <View style={[styles.wideTopBar, { gap: foldGap }]}>
              <View style={[styles.brandHorizontal, leftPaneStyle]}>
                <Animated.View style={[styles.bombIconWrap, floatStyle]}>
                  <Image
                    source={require('../assets/icon-hero.png')}
                    style={isLargeLandscape ? styles.bombIconLandscapeLarge : styles.bombIconLandscape}
                    resizeMode="contain"
                  />
                </Animated.View>
                <View style={styles.brandTextCol}>
                  <GradientMask maskElement={<Text style={isLargeLandscape ? styles.titleMaskLandscapeLarge : styles.titleMaskLandscape}>SquadPad</Text>}>
                    <LinearGradient
                      colors={[Colors.teal, Colors.purple, Colors.gold]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={[isLargeLandscape ? styles.titleMaskLandscapeLarge : styles.titleMaskLandscape, { opacity: 0 }]}>SquadPad</Text>
                    </LinearGradient>
                  </GradientMask>
                  <Text style={styles.subtitleLandscape}>Game Controller for BombSquad</Text>
                </View>
              </View>

              <View style={[styles.wideTopRight, styles.paneFlex]}>
                <View style={styles.wideNameField}>
                  <StyledTextInput
                    inputRef={nameInputRef}
                    error={nameError}
                    value={playerName}
                    onChangeText={handleNameChange}
                    placeholder="Enter your name"
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={20}
                    style={styles.wideNameInput}
                  />
                  {nameError && (
                    <Text style={styles.nameErrorText}>Please enter your name first.</Text>
                  )}
                </View>
                <Pressable
                  onPress={() => router.push('/settings')}
                  style={styles.settingsPill}
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                >
                  <GearSix size={18} color={Colors.purple} weight="bold" />
                  <Text style={styles.settingsLinkText}>Settings</Text>
                </Pressable>
              </View>
            </View>

            {/* Side-by-side main cards aligned at the exact same top edge */}
            <View style={[styles.twoPaneRow, { gap: foldGap }]}>
              <View style={[styles.paneCol, leftPaneStyle]}>
                {nearbyCard}
                {advancedAndHostInfo}
              </View>

              <View style={[styles.paneCol, styles.paneFlex]}>
                {relayCard}
                <View style={styles.wideFooterRow}>
                  <Text style={styles.credits}>
                    Unofficial companion app · BombSquad by Eric Froemling ·{' '}
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
          </>
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
                inputRef={nameInputRef}
                error={nameError}
                value={playerName}
                onChangeText={handleNameChange}
                placeholder="Enter your name"
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={20}
              />
              {nameError && (
                <Text style={styles.nameErrorText}>Please enter your name first.</Text>
              )}
            </View>

            {nearbyCard}
            {relayCard}
            {advancedAndHostInfo}

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
  contentCompact: {
    gap: Spacing.md,
  },
  contentLargeLandscape: {
    gap: Spacing.xl,
  },
  wideTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  brandHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandTextCol: {
    justifyContent: 'center',
  },
  bombIconLandscape: {
    width: 48,
    height: 53,
  },
  bombIconLandscapeLarge: {
    width: 56,
    height: 62,
  },
  titleMaskLandscape: {
    fontFamily: Fonts.extrabold,
    fontSize: 26,
    letterSpacing: -1.1,
    textAlign: 'left',
  },
  titleMaskLandscapeLarge: {
    fontFamily: Fonts.extrabold,
    fontSize: 30,
    letterSpacing: -1.2,
    textAlign: 'left',
  },
  subtitleLandscape: {
    fontFamily: Fonts.primary,
    color: Colors.textDim,
    fontSize: FontSize.xs,
    marginTop: -2,
  },
  wideTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  wideNameField: {
    flex: 1,
    gap: 2,
  },
  wideNameInput: {
    paddingVertical: 10,
  },
  settingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(155,107,190,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(155,107,190,0.28)',
    borderRadius: Radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  twoPaneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  paneCol: {
    gap: Spacing.md,
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
  titleMask: {
    fontFamily: Fonts.extrabold,
    fontSize: 36,
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
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nameErrorText: {
    fontFamily: Fonts.semibold,
    color: Colors.danger,
    fontSize: FontSize.xs,
  },
  card: {
    gap: Spacing.sm,
  },
  cardCompact: {
    gap: Spacing.xs,
    padding: 16,
  },
  cardLargeLandscape: {
    gap: Spacing.md,
    padding: 20,
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
  },
  inlineTogglesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
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
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  wideFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingTop: 2,
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
    opacity: 0.7,
  },
});
