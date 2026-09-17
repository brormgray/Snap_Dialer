import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import {
  PhoneCall,
  PhoneOff,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Clock,
  X,
  FileText,
  ShieldAlert,
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Sparkles,
} from 'lucide-react-native';
import { Lead, CallDisposition } from '../types';
import { Colors } from '../theme/colors';
import { LeadsRepository } from '../db/leadsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { NotesService } from '../services/notesService';
import { HapticsService } from '../services/hapticsService';
import { AppointmentSchedulerModal } from './AppointmentSchedulerModal';
import { CallbackSchedulerModal } from './CallbackSchedulerModal';

export interface QuickDispositionModalProps {
  visible: boolean;
  lead: Lead | null;
  isCallActive?: boolean;
  initialStartTime?: number | null;
  onClose: () => void;
  onDispositionComplete?: (updatedLead: Lead, disposition: CallDisposition) => void;
}

const OTHER_CHIPS = [
  'Spoke with Secretary / Front Desk',
  'Wrong Extension / Transferred',
  'Educator on Leave / Sabbatical',
  'Retired / Transferred District',
  'Hung Up Immediately',
  'Gatekeeper Refusal',
  'Requested Email First',
  'Part-time / Split Campus',
];

export function QuickDispositionModal(props: QuickDispositionModalProps) {
  if (!props.visible || !props.lead) return null;
  return <QuickDispositionModalContent {...props} lead={props.lead} />;
}

function QuickDispositionModalContent({
  visible,
  lead,
  isCallActive = false,
  initialStartTime,
  onClose,
  onDispositionComplete,
}: QuickDispositionModalProps & { lead: Lead }) {
  // Live Call Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [callEnded, setCallEnded] = useState<boolean>(!isCallActive);
  const startTimeRef = useRef<number | null>(initialStartTime || null);

  // Sub-modals & views
  const [isOtherView, setIsOtherView] = useState<boolean>(false);
  const [otherNote, setOtherNote] = useState<string>('');
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [isApptModalVisible, setIsApptModalVisible] = useState<boolean>(false);
  const [isCallbackModalVisible, setIsCallbackModalVisible] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Reset and initialize on open
  useEffect(() => {
    if (visible) {
      const start = initialStartTime || (isCallActive ? Date.now() : null);
      startTimeRef.current = start;
      setCallEnded(!isCallActive);
      setIsOtherView(false);
      setOtherNote('');
      setSelectedChips([]);
      setIsApptModalVisible(false);
      setIsCallbackModalVisible(false);
      setIsSaving(false);

      if (start && isCallActive) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
      } else {
        setElapsedSeconds(0);
      }
    }
  }, [visible, initialStartTime, isCallActive]);

  // Running timer interval
  useEffect(() => {
    if (!visible || !startTimeRef.current || callEnded) return;

    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000)));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, callEnded]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCallOnly = () => {
    HapticsService.tick().catch(() => {});
    setCallEnded(true);
  };

  const toggleChip = (chip: string) => {
    HapticsService.tick().catch(() => {});
    if (selectedChips.includes(chip)) {
      setSelectedChips(selectedChips.filter((c) => c !== chip));
    } else {
      setSelectedChips([...selectedChips, chip]);
    }
  };

  // Direct 1-tap disposition handler
  const executeDisposition = async (disposition: CallDisposition, noteText?: string) => {
    if (isSaving || !lead) return;
    setIsSaving(true);
    try {
      if (disposition === 'connected' || disposition === 'spoke') {
        await HapticsService.success();
      } else if (disposition === 'bad_number' || disposition === 'do_not_call') {
        await HapticsService.heavy();
      } else {
        await HapticsService.tick();
      }

      const duration = startTimeRef.current
        ? Math.max(elapsedSeconds, Math.floor((Date.now() - startTimeRef.current) / 1000))
        : 0;

      // Build structured note
      const attemptNum = (lead.attempts_count || 0) + 1;
      let defaultNote: string | undefined;
      if (disposition === 'no_answer') {
        defaultNote = `Call attempt #${attemptNum}: No Answer.`;
      } else if (disposition === 'voicemail') {
        defaultNote = `Call attempt #${attemptNum}: Left Voicemail.`;
      } else if (disposition === 'connected' || disposition === 'spoke') {
        defaultNote = `Call attempt #${attemptNum}: Connected / Spoke on phone.`;
      } else if (disposition === 'do_not_call') {
        defaultNote = `Call attempt #${attemptNum}: Flagged Do Not Call.`;
      } else if (disposition === 'bad_number') {
        defaultNote = `Call attempt #${attemptNum}: Bad Number / Disconnected.`;
      } else if (disposition === 'other') {
        defaultNote = `Call attempt #${attemptNum} (Other): ${noteText || 'Custom outcome recorded.'}`;
      }

      const finalNote = noteText || defaultNote;
      const updatedNotes = finalNote ? NotesService.addNote(lead.notes, finalNote) : lead.notes;

      // 1. Update Lead in Database
      await LeadsRepository.updateLeadDisposition(lead.id, disposition, updatedNotes || undefined);

      // 2. Log Call record
      await CallLogsRepository.logCall({
        leadId: lead.id,
        listId: lead.list_id,
        durationSeconds: duration,
        disposition,
        note: finalNote,
        smsSent: false,
      });

      // 3. Hydrate updated lead object
      const freshLead: Lead = {
        ...lead,
        last_disposition: disposition,
        attempts_count: (lead.attempts_count || 0) + 1,
        cadence_step: (lead.cadence_step || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        notes: updatedNotes || lead.notes,
        follow_up_at: disposition === 'callback_requested' ? lead.follow_up_at : null,
      };

      if (onDispositionComplete) {
        onDispositionComplete(freshLead, disposition);
      }
      onClose();
    } catch (err) {
      console.error('Failed to log quick disposition:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Appointment save handler
  const handleSaveAppointment = async (payload: {
    scheduledDate: Date;
    scheduledISO: string;
    roomNumber?: string;
    notes?: string;
  }) => {
    if (!lead) return;
    setIsSaving(true);
    try {
      await HapticsService.success();
      const duration = startTimeRef.current
        ? Math.max(elapsedSeconds, Math.floor((Date.now() - startTimeRef.current) / 1000))
        : 0;

      const dateFormatted = payload.scheduledDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const timeFormatted = payload.scheduledDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });

      const note = `Confirmed Sit-Down scheduled for ${dateFormatted} @ ${timeFormatted}${
        payload.roomNumber ? ` (Room ${payload.roomNumber})` : ''
      }${payload.notes ? `. Notes: ${payload.notes}` : ''}.`;

      const updatedNotes = NotesService.addNote(lead.notes, note);
      await LeadsRepository.scheduleAppointment(lead.id, payload.scheduledISO, updatedNotes);

      await CallLogsRepository.logCall({
        leadId: lead.id,
        listId: lead.list_id,
        durationSeconds: duration,
        disposition: 'appointment_set',
        note,
      });

      const freshLead: Lead = {
        ...lead,
        last_disposition: 'appointment_set',
        appointment_scheduled_at: payload.scheduledISO,
        follow_up_at: payload.scheduledISO,
        notes: updatedNotes,
        attempts_count: (lead.attempts_count || 0) + 1,
      };

      setIsApptModalVisible(false);
      if (onDispositionComplete) {
        onDispositionComplete(freshLead, 'appointment_set');
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Callback save handler
  const handleSaveCallback = async (payload: { followUpDateISO: string; note: string }) => {
    if (!lead) return;
    setIsSaving(true);
    try {
      await HapticsService.success();
      const duration = startTimeRef.current
        ? Math.max(elapsedSeconds, Math.floor((Date.now() - startTimeRef.current) / 1000))
        : 0;

      await LeadsRepository.scheduleFollowUp(lead.id, payload.followUpDateISO, payload.note);

      await CallLogsRepository.logCall({
        leadId: lead.id,
        listId: lead.list_id,
        durationSeconds: duration,
        disposition: 'callback_requested',
        note: payload.note,
      });

      const freshLead: Lead = {
        ...lead,
        last_disposition: 'callback_requested',
        follow_up_at: payload.followUpDateISO,
        notes: payload.note ? NotesService.addNote(lead.notes, payload.note) : lead.notes,
        attempts_count: (lead.attempts_count || 0) + 1,
      };

      setIsCallbackModalVisible(false);
      if (onDispositionComplete) {
        onDispositionComplete(freshLead, 'callback_requested');
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Do Not Call confirmation
  const handleConfirmDNC = () => {
    const doConfirm = () => executeDisposition('do_not_call');
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Flag "${lead.name}" as Do Not Call? They will be removed from all calling queues.`)) {
        doConfirm();
      }
      return;
    }

    Alert.alert(
      'Flag as Do Not Call',
      `Are you sure you want to mark "${lead.name}" as Do Not Call?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Flag DNC', style: 'destructive', onPress: doConfirm },
      ]
    );
  };

  // Handle saving 'Other' disposition
  const handleSaveOther = () => {
    const chipText = selectedChips.join('; ');
    const userText = otherNote.trim();
    let combinedNote = '';
    if (chipText && userText) {
      combinedNote = `${chipText} — ${userText}`;
    } else if (chipText) {
      combinedNote = chipText;
    } else if (userText) {
      combinedNote = userText;
    } else {
      combinedNote = 'Non-standard outcome recorded.';
    }

    executeDisposition('other', combinedNote);
  };

  return (
    <>
      <Modal visible={visible && !isApptModalVisible && !isCallbackModalVisible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              HapticsService.tick().catch(() => {});
              onClose();
            }}
          />
          <View style={styles.modalCard} pointerEvents="auto">
            {/* Header: Call Status & Educator Summary */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <View style={styles.callBadgeRow}>
                  {isCallActive && !callEnded ? (
                    <View style={styles.liveCallBadge}>
                      <View style={styles.livePulseDot} />
                      <Text style={styles.liveCallBadgeText}>CALL IN PROGRESS: {formatTimer(elapsedSeconds)}</Text>
                    </View>
                  ) : (
                    <View style={styles.idleCallBadge}>
                      <ClipboardList size={13} color={Colors.brandAccent} />
                      <Text style={styles.idleCallBadgeText}>
                        {isCallActive ? `CALL DURATION: ${formatTimer(elapsedSeconds)}` : 'QUICK DISPOSITION'}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.leadName}>{lead.name}</Text>
                <Text style={styles.leadDetails} numberOfLines={1} ellipsizeMode="tail">
                  {lead.phone} • {lead.school || 'Campus'}{lead.planning_period ? ` • ${lead.planning_period}` : ''}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                onPress={() => {
                  HapticsService.tick().catch(() => {});
                  onClose();
                }}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* End Call Pill if call is active and user wants to mark call stopped before picking disposition */}
            {isCallActive && !callEnded && (
              <View style={styles.callControlStrip}>
                <Text style={styles.callControlText}>Live connection active. Select outcome below when finished:</Text>
                <TouchableOpacity style={styles.hangupPill} onPress={handleEndCallOnly}>
                  <PhoneOff size={14} color="#EF4444" />
                  <Text style={styles.hangupPillText}>End Call</Text>
                </TouchableOpacity>
              </View>
            )}

            {isSaving ? (
              <View style={styles.savingContainer}>
                <ActivityIndicator size="large" color={Colors.brandAccent} />
                <Text style={styles.savingText}>Recording disposition and logging call...</Text>
              </View>
            ) : isOtherView ? (
              /* Other Disposition View: Write-in Notes + Quick Reason Chips */
              <ScrollView style={styles.otherContainer} showsVerticalScrollIndicator={false}>
                <View style={styles.otherHeaderRow}>
                  <Text style={styles.sectionTitle}>📋 OTHER OUTCOME / REASON</Text>
                  <TouchableOpacity onPress={() => setIsOtherView(false)}>
                    <Text style={styles.backLink}>← Back to Dispositions</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.otherSubtitle}>
                  Select quick outcome chips or write detailed disposition notes below:
                </Text>

                {/* Quick Chips */}
                <View style={styles.chipsContainer}>
                  {OTHER_CHIPS.map((chip) => {
                    const isSelected = selectedChips.includes(chip);
                    return (
                      <TouchableOpacity
                        key={chip}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => toggleChip(chip)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {isSelected ? '✓ ' : '+ '}{chip}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Note TextInput */}
                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>CUSTOM DISPOSITION NOTES</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="e.g. Spoke with front desk clerk, educator is out on maternity leave until November..."
                  placeholderTextColor={Colors.textMuted}
                  value={otherNote}
                  onChangeText={setOtherNote}
                  multiline
                  numberOfLines={4}
                  autoFocus
                />

                {/* Action Buttons */}
                <View style={styles.otherActionRow}>
                  <TouchableOpacity
                    style={styles.cancelOtherBtn}
                    onPress={() => setIsOtherView(false)}
                  >
                    <Text style={styles.cancelOtherBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.saveOtherBtn}
                    onPress={handleSaveOther}
                  >
                    <CheckCircle2 size={16} color="#FFFFFF" />
                    <Text style={styles.saveOtherBtnText}>Save 'Other' Disposition</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              /* Standard 1-Tap Disposition Deck */
              <ScrollView style={styles.dispoGridContainer} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionTitle}>SELECT CALL OUTCOME (1-TAP)</Text>

                <View style={styles.primaryGrid}>
                  {/* 🎯 Confirmed Sit-Down / Appt Set */}
                  <TouchableOpacity
                    style={[styles.dispoCard, styles.cardAppt]}
                    onPress={() => setIsApptModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dispoEmoji}>🎯</Text>
                    <Text style={styles.dispoCardTitle}>Appt Set</Text>
                    <Text style={styles.dispoCardSub}>Book sit-down</Text>
                  </TouchableOpacity>

                  {/* 💬 Spoke / Connected */}
                  <TouchableOpacity
                    style={[styles.dispoCard, styles.cardConnected]}
                    onPress={() => executeDisposition('connected')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dispoEmoji}>💬</Text>
                    <Text style={styles.dispoCardTitle}>Connected</Text>
                    <Text style={styles.dispoCardSub}>Spoke on call</Text>
                  </TouchableOpacity>

                  {/* 📅 Callback Requested */}
                  <TouchableOpacity
                    style={[styles.dispoCard, styles.cardCallback]}
                    onPress={() => setIsCallbackModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dispoEmoji}>📅</Text>
                    <Text style={styles.dispoCardTitle}>Callback</Text>
                    <Text style={styles.dispoCardSub}>Schedule time</Text>
                  </TouchableOpacity>

                  {/* 📼 Left Voicemail */}
                  <TouchableOpacity
                    style={[styles.dispoCard, styles.cardVm]}
                    onPress={() => executeDisposition('voicemail')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dispoEmoji}>📼</Text>
                    <Text style={styles.dispoCardTitle}>Left VM</Text>
                    <Text style={styles.dispoCardSub}>Drop voicemail</Text>
                  </TouchableOpacity>

                  {/* 📞 No Answer */}
                  <TouchableOpacity
                    style={[styles.dispoCard, styles.cardNoAnswer]}
                    onPress={() => executeDisposition('no_answer')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dispoEmoji}>📞</Text>
                    <Text style={styles.dispoCardTitle}>No Answer</Text>
                    <Text style={styles.dispoCardSub}>Log unanswered</Text>
                  </TouchableOpacity>

                  {/* 📋 Other with Custom Notes */}
                  <TouchableOpacity
                    style={[styles.dispoCard, styles.cardOther]}
                    onPress={() => setIsOtherView(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dispoEmoji}>📋</Text>
                    <Text style={styles.dispoCardTitle}>Other...</Text>
                    <Text style={styles.dispoCardSub}>Write custom note</Text>
                  </TouchableOpacity>
                </View>

                {/* Secondary Edge Cases (DNC / Bad Number) */}
                <View style={styles.secondaryActionsRow}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={handleConfirmDNC}
                    activeOpacity={0.7}
                  >
                    <ShieldAlert size={14} color={Colors.badgeDangerText} />
                    <Text style={styles.secondaryBtnTextDanger}>Do Not Call (DNC)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => executeDisposition('bad_number')}
                    activeOpacity={0.7}
                  >
                    <AlertTriangle size={14} color={Colors.badgeWarningText} />
                    <Text style={styles.secondaryBtnTextWarning}>Bad / Disconnected #</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Chained Appointment Scheduler Modal */}
      <AppointmentSchedulerModal
        visible={isApptModalVisible}
        lead={lead}
        onClose={() => setIsApptModalVisible(false)}
        onSave={handleSaveAppointment}
      />

      {/* Chained Callback Scheduler Modal */}
      <CallbackSchedulerModal
        visible={isCallbackModalVisible}
        lead={lead}
        onClose={() => setIsCallbackModalVisible(false)}
        onSave={handleSaveCallback}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  callBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  liveCallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveCallBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  idleCallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  idleCallBadgeText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  leadName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  leadDetails: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  callControlStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  callControlText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
    minWidth: 160,
    marginRight: 8,
  },
  hangupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  hangupPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dispoGridContainer: {
    marginTop: 14,
    maxHeight: 440,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  primaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dispoCard: {
    width: '47%',
    flexGrow: 1,
    minWidth: 110,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardAppt: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  cardConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  cardCallback: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  cardVm: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  cardNoAnswer: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  cardOther: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: 'rgba(139, 92, 246, 0.35)',
  },
  dispoEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  dispoCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dispoCardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  secondaryBtnTextDanger: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.badgeDangerText,
  },
  secondaryBtnTextWarning: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.badgeWarningText,
  },
  otherContainer: {
    marginTop: 14,
    maxHeight: 460,
  },
  otherHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  backLink: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandAccent,
  },
  otherSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  chipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderColor: '#8B5CF6',
  },
  chipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#8B5CF6',
    fontWeight: '700',
  },
  textArea: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 8,
    padding: 12,
    color: Colors.textPrimary,
    fontSize: 16,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  otherActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  cancelOtherBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cancelOtherBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  saveOtherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveOtherBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  savingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  savingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
