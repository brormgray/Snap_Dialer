import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import {
  X,
  PhoneCall,
  User,
  Clock,
  School,
  FileText,
  Zap,
  CheckCircle2,
  Calendar,
  ChevronRight,
} from 'lucide-react-native';
import { Lead } from '../types';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';
import { PipelineStateService } from '../services/pipelineStateService';
import { isTeacherInPlanningNow } from '../data/bellSchedules';

export interface CallbacksDueModalProps {
  visible: boolean;
  onClose: () => void;
  callbacks: Lead[];
  onCallNow: (lead: Lead) => void;
  onViewDetails: (lead: Lead) => void;
  onStartQueue: (callbacks: Lead[]) => void;
}

export function CallbacksDueModal({
  visible,
  onClose,
  callbacks,
  onCallNow,
  onViewDetails,
  onStartQueue,
}: CallbacksDueModalProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;
  const now = useMemo(() => new Date(), [visible, callbacks]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.modalCard, isTablet && styles.modalCardTablet]}>
            {/* Modal Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <View style={styles.headerIconContainer}>
                  <Calendar size={18} color={Colors.heavenlyGold} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                      SCHEDULED CALLBACKS TODAY
                    </Text>
                    {callbacks.length > 0 && (
                      <View style={styles.headerBadge}>
                        <Text style={styles.headerBadgeText}>{callbacks.length} Due</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {new Date().toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    • Prioritized by scheduled time
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => {
                  HapticsService.tick();
                  onClose();
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Close callbacks modal"
                accessibilityRole="button"
              >
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Top Action CTA: Start Callback Queue */}
            {callbacks.length > 0 && (
              <View style={styles.topActionContainer}>
                <TouchableOpacity
                  style={styles.startQueueBtn}
                  onPress={() => {
                    HapticsService.success();
                    onStartQueue(callbacks);
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel={`Start callback queue with ${callbacks.length} educators`}
                  accessibilityRole="button"
                >
                  <View style={styles.startQueueContent}>
                    <View style={styles.startQueueIconCircle}>
                      <Zap size={18} color="#000000" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.startQueueTitle}>
                        ⚡ Start Callback Queue ({callbacks.length})
                      </Text>
                      <Text style={styles.startQueueSub}>
                        Dial through scheduled callbacks in sequence
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#000000" />
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Content Body: List of Callback Cards or Empty State */}
            {callbacks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <CheckCircle2 size={44} color="#10B981" />
                </View>
                <Text style={styles.emptyTitle}>No callbacks due today. All caught up!</Text>
                <Text style={styles.emptySub}>
                  There are no scheduled callbacks for today. When you schedule a callback with an
                  educator, it will automatically appear here.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCloseBtn}
                  onPress={() => {
                    HapticsService.tick();
                    onClose();
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.emptyCloseBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                style={styles.cardsScrollView}
                contentContainerStyle={styles.cardsScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {callbacks.map((lead, index) => {
                  const planningInfo = isTeacherInPlanningNow(lead.planning_period, lead.school);
                  const timeBadge = PipelineStateService.getCallbackTimeBadge(lead, now);
                  const noteSnippet = PipelineStateService.getCallbackNoteSnippet(lead);

                  return (
                    <View key={lead.id || `callback-${index}`} style={styles.callbackCard}>
                      {/* Card Header: Educator Name & Time Badge */}
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                          <Text style={styles.educatorName} numberOfLines={1}>
                            {lead.name}
                          </Text>
                          <View style={styles.educatorMetaRow}>
                            <School size={12} color="#94A3B8" />
                            <Text style={styles.educatorMetaText} numberOfLines={1}>
                              {lead.school || 'VOL'}
                              {lead.room_number ? ` • Rm ${lead.room_number}` : ''}
                            </Text>
                          </View>
                        </View>

                        {/* Scheduled Time Badge */}
                        <View
                          style={[
                            styles.timeBadge,
                            timeBadge.isOverdue && styles.timeBadgeOverdue,
                          ]}
                        >
                          <Clock
                            size={11}
                            color={timeBadge.isOverdue ? '#DC2626' : '#B45309'}
                          />
                          <Text
                            style={[
                              styles.timeBadgeText,
                              timeBadge.isOverdue && styles.timeBadgeTextOverdue,
                            ]}
                            numberOfLines={1}
                          >
                            {timeBadge.label}
                          </Text>
                        </View>
                      </View>

                      {/* Phone & Live Bell Schedule Bar */}
                      <View style={styles.phoneAndPlanningRow}>
                        <View style={styles.phonePill}>
                          <PhoneCall size={11} color="#38BDF8" />
                          <Text style={styles.phonePillText}>
                            {lead.phone || 'No Phone'}
                          </Text>
                        </View>

                        {planningInfo.inPlanning ? (
                          <View style={styles.planningActiveBadge}>
                            <View style={styles.livePulseDot} />
                            <Text style={styles.planningActiveText} numberOfLines={1}>
                              In Planning Now ({planningInfo.displayTime})
                            </Text>
                          </View>
                        ) : lead.planning_period ? (
                          <View style={styles.planningQuietBadge}>
                            <Text style={styles.planningQuietText} numberOfLines={1}>
                              Period {lead.planning_period}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Callback Reason / Notes Snippet Box */}
                      {noteSnippet ? (
                        <View style={styles.noteSnippetBox}>
                          <FileText size={13} color={Colors.heavenlyGold} style={{ marginTop: 2 }} />
                          <Text style={styles.noteSnippetText} numberOfLines={2}>
                            {noteSnippet}
                          </Text>
                        </View>
                      ) : null}

                      {/* Action Buttons Row */}
                      <View style={styles.cardActionsRow}>
                        {/* 📞 Call Now: triggers direct call + quick disposition */}
                        <TouchableOpacity
                          style={styles.callNowBtn}
                          onPress={() => {
                            HapticsService.medium();
                            onCallNow(lead);
                          }}
                          activeOpacity={0.8}
                          accessibilityLabel={`Call ${lead.name} now`}
                          accessibilityRole="button"
                        >
                          <PhoneCall size={15} color="#000000" />
                          <Text style={styles.callNowBtnText}>Call Now</Text>
                        </TouchableOpacity>

                        {/* 👤 Details: navigates to LeadDetailScreen */}
                        <TouchableOpacity
                          style={styles.detailsBtn}
                          onPress={() => {
                            HapticsService.tick();
                            onViewDetails(lead);
                          }}
                          activeOpacity={0.8}
                          accessibilityLabel={`View details for ${lead.name}`}
                          accessibilityRole="button"
                        >
                          <User size={15} color="#E2E8F0" />
                          <Text style={styles.detailsBtnText}>Details</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Footer Queue Runner if > 2 callbacks */}
            {callbacks.length > 2 && (
              <View style={styles.footerContainer}>
                <TouchableOpacity
                  style={styles.footerQueueBtn}
                  onPress={() => {
                    HapticsService.success();
                    onStartQueue(callbacks);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Zap size={16} color="#000000" />
                  <Text style={styles.footerQueueBtnText}>
                    Dial Callback Queue ({callbacks.length} remaining)
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalCard: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0B1120',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(212, 160, 23, 0.4)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalCardTablet: {
    maxWidth: 580,
    alignSelf: 'center',
    borderRadius: 20,
    marginVertical: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 160, 23, 0.4)',
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.3)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  headerBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    flexShrink: 0,
  },
  headerBadgeText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  topActionContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  startQueueBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  startQueueContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  startQueueIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startQueueTitle: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  startQueueSub: {
    color: 'rgba(0, 0, 0, 0.75)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  cardsScrollView: {
    flex: 1,
  },
  cardsScrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  callbackCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  educatorName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  educatorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  educatorMetaText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  timeBadgeOverdue: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  timeBadgeText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '800',
  },
  timeBadgeTextOverdue: {
    color: '#DC2626',
    fontWeight: '900',
  },
  phoneAndPlanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  phonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  phonePillText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  planningActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  planningActiveText: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '800',
  },
  planningQuietBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  planningQuietText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  noteSnippetBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.25)',
    marginBottom: 10,
  },
  noteSnippetText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
    fontStyle: 'italic',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  callNowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  callNowBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  detailsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  detailsBtnText: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyCloseBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  footerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0B1120',
  },
  footerQueueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.heavenlyGold,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  footerQueueBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900',
  },
});
