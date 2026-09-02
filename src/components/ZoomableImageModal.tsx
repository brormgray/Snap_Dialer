import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  SafeAreaView,
  Dimensions,
  Platform,
} from 'react-native';
import { X, ZoomIn, ZoomOut, RotateCcw, FileCheck, ShieldCheck } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';

interface ZoomableImageModalProps {
  visible: boolean;
  imageUri: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ZoomableImageModal({
  visible,
  imageUri,
  title = 'Proof of Contact Request',
  subtitle,
  onClose,
}: ZoomableImageModalProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const handleZoomIn = async () => {
    await HapticsService.tick();
    setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = async () => {
    await HapticsService.tick();
    setZoomLevel((prev) => Math.max(prev - 0.5, 1));
  };

  const handleResetZoom = async () => {
    await HapticsService.tick();
    setZoomLevel(1);
  };

  const handleClose = () => {
    setZoomLevel(1);
    onClose();
  };

  if (!visible || !imageUri) return null;

  const baseImageWidth = SCREEN_WIDTH - 32;
  const baseImageHeight = Math.min(SCREEN_HEIGHT * 0.65, 520);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={styles.modalBackdrop}>
        <SafeAreaView style={styles.safeContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            {/* Floating Zoom Controls in Header */}
            <View style={styles.zoomControls}>
              <TouchableOpacity
                style={[styles.zoomBtn, zoomLevel <= 1 && styles.zoomBtnDisabled]}
                onPress={handleZoomOut}
                disabled={zoomLevel <= 1}
              >
                <ZoomOut size={18} color={zoomLevel <= 1 ? Colors.textMuted : Colors.brandPrimary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.zoomBtn} onPress={handleResetZoom}>
                <Text style={styles.zoomBadgeText}>{Math.round(zoomLevel * 100)}%</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.zoomBtn, zoomLevel >= 4 && styles.zoomBtnDisabled]}
                onPress={handleZoomIn}
                disabled={zoomLevel >= 4}
              >
                <ZoomIn size={18} color={zoomLevel >= 4 ? Colors.textMuted : Colors.brandPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <X size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Interactive Zoomable Viewport */}
          <View style={styles.viewportContainer}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  width: baseImageWidth * zoomLevel,
                  height: baseImageHeight * zoomLevel,
                  minWidth: '100%',
                  minHeight: '100%',
                },
              ]}
              maximumZoomScale={4.0}
              minimumZoomScale={1.0}
              zoomScale={zoomLevel}
              showsHorizontalScrollIndicator={true}
              showsVerticalScrollIndicator={true}
              pinchGestureEnabled={true}
              bounces={true}
              centerContent={true}
            >
              <Image
                source={{ uri: imageUri }}
                style={{
                  width: baseImageWidth * zoomLevel,
                  height: baseImageHeight * zoomLevel,
                }}
                resizeMode="contain"
              />
            </ScrollView>

            {/* Helper Hint */}
            <View style={styles.hintOverlay}>
              <Text style={styles.hintText}>
                💡 Pinch, scroll, or tap +/- above to zoom into handwritten notes
              </Text>
            </View>
          </View>

          {/* Compliance Footer */}
          <View style={styles.footer}>
            <ShieldCheck size={16} color={Colors.badgeSuccessText} />
            <Text style={styles.footerText}>
              Verified ValuTeachers Card • Stored Securely in Local Device Sandbox
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  safeContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.brandPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 4,
  },
  zoomBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnDisabled: {
    opacity: 0.4,
  },
  zoomBadgeText: {
    color: Colors.brandPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  viewportContainer: {
    flex: 1,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 12,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  hintText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeSuccessBg,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.badgeSuccessText,
  },
  footerText: {
    color: Colors.badgeSuccessText,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
});
