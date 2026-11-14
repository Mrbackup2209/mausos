import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { checkCode } from '../../services/stealthService';

// ---------------------------------------------------------------------------
// The stealth disguise: a plain, fully working calculator (D-33).
//
// It must survive being used as a calculator by someone else, so every key
// works and sums follow normal precedence (× and ÷ before + and −). Nothing on
// screen mentions MauSOS.
//
// The secret is in the = key. When the display holds only a whole number of
// 4–8 digits, = also checks it against the stored code hashes:
//   - the unlock code opens MauSOS;
//   - the duress code silently sends an alert, and the calculator carries on
//     as if = had been pressed on an ordinary number — no flash, no
//     vibration, nothing for an onlooker to notice.
// Any other number just behaves like a number.
// ---------------------------------------------------------------------------

const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };
const isOp = (t) => t in OPS;

/** Evaluates tokens like ['12', '+', '3', '×', '4'] with × ÷ before + −. */
function evaluate(tokens) {
  const nums = [];
  const ops = [];
  const apply = () => {
    const b = nums.pop();
    const a = nums.pop();
    nums.push(OPS[ops.pop()](a, b));
  };
  const rank = (op) => (op === '×' || op === '÷' ? 2 : 1);
  for (const t of tokens) {
    if (isOp(t)) {
      while (ops.length && rank(ops[ops.length - 1]) >= rank(t)) apply();
      ops.push(t);
    } else {
      nums.push(parseFloat(t));
    }
  }
  while (ops.length) apply();
  return nums[0];
}

function format(n) {
  if (!Number.isFinite(n)) return 'Error';
  const rounded = parseFloat(n.toPrecision(12));
  const text = String(rounded);
  return text.length > 12 ? rounded.toExponential(6) : text;
}

const KEYS = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

export default function CalculatorScreen({ onUnlock, onDuress }) {
  // tokens: completed numbers and operators; entry: the number being typed.
  const [tokens, setTokens] = useState([]);
  const [entry, setEntry] = useState('0');
  const [justEvaluated, setJustEvaluated] = useState(false);
  const insets = useSafeAreaInsets();

  function press(key) {
    if (/^\d$/.test(key)) {
      if (justEvaluated) {
        setTokens([]);
        setEntry(key);
        setJustEvaluated(false);
      } else {
        setEntry((e) => (e === '0' ? key : e.length >= 15 ? e : e + key));
      }
      return;
    }
    switch (key) {
      case '.':
        if (justEvaluated) {
          setTokens([]);
          setEntry('0.');
          setJustEvaluated(false);
        } else if (!entry.includes('.')) setEntry(entry + '.');
        return;
      case 'C':
        setTokens([]);
        setEntry('0');
        setJustEvaluated(false);
        return;
      case '⌫':
        if (justEvaluated) return;
        setEntry((e) => (e.length > 1 ? e.slice(0, -1) : '0'));
        return;
      case '%':
        setEntry(format(parseFloat(entry) / 100));
        return;
      case '=':
        equals();
        return;
      default:
        // An operator.
        if (entry === '' && tokens.length && isOp(tokens[tokens.length - 1])) {
          setTokens([...tokens.slice(0, -1), key]);
        } else {
          setTokens([...tokens, entry, key]);
          setEntry('');
        }
        setJustEvaluated(false);
    }
  }

  async function equals() {
    // A bare number on its own may be one of the codes.
    if (tokens.length === 0 && /^\d+$/.test(entry)) {
      const typed = entry;
      setJustEvaluated(true);
      const match = await checkCode(typed);
      if (match === 'unlock') {
        setTokens([]);
        setEntry('0');
        setJustEvaluated(false);
        onUnlock?.();
      } else if (match === 'duress') {
        onDuress?.();
      }
      return;
    }
    if (entry === '' && tokens.length) {
      // e.g. "5 +" then "=": ignore the trailing operator.
      setEntry(format(evaluate(tokens.slice(0, -1))));
    } else if (tokens.length) {
      setEntry(format(evaluate([...tokens, entry])));
    }
    setTokens([]);
    setJustEvaluated(true);
  }

  const expression = tokens.join(' ');

  return (
    // Shown inside a Modal (C-14). Plain views with the notch padding applied
    // directly: the native SafeAreaView mis-measured itself inside a Modal on
    // Android and collapsed the keypad to its last row (C-15).
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.display}>
          <Text style={styles.expression} numberOfLines={1}>
            {expression}
          </Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
            {entry || '0'}
          </Text>
        </View>
        <View style={styles.pad}>
          {KEYS.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((key) => {
                const op = isOp(key) || key === '=';
                const fn = key === 'C' || key === '⌫' || key === '%';
                return (
                  <Pressable
                    key={key}
                    onPress={() => press(key)}
                    style={({ pressed }) => [
                      styles.key,
                      key === '0' && styles.keyWide,
                      op && styles.keyOp,
                      fn && styles.keyFn,
                      pressed && styles.keyPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={key === '⌫' ? 'Delete' : key === 'C' ? 'Clear' : key}
                  >
                    {key === '⌫' ? (
                      <Ionicons name="backspace-outline" size={26} color={CALC.text} />
                    ) : (
                      <Text style={[styles.keyText, op && styles.keyTextOp]}>{key}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// The disguise deliberately does not use the MauSOS theme: it should look
// like any phone's calculator, not like part of a safety app.
const CALC = {
  bg: '#101114',
  key: '#2A2C31',
  fn: '#45484F',
  op: '#F29D38',
  text: '#F5F5F7',
  muted: '#8E9097',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CALC.bg },
  display: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 16 },
  expression: { color: CALC.muted, fontSize: 24, textAlign: 'right', minHeight: 30 },
  value: { color: CALC.text, fontSize: 72, fontWeight: '300', textAlign: 'right' },
  pad: { paddingHorizontal: 12, paddingBottom: 12 },
  row: { flexDirection: 'row' },
  key: {
    flex: 1,
    aspectRatio: 1,
    margin: 6,
    borderRadius: 999,
    backgroundColor: CALC.key,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyWide: { flex: 2, aspectRatio: 2.15 },
  keyOp: { backgroundColor: CALC.op },
  keyFn: { backgroundColor: CALC.fn },
  keyPressed: { opacity: 0.6 },
  keyText: { color: CALC.text, fontSize: 30, fontWeight: '400' },
  keyTextOp: { fontSize: 34 },
});
