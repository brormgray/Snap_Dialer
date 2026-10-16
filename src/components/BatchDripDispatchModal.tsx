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
  Zap,
} from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';
import { TelephonyService } from './../services/telephonyService';
import { DripDispatcherService, DueDripItem } from '../services/dripDispatcherService';
import { AiSmsService } from '../services/aiSmsService';
import { isTeacherInPlanningNow } from '../data/bellSchedules';
import { FrsKnowledgeBank, FRS_WISDOM_BANK, FrsTopicKey, FrsWisdomSeed } from '../data/frsKnowledgeBank';
import { SMSTemplate, DripCategory } from '../types';

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
  const [selectedFrsTopic, setSelectedFrsTopic] = useState<FrsTopicKey | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<DripCategory>('action_appointment');
  const [activeTemplate, setActiveTemplate] = useState<SMSTemplate | null>(null);

  const wasVisibleRef = React.useRef<boolean>(false);
  const advanceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      wasVisibleRef.current = true;
      if (dueDrips.length > 0) {
        setLocalQueue([...dueDrips]);
        setCurrentIndex(0);
        setSelectedFrsTopic(undefined);
        const first = dueDrips[0];
        const initialCat: DripCategory =
          first?.dripCategory ||
          first?.template?.drip_category ||
          (first?.isZeroAsk ? 'pure_insight' : 'action_appointment');
        setSelectedCategory(initialCat);
        setActiveTemplate(first?.template || null);
        setCustomMessage(first?.formattedMessage || '');
      } else {
        setLocalQueue([]);
      }
    } else if (!visible) {
      wasVisibleRef.current = false;
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    }
  }, [visible, dueDrips]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const currentItem: DueDripItem | undefined = localQueue[currentIndex];

  const handleClose = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setIsSending(false);
    setCurrentIndex(0);
    setSelectedFrsTopic(undefined);
    onClose();
  };

  const handleNext = () => {
    setSelectedFrsTopic(undefined);
    if (currentIndex + 1 < localQueue.length) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      const nextItem = localQueue[nextIdx];
      const nextCat: DripCategory =
        nextItem?.dripCategory ||
        nextItem?.template?.drip_category ||
        (nextItem?.isZeroAsk ? 'pure_insight' : 'action_appointment');
      setSelectedCategory(nextCat);
      setActiveTemplate(nextItem?.template || null);
      setCustomMessage(nextItem?.formattedMessage || '');
    } else {
      handleClose();
    }
  };

  const handleSelectCategory = async (cat: DripCategory) => {
    if (!currentItem) return;
    if (selectedCategory === cat) return;
    await HapticsService.tick().catch(() => {});
    setSelectedCategory(cat);

    const alt = currentItem.categoryAlternatives?.[cat];
    if (alt) {
      setActiveTemplate(alt.template);
      setCustomMessage(alt.formattedMessage);
    }
  };

  const handleGenerateAiSms = async (toneFocus?: any, topicOverride?: FrsTopicKey) => {
    if (!currentItem) return;
    setIsGeneratingAi(true);
    await HapticsService.medium();
    try {
      const isZeroAskActive = selectedCategory === 'pure_insight' || selectedCategory === 'school_community';
      const effectiveTone = toneFocus || (
        isZeroAskActive
          ? (selectedCategory === 'pure_insight' ? 'zero_ask_insight' : 'zero_ask_community')
          : currentItem.stage === 'sprint'
          ? 'drip_sprint'
          : currentItem.stage === 'bridge'
          ? 'drip_bridge'
          : currentItem.stage === 'monthly'
          ? 'drip_monthly'
          : currentItem.track === 'client_annual_review'
          ? 'annual_review'
          : 'nurture'
      );
      const effectiveTopic = topicOverride || selectedFrsTopic || currentItem.recommendedWisdomSeed?.key;
      const generated = await AiSmsService.generatePersuasiveSMS(
        currentItem.lead,
        currentItem.track === 'client_annual_review' ? 'annual_review' : 'nurture',
        undefined,
        effectiveTone,
        new Date(),
        effectiveTopic
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
      const templateToRecord = activeTemplate || currentItem.template;
      await DripDispatcherService.recordDripDispatched(
        currentItem.lead,
        templateToRecord,
        bodyToSend
      );

      // 3. Trigger parent refresh
      onDripSent();

      // 4. Advance to next educator after short cooldown
      advanceTimerRef.current = setTimeout(() => {
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
                {/* Badges Container */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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

                  {/* Stage Badge */}
                  {currentItem.stage && (
                    <View
                      style={[
                        styles.stageBadge,
                        currentItem.stage === 'sprint' && styles.stageBadgeSprint,
                        currentItem.stage === 'bridge' && styles.stageBadgeBridge,
                        currentItem.stage === 'monthly' && styles.stageBadgeMonthly,
                        currentItem.stage === 'client' && styles.stageBadgeClient,
                      ]}
                    >
                      <Zap
                        size={10}
                        color={
                          currentItem.stage === 'sprint'
                            ? '#F59E0B'
                            : currentItem.stage === 'bridge'
                            ? '#38BDF8'
                            : currentItem.stage === 'monthly'
                            ? '#C084FC'
                            : '#10B981'
                        }
                      />
                      <Text
                        style={[
                          styles.stageBadgeText,
                          currentItem.stage === 'sprint' && { color: '#F59E0B' },
                          currentItem.stage === 'bridge' && { color: '#38BDF8' },
                          currentItem.stage === 'monthly' && { color: '#C084FC' },
                          currentItem.stage === 'client' && { color: '#10B981' },
                        ]}
                      >
                        {currentItem.stageLabel || currentItem.stage.toUpperCase()}
                      </Text>
                    </View>
                  )}
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

            {/* 3-Way Category Swapper: Direct Ask vs Zero-Ask Insight vs Zero-Ask Community */}
            {(() => {
              const isEducator = currentItem.lead.is_frs !== false;
              return (
                <View style={styles.categorySwapperContainer}>
                  <TouchableOpacity
                    style={[
                      styles.categoryTab,
                      selectedCategory === 'action_appointment' && styles.categoryTabActiveAsk,
                    ]}
                    onPress={() => handleSelectCategory('action_appointment')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.categoryTabText,
                        selectedCategory === 'action_appointment' && styles.categoryTabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      🎯 Direct Ask
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.categoryTab,
                      selectedCategory === 'pure_insight' && styles.categoryTabActiveInsight,
                    ]}
                    onPress={() => handleSelectCategory('pure_insight')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.categoryTabText,
                        selectedCategory === 'pure_insight' && styles.categoryTabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      💡 {isEducator ? 'FRS Insight' : 'Insight'} (Zero-Ask)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.categoryTab,
                      selectedCategory === 'school_community' && styles.categoryTabActiveCommunity,
                    ]}
                    onPress={() => handleSelectCategory('school_community')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.categoryTabText,
                        selectedCategory === 'school_community' && styles.categoryTabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      🏫 {isEducator ? 'School Goodwill' : 'Goodwill'} (Zero-Ask)
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

            {/* Category Awareness Banner */}
            <View
              style={[
                styles.categoryBanner,
                (selectedCategory === 'pure_insight' || selectedCategory === 'school_community')
                  ? styles.categoryBannerZeroAsk
                  : styles.categoryBannerAsk,
              ]}
            >
              <Text
                style={[
                  styles.categoryBannerText,
                  (selectedCategory === 'pure_insight' || selectedCategory === 'school_community')
                    ? { color: '#38BDF8' }
                    : { color: '#FBBF24' },
                ]}
              >
                {(selectedCategory === 'pure_insight' || selectedCategory === 'school_community')
                  ? '💡 ZERO-ASK TOUCHPOINT • Pure Value & Rapport (No Meeting Pressure)'
                  : '🎯 APPOINTMENT TOUCHPOINT • Direct Sit-Down / Planning Period Review Ask'}
              </Text>
            </View>

            {/* Template Header & AI Re-Draft Controls */}
            <View style={styles.templateStageRow}>
              <Text style={styles.templateStageTitle} numberOfLines={1}>
                TOUCHPOINT: <Text style={{ color: Colors.heavenlyGold }}>{(activeTemplate || currentItem.template).title}</Text>
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

            {/* Stage-Calibrated Focus Chips */}
            <View style={styles.focusChipRow}>
              <TouchableOpacity
                style={[
                  styles.focusChip,
                  selectedCategory === 'pure_insight' && { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.15)' },
                ]}
                onPress={() => handleGenerateAiSms('zero_ask_insight')}
                disabled={isGeneratingAi}
              >
                <Text style={[styles.focusChipText, selectedCategory === 'pure_insight' && { color: '#38BDF8', fontWeight: '800' }]}>
                  💡 Zero-Ask Insight
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.focusChip,
                  selectedCategory === 'school_community' && { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)' },
                ]}
                onPress={() => handleGenerateAiSms('zero_ask_community')}
                disabled={isGeneratingAi}
              >
                <Text style={[styles.focusChipText, selectedCategory === 'school_community' && { color: '#10B981', fontWeight: '800' }]}>
                  🏫 School Goodwill
                </Text>
              </TouchableOpacity>

              {(currentItem.lead.custom_questions || currentItem.lead.notes) && (
                <TouchableOpacity
                  style={[styles.focusChip, { borderColor: Colors.heavenlyGold }]}
                  onPress={() => handleGenerateAiSms('address_question')}
                  disabled={isGeneratingAi}
                >
                  <Text style={[styles.focusChipText, { color: Colors.heavenlyGold }]}>📝 Address Note</Text>
                </TouchableOpacity>
              )}

              {currentItem.stage === 'sprint' && (
                <>
                  <TouchableOpacity
                    style={[styles.focusChip, { borderColor: '#F59E0B' }]}
                    onPress={() => handleGenerateAiSms('sprint_summary')}
                    disabled={isGeneratingAi}
                  >
                    <Text style={[styles.focusChipText, { color: '#F59E0B' }]}>⚡ Next Step</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.focusChip}
                    onPress={() => handleGenerateAiSms('sprint_roadblock')}
                    disabled={isGeneratingAi}
                  >
                    <Text style={styles.focusChipText}>📄 Roadblock Buster</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentItem.stage === 'bridge' && (
                <>
                  <TouchableOpacity
                    style={[styles.focusChip, { borderColor: '#38BDF8' }]}
                    onPress={() => handleGenerateAiSms('bridge_proof')}
                    disabled={isGeneratingAi}
                  >
                    <Text style={[styles.focusChipText, { color: '#38BDF8' }]}>👥 Peer Story</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.focusChip}
                    onPress={() => handleGenerateAiSms('bridge_reset')}
                    disabled={isGeneratingAi}
                  >
                    <Text style={styles.focusChipText}>🎯 9-Word Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.focusChip}
                    onPress={() => handleGenerateAiSms('bridge_pause')}
                    disabled={isGeneratingAi}
                  >
                    <Text style={styles.focusChipText}>⏸️ Pause Option</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentItem.stage === 'monthly' && (
                <TouchableOpacity
                  style={[styles.focusChip, { borderColor: '#C084FC' }]}
                  onPress={() => handleGenerateAiSms('monthly_insight')}
                  disabled={isGeneratingAi}
                >
                  <Text style={[styles.focusChipText, { color: '#C084FC' }]}>📚 Pension Insight</Text>
                </TouchableOpacity>
              )}

              {currentItem.track === 'client_annual_review' && (
                <TouchableOpacity
                  style={[styles.focusChip, { borderColor: '#10B981' }]}
                  onPress={() => handleGenerateAiSms('client_check')}
                  disabled={isGeneratingAi}
                >
                  <Text style={[styles.focusChipText, { color: '#10B981' }]}>💎 Policy Check</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.focusChip}
                onPress={() => handleGenerateAiSms('planning_period')}
                disabled={isGeneratingAi}
              >
                <Text style={styles.focusChipText}>🏫 Planning</Text>
              </TouchableOpacity>
            </View>

            {/* Seeded FRS Wisdom Insight & Quick-Switch Topic Strip */}
            {currentItem.lead.is_frs !== false && (() => {
              const activeSeed: FrsWisdomSeed | undefined = selectedFrsTopic
                ? FRS_WISDOM_BANK.find((s) => s.key === selectedFrsTopic)
                : currentItem.recommendedWisdomSeed || FrsKnowledgeBank.recommendWisdomSeed(currentItem.lead);

              if (!activeSeed) return null;

              return (
                <View style={styles.wisdomPanel}>
                  <View style={styles.wisdomHeaderRow}>
                    <View style={styles.wisdomBadge}>
                      <Sparkles size={11} color={Colors.heavenlyGold} />
                      <Text style={styles.wisdomBadgeText}>SEEDED FRS INSIGHT</Text>
                    </View>
                    <Text style={styles.wisdomTitle} numberOfLines={1}>
                      {activeSeed.title}
                    </Text>
                  </View>

                  <Text style={styles.wisdomFact} numberOfLines={2}>
                    💡 {activeSeed.samplePhrasing}
                  </Text>

                  {/* Horizontal Quick-Switch Topic Chips */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.wisdomScroll}
                    contentContainerStyle={styles.wisdomScrollContent}
                  >
                    {FRS_WISDOM_BANK.map((seed) => {
                      const isSelected = activeSeed.key === seed.key;
                      return (
                        <TouchableOpacity
                          key={seed.key}
                          style={[
                            styles.wisdomChip,
                            isSelected && styles.wisdomChipActive,
                          ]}
                          onPress={() => {
                            HapticsService.tick().catch(() => {});
                            setSelectedFrsTopic(seed.key);
                            handleGenerateAiSms(undefined, seed.key);
                          }}
                          disabled={isGeneratingAi}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.wisdomChipText,
                              isSelected && styles.wisdomChipTextActive,
                            ]}
                          >
                            {seed.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}

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
              {customMessage !== (currentItem.categoryAlternatives?.[selectedCategory]?.formattedMessage || currentItem.formattedMessage) && (
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={() => {
                    HapticsService.tick();
                    setCustomMessage(currentItem.categoryAlternatives?.[selectedCategory]?.formattedMessage || currentItem.formattedMessage);
                  }}
                >
                  <RotateCcw size={11} color={Colors.brandAccent} />
                  <Text style={styles.resetBtnText}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Next Touch Preview */}
            {currentItem.suggestedNextDate && (
              <View style={styles.nextTouchRow}>
                <Clock size={12} color={Colors.heavenlyGold} />
                <Text style={styles.nextTouchText}>
                  Next Cadence Touch: scheduled for ~{new Date(currentItem.suggestedNextDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                </Text>
              </View>
            )}

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
    color: '#94A3B8',
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
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
  },
  stageBadgeSprint: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  stageBadgeBridge: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderColor: 'rgba(14, 165, 233, 0.4)',
  },
  stageBadgeMonthly: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  stageBadgeClient: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  stageBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  nextTouchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.2)',
  },
  nextTouchText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    color: '#CBD5E1',
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
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  categorySwapperContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 4,
    gap: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  categoryTabActiveAsk: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  categoryTabActiveInsight: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  categoryTabActiveCommunity: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  categoryTabText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  categoryTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  categoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
  },
  categoryBannerZeroAsk: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  categoryBannerAsk: {
    backgroundColor: 'rgba(212, 160, 23, 0.1)',
    borderColor: 'rgba(212, 160, 23, 0.3)',
  },
  categoryBannerText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
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
    color: '#94A3B8',
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
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  focusChipText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  wisdomPanel: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.35)',
    padding: 12,
    marginBottom: 10,
  },
  wisdomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  wisdomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.4)',
  },
  wisdomBadgeText: {
    color: '#FBBF24',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  wisdomTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  wisdomFact: {
    color: '#CBD5E1',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  wisdomScroll: {
    marginTop: 2,
  },
  wisdomScrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 8,
  },
  wisdomChip: {
    backgroundColor: '#1E293B',
    paddingVertical: 4.5,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  wisdomChipActive: {
    backgroundColor: 'rgba(212, 160, 23, 0.22)',
    borderColor: '#F59E0B',
  },
  wisdomChipText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '600',
  },
  wisdomChipTextActive: {
    color: '#FBBF24',
    fontWeight: '800',
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
    fontSize: 16,
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
    color: '#94A3B8',
    fontSize: 11,
    flex: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  complianceDisclaimer: {
    color: '#94A3B8',
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
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  skipBtnText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '700',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
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
    color: '#CBD5E1',
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
