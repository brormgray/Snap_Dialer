import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  MessageSquare,
  Send,
  SkipForward,
  CheckCircle2,
  Clock,
  School,
  Award,
  Sparkles,
  RotateCcw,
  ChevronRight,
} from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';
import { TelephonyService } from '../services/telephonyService';
import { DripDispatcherService, DueDripItem } from '../services/dripDispatcherService';
import { AiSmsService } from '../services/aiSmsService';
import { isTeacherInPlanningNow } from '../data/bellSchedules';

interface BatchDripDispatchModalProps {
  visible: boolean;
  onClose: () => void;
  dueDrips: DueDripItem[];
  onDripSent: () => void;
}

export function BatchDripDispatchModal({
  visible,
  onClose,
  dueDrips,
  onDripSent,
}: BatchDripDispatchModalProps) {
  const [localQueue, setLocalQueue] = useState<DueDripItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [customMessage, setCustomMessage] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  useEffect(() => {
    if (visible && dueDrips.length > 0) {
      setLocalQueue([...dueDrips]);
      setCurrentIndex(0);
      setCustomMessage(dueDrips[0]?.formattedMessage || '');
    }
  }, [visible, dueDrips]);

  const currentItem: DueDripItem | undefined = localQueue[currentIndex];

  const handleClose = () => {
    setCurrentIndex(0);
    onClose();
  };

  const handleNext = () => {
    if (currentIndex + 1 < localQueue.length) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setCustomMessage(localQueue[nextIdx]?.formattedMessage || '');
    } else {
      handleClose();
    }
  };

  const handleGenerateAiSms = async (toneFocus?: any) => {
    if (!currentItem) return;
    setIsGeneratingAi(true);
    await HapticsService.medium();
    try {
      const generated = await AiSmsService.generatePersuasiveSMS(
        currentItem.lead,
        currentItem.track === 'client_annual_review' ? 'annual_review' : 'nurture',
        undefined,
        toneFocus
      );
      if (generated && generated.trim().length > 0) {
        setCustomMessage(generated.trim().replace(/^["']|["']$/g, ''));
        await HapticsService.success();
      }
    } catch (e) {
      console.warn('AI Drip generation fallback:', e);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSend = async () => {
    if (!currentItem || isSending) return;
    setIsSending(true);

    const bodyToSend = customMessage.trim() || currentItem.formattedMessage;

    // CRITICAL: Call TelephonyService.sendSMS synchronously on user click
    // without awaiting any microtasks before it to preserve iOS Safari touch gesture token!
    TelephonyService.sendSMS(currentItem.lead.phone, bodyToSend);
    HapticsService.medium().catch(() => {});

    try {
      // 2. Record log with the exact bodyToSend and advance drip step
      await DripDispatcherService.recordDripDispatched(
        currentItem.lead,
        currentItem.template,
        bodyToSend
      );

      // 3. Trigger parent refresh
      onDripSent();

      // 4. Advance to next educator after short cooldown
      setTimeout(() => {
        setIsSending(false);
        handleNext();
      }, 800);
    } catch (e) {
      console.error('Error dispatching drip:', e);
      setIsSending(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        {/* Modal Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconCircle}>
              <MessageSquare size={18} color={Colors.heavenlyGold} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Daily Drip Dispatcher</Text>
              <Text style={styles.headerSubtitle}>
                {localQueue.length > 0
                  ? `Educator ${currentIndex + 1} of ${localQueue.length}`
                  : 'All Caught Up'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={handleClose}
          >
            <X size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Modal Body */}
        {localQueue.length === 0 || !currentItem ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <CheckCircle2 size={44} color="#10B981" />
            </View>
            <Text style={styles.emptyTitle}>All Drips Dispatched!</Text>
            <Text style={styles.emptySub}>
              You have completed all pending nurture and annual review SMS drips for today.
            </Text>
            <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
              <Text style={styles.doneBtnText}>Back to Pipeline</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Educator Profile Banner */}
            <View style={styles.educatorCard}>
              <View style={styles.educatorTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.educatorName}>{currentItem.lead.name}</Text>
                  <Text style={styles.educatorPhone}>{currentItem.lead.phone}</Text>
                </View>
                {/* Track Badge */}
                <View
                  style={[
                    styles.trackBadge,
                    currentItem.track === 'client_annual_review' && styles.trackBadgeClient,
                  ]}
                >
                  <Award
                    size={11}
                    color={currentItem.track === 'client_annual_review' ? '#10B981' : Colors.heavenlyGold}
                  />
                  <Text
                    style={[
                      styles.trackBadgeText,
                      currentItem.track === 'client_annual_review' && { color: '#10B981' },
                    ]}
                  >
                    {currentItem.track === 'client_annual_review'
                      ? 'Track B: Client Review'
                      : 'Track A: Nurture'}
                  </Text>
                </View>
              </View>

              {/* School & Planning Window */}
              <View style={styles.metaRow}>
                <School size={14} color="#38BDF8" />
                <Text style={styles.metaText}>
                  {currentItem.lead.school || 'VOL'}
                  {currentItem.lead.room_number ? ` • Room ${currentItem.lead.room_number}` : ''}
                </Text>
              </View>

              {/* Bell schedule live status */}
              {currentItem.lead.planning_period ? (() => {
                const pInfo = isTeacherInPlanningNow(
                  currentItem.lead.planning_period,
                  currentItem.lead.school
                );
                return (
                  <View
                    style={[
                      styles.planningStatusBox,
                      pInfo.inPlanning && styles.planningStatusBoxActive,
                    ]}
                  >
                    <Clock
                      size={13}
                      color={pInfo.inPlanning ? '#22C55E' : Colors.heavenlyGold}
                    />
                    <Text
                      style={[
                        styles.planningStatusText,
                        pInfo.inPlanning && { color: '#22C55E', fontWeight: '800' },
                      ]}
                    >
                      {pInfo.inPlanning
                        ? `🟢 IN PLANNING PERIOD NOW (${pInfo.displayTime})`
                        : `Planning: ${currentItem.lead.planning_period}`}
                    </Text>
                  </View>
                );
              })() : null}
            </View>

            {/* Template Header & AI Re-Draft Controls */}
            <View style={styles.templateStageRow}>
              <Text style={styles.templateStageTitle} numberOfLines={1}>
                TOUCHPOINT: <Text style={{ color: Colors.heavenlyGold }}>{currentItem.template.title}</Text>
              </Text>
              <TouchableOpacity
                style={styles.aiGenerateBtn}
                onPress={() => handleGenerateAiSms()}
                disabled={isGeneratingAi}
                activeOpacity={0.7}
              >
                {isGeneratingAi ? (
                  <ActivityIndicator size="small" color="#38BDF8" />
                ) : (
                  <>
                    <Sparkles size={13} color="#38BDF8" />
                    <Text style={styles.aiGenerateBtnText}>AI Re-Draft</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Quick Focus Chips */}
            <View style={styles.focusChipRow}>
              {(currentItem.lead.custom_questions || currentItem.lead.notes) && (
                <TouchableOpacity
                  style={[styles.focusChip, { borderColor: Colors.heavenlyGold }]}
                  onPress={() => handleGenerateAiSms('address_question')}
                  disabled={isGeneratingAi}
                >
                  <Text style={[styles.focusChipText, { color: Colors.heavenlyGold }]}>📝 Address Note</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.focusChip}
                onPress={() => handleGenerateAiSms('planning_period')}
                disabled={isGeneratingAi}
              >
                <Text style={styles.focusChipText}>🏫 Planning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.focusChip}
                onPress={() => handleGenerateAiSms('meeting_confirmation')}
                disabled={isGeneratingAi}
              >
                <Text style={styles.focusChipText}>🎯 Meeting</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.focusChip}
                onPress={() => handleGenerateAiSms('drop_bonus_focus')}
                disabled={isGeneratingAi}
              >
                <Text style={styles.focusChipText}>💰 5% DROP</Text>
              </TouchableOpacity>
            </View>

            {/* Always-Editable Message Composer Card */}
            <View style={styles.messageBox}>
              <TextInput
                style={styles.messageInput}
                value={customMessage}
                onChangeText={setCustomMessage}
                multiline
                placeholder="Drafting message..."
                placeholderTextColor={Colors.textMuted}
                textAlignVertical="top"
              />
            </View>

            {/* Live Character Count & Reset Link */}
            <View style={styles.composerMetaRow}>
              <Text style={styles.charCountText}>
                {customMessage.length} characters • Tap text above to customize before sending
              </Text>
              {customMessage !== currentItem.formattedMessage && (
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={() => {
                    HapticsService.tick();
                    setCustomMessage(currentItem.formattedMessage);
                  }}
                >
                  <RotateCcw size={11} color={Colors.brandAccent} />
                  <Text style={styles.resetBtnText}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.complianceDisclaimer}>
              🔒 1-Tap Advisor Dispatch: Opens your native Messages composer with 1 tap for 100% TCPA & CTIA carrier compliance.
            </Text>

            {/* Action Bar */}
            <View style={styles.actionBar}>
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => {
                  HapticsService.tick();
                  handleNext();
                }}
                disabled={isSending}
              >
                <SkipForward size={16} color={Colors.textMuted} />
                <Text style={styles.skipBtnText}>Skip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sendBtn, isSending && { opacity: 0.6 }]}
                onPress={handleSend}
                disabled={isSending}
                activeOpacity={0.8}
              >
                <Send size={16} color="#000000" />
                <Text style={styles.sendBtnText}>
                  {isSending ? 'Opening...' : 'Send via Messages (1-Tap)'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 160, 23, 0.25)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: Colors.heavenlyGold,
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  educatorCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  educatorTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  educatorName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  educatorPhone: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  trackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.3)',
  },
  trackBadgeClient: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  trackBadgeText: {
    color: Colors.heavenlyGold,
    fontSize: 10,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  planningStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.2)',
    marginTop: 4,
  },
  planningStatusBoxActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22C55E',
  },
  planningStatusText: {
    color: Colors.heavenlyGold,
    fontSize: 11,
    fontWeight: '700',
  },
  templateStageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 6,
    gap: 8,
  },
  templateStageTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  aiGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  aiGenerateBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  focusChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  focusChip: {
    backgroundColor: '#1E293B',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  focusChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  messageBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderGold,
    padding: 16,
    marginBottom: 6,
  },
  messageInput: {
    color: Colors.livingWhite,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  composerMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 4,
    marginBottom: 12,
  },
  charCountText: {
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetBtnText: {
    color: Colors.brandAccent,
    fontSize: 11,
    fontWeight: '700',
  },
  complianceDisclaimer: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginHorizontal: 10,
    marginBottom: 20,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  skipBtnText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.heavenlyGold,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  sendBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '900',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySub: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  doneBtn: {
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
