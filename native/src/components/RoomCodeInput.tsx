import { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight } from '../theme/typography';
import { Radius, Spacing } from '../theme/spacing';

interface RoomCodeInputProps {
  onJoin: (roomCode: string) => void;
  loading?: boolean;
}

export function RoomCodeInput({ onJoin, loading }: RoomCodeInputProps) {
  const [word1, setWord1] = useState('');
  const [word2, setWord2] = useState('');
  const word2Ref = useRef<TextInput>(null);
  const word1Ref = useRef<TextInput>(null);

  const handleWord1Change = (text: string) => {
    const clean = text.toLowerCase().replace(/[^a-z]/g, '');
    setWord1(clean);
    // Auto-tab on space
    if (text.endsWith(' ') && clean.length > 0) {
      word2Ref.current?.focus();
    }
  };

  const handleWord2Change = (text: string) => {
    const clean = text.toLowerCase().replace(/[^a-z]/g, '');
    setWord2(clean);
  };

  const handleWord2KeyPress = (e: { nativeEvent: { key: string } }) => {
    if (e.nativeEvent.key === 'Backspace' && word2 === '') {
      word1Ref.current?.focus();
    }
  };

  const handleJoin = () => {
    if (word1 && word2) {
      onJoin(`${word1} ${word2}`);
    }
  };

  const canJoin = word1.length > 0 && word2.length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Room Code</Text>
      <View style={styles.row}>
        <TextInput
          ref={word1Ref}
          style={styles.input}
          value={word1}
          onChangeText={handleWord1Change}
          placeholder="word"
          placeholderTextColor={Colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => word2Ref.current?.focus()}
        />
        <TextInput
          ref={word2Ref}
          style={styles.input}
          value={word2}
          onChangeText={handleWord2Change}
          onKeyPress={handleWord2KeyPress}
          placeholder="word"
          placeholderTextColor={Colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="join"
          onSubmitEditing={handleJoin}
        />
        <PrimaryButton
          title="Join"
          onPress={handleJoin}
          disabled={!canJoin || loading}
          style={styles.joinButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: Colors.white05,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    paddingVertical: 12,
    paddingHorizontal: 16,
    textAlign: 'center',
    letterSpacing: 1,
  },
  joinButton: {
    paddingHorizontal: 20,
  },
});
