import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Lock, Delete, ShieldCheck } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { SecurityService } from '../services/securityService';
import { HapticsService } from '../services/hapticsService';

interface PinLockModalProps {
  visible: boolean;
  onUnlocked: () => void;
}

export default function PinLockModal({ visible, onUnlocked }: PinLockModalProps) {
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPin('');
      setErrorMsg(null);
    }
  }, [visible]);

  const handleDigitPress = async (digit: string) => {
    if (pin.length >= 4) return;
    await HapticsService.tick();
    const newPin = pin + digit;
    setPin(newPin);
    setErrorMsg(null);

    if (newPin.length === 4) {
      const isValid = SecurityService.verifyPin(newPin);
      if (isValid) {
        await HapticsService.success();
        setPin('');
        onUnlocked();
      } else {
        await HapticsService.error();
        setErrorMsg('Incorrect PIN. Please try again.');
        setTimeout(() => setPin(''), 400);
      }
    }
  };

  const handleDelete = async () => {
    if (pin.length > 0) {
      await HapticsService.tick();
      setPin((prev) => prev.slice(0, -1));
      setErrorMsg(null);
    }
  };

  const handleClear = async () => {
    await HapticsService.tick();
    setPin('');
    setErrorMsg(null);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.sacredGreenDeep} />

        <View style={styles.headerArea}>
          <View style={styles.iconCircle}>
            <Lock size={32} color={Colors.heavenlyGold} />
          </View>
          <Text style={styles.title}>SnapDialer Protected</Text>
          <Text style={styles.subtitle}>Enter your 4-digit PIN to access educator pipeline</Text>
        </View>

        {/* 4 PIN Dots */}
        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <View
                key={index}
                style={[
                  styles.dot,
                  isFilled && styles.dotFilled,
                  errorMsg ? styles.dotError : null,
                ]}
              />
            );
          })}
        </View>

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : <View style={{ height: 20 }} />}

        {/* Keypad */}
        <View style={styles.keypad}>
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ].map((row, rIdx) => (
            <View key={rIdx} style={styles.keypadRow}>
              {row.map((num) => (
                <TouchableOpacity
                  key={num}
                  style={styles.keyButton}
                  onPress={() => handleDigitPress(num)}
                  activeOpacity={0.65}
                >
                  <Text style={styles.keyText}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {/* Bottom row: Clear, 0, Backspace */}
          <View style={styles.keypadRow}>
            <TouchableOpacity style={styles.actionButton} onPress={handleClear} activeOpacity={0.65}>
              <Text style={styles.actionText}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keyButton}
              onPress={() => handleDigitPress('0')}
              activeOpacity={0.65}
            >
              <Text style={styles.keyText}>0</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleDelete} activeOpacity={0.65}>
              <Delete size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footerNote}>
          <ShieldCheck size={16} color={Colors.heavenlyGold} />
          <Text style={styles.footerNoteText}>FERPA & Educator Data Shield Active</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#071A12',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 36,
  },
  headerArea: {
    alignItems: 'center',
    marginTop: 20,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderWidth: 1.5,
    borderColor: Colors.borderGold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.livingWhite,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 30,
    marginBottom: 10,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.borderGold,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.heavenlyGold,
    borderColor: Colors.heavenlyGold,
    transform: [{ scale: 1.1 }],
  },
  dotError: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '600',
    height: 20,
  },
  keypad: {
    width: '80%',
    maxWidth: 320,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  keyButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0D2D20',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.livingWhite,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.7,
  },
  footerNoteText: {
    fontSize: 12,
    color: Colors.heavenlyGold,
    fontWeight: '500',
  },
});
