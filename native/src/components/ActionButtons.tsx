import { StyleSheet, View } from 'react-native';
import { ArrowUp, HandFist, FireSimple, ArrowsOutSimple } from 'phosphor-react-native';
import { ActionButton, ActionButtonConfig } from './ActionButton';
import { Colors } from '../theme/colors';

const BUTTONS: ActionButtonConfig[] = [
  {
    name: 'throw',
    icon: <ArrowsOutSimple size={28} color="#fff" weight="bold" />,
    colors: [Colors.blue, Colors.blueDeep],
    glowColor: 'rgba(107,139,208,0.6)',
  },
  {
    name: 'punch',
    icon: <HandFist size={28} color="#fff" weight="bold" />,
    colors: [Colors.pink, Colors.pinkDeep],
    glowColor: 'rgba(200,120,168,0.6)',
  },
  {
    name: 'bomb',
    icon: <FireSimple size={28} color="#fff" weight="bold" />,
    colors: [Colors.gold, Colors.goldDim],
    glowColor: 'rgba(232,200,64,0.6)',
  },
  {
    name: 'jump',
    icon: <ArrowUp size={28} color="#fff" weight="bold" />,
    colors: [Colors.teal, Colors.tealDeep],
    glowColor: 'rgba(92,196,176,0.6)',
  },
];

interface ActionButtonsProps {
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
  hapticsEnabled?: boolean;
}

export function ActionButtons({ onPressIn, onPressOut, hapticsEnabled }: ActionButtonsProps) {
  // 3-row layout: each row fills 1/3 of the zone height.
  // Entire row is tappable — you don't need to aim at the circle.
  //   Row 1:        [throw]         ← full-width tap zone
  //   Row 2: [punch]      [bomb]   ← left half / right half
  //   Row 3:        [jump]          ← full-width tap zone
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <ActionButton
          config={BUTTONS[0]}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          hapticsEnabled={hapticsEnabled}
        />
      </View>
      <View style={styles.middleRow}>
        <View style={styles.halfLeft}>
          <ActionButton
            config={BUTTONS[1]}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            hapticsEnabled={hapticsEnabled}
          />
        </View>
        <View style={styles.halfRight}>
          <ActionButton
            config={BUTTONS[2]}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            hapticsEnabled={hapticsEnabled}
          />
        </View>
      </View>
      <View style={styles.bottomRow}>
        <ActionButton
          config={BUTTONS[3]}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          hapticsEnabled={hapticsEnabled}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topRow: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  middleRow: {
    flex: 1,
    flexDirection: 'row',
  },
  halfLeft: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  halfRight: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  bottomRow: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
});
