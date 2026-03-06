import { StyleSheet, View } from 'react-native';
import { ArrowUp, HandFist, FireSimple, ArrowsOutSimple } from 'phosphor-react-native';
import { ActionButton, ActionButtonConfig } from './ActionButton';
import { Colors } from '../theme/colors';

const BUTTONS: ActionButtonConfig[] = [
  {
    name: 'throw',
    icon: <ArrowsOutSimple size={36} color="#fff" weight="bold" />,
    colors: [Colors.blue, Colors.blueDeep],
    glowColor: 'rgba(107,139,208,0.6)',
  },
  {
    name: 'punch',
    icon: <HandFist size={36} color="#fff" weight="bold" />,
    colors: [Colors.pink, Colors.pinkDeep],
    glowColor: 'rgba(200,120,168,0.6)',
  },
  {
    name: 'bomb',
    icon: <FireSimple size={36} color="#fff" weight="bold" />,
    colors: [Colors.gold, Colors.goldDim],
    glowColor: 'rgba(232,200,64,0.6)',
  },
  {
    name: 'jump',
    icon: <ArrowUp size={36} color="#fff" weight="bold" />,
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
  // Diamond layout: throw top, punch+bomb middle, jump bottom.
  // Tap zones fill entire rows — you don't need to aim at the circle.
  // Padding compresses the diamond so buttons are visually close.
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
    paddingVertical: '6%',
  },
  topRow: {
    flex: 0.85,
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
    paddingRight: 2,
  },
  halfRight: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  bottomRow: {
    flex: 0.85,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
});
