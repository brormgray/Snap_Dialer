import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import {
  Calendar,
  Clock,
  Award,
  MessageSquare,
  RotateCcw,
  UserX,
  X,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  Sparkles,
} from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';
import { CalendarService } from '../services/calendarService';
import { Lead, AppointmentOutcome } from '../types';

interface PostApptWrapUpCardProps {
  lead: Lead;
  onConverted: () => Promise<void>;
  onNurtureDrip: () => Promise<void>;
  onReschedule: (newDateISO: string, newPeriod?: string) => Promise<void>;
  onNoShowOrDeclined: (outcome: 'no_show' | 'declined') => Promise<void>;
}

export function PostApptWrapUpCard({
  lead,
  onConverted,
  onNurtureDrip,
  onReschedule,
  onNoShowOrDeclined,
}: PostApptWrapUpCardProps) {
  const [isEditingOutcome, setIsEditingOutcome] = useState<boolean>(false);
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState<boolean>(false);
  const [noShowModalVisible, setNoShowModalVisible] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Custom reschedule state
  const [customDaysToAdd, setCustomDaysToAdd] = useState<number>(2);

  // If lead never had an appointment booked and no outcome exists, do not render
  const isApptLead =
    lead.last_disposition === 'appointment_set' ||
    Boolean(lead.appointment_scheduled_at) ||
    Boolean(lead.appointment_outcome);

  if (!isApptLead) return null;

  // Resolve scheduled date
  const scheduledDate = useMemo(() => {
    if (lead.appointment_scheduled_at) {
      const parsed = new Date(lead.appointment_scheduled_at);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return CalendarService.calculateNextPlanningDate(lead.planning_period, lead.school);
  }, [lead.appointment_scheduled_at, lead.planning_period, lead.school]);

  const dateStr = scheduledDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = scheduledDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const hasCompletedOutcome = Boolean(lead.appointment_outcome) && !isEditingOutcome;

  // Render Completed Outcome Card
  if (hasCompletedOutcome) {
    const outcome = lead.appointment_outcome;
    let label = 'Completed';
    let icon = <CheckCircle2 size={16} color="#10B981" />;
    let badgeBg = 'rgba(16, 185, 129, 0.15)';
    let badgeBorder = '#10B981';
    let textColor = '#10B981';

    if (outcome === 'converted') {
      label = '★ Converted to Client';
      icon = <Award size={16} color="#10B981" />;
      badgeBg = 'rgba(16, 185, 129, 0.15)';
      badgeBorder = '#10B981';
      textColor = '#10B981';
    } else if (outcome === 'nurture_drip') {
      label = '💬 Enrolled in Prospect Nurture Drip';
      icon = <MessageSquare size={16} color="#0284C7" />;
      badgeBg = 'rgba(2, 132, 199, 0.15)';
      badgeBorder = '#0284C7';
      textColor = '#0284C7';
    } else if (outcome === 'rescheduled') {
      label = '📅 Sit-Down Rescheduled';
      icon = <RotateCcw size={16} color={Colors.heavenlyGold} />;
      badgeBg = 'rgba(212, 160, 23, 0.15)';
      badgeBorder = Colors.heavenlyGold;
      textColor = Colors.heavenlyGold;
    } else if (outcome === 'no_show') {
      label = '🚫 Educator No-Show (Unavailable)';
      icon = <UserX size={16} color="#F59E0B" />;
      badgeBg = 'rgba(245, 158, 11, 0.15)';
      badgeBorder = '#F59E0B';
      textColor = '#F59E0B';
    } else if (outcome === 'declined') {
      label = '🚫 Educator Declined Options';
      icon = <X size={16} color="#EF4444" />;
      badgeBg = 'rgba(239, 68, 68, 0.15)';
      badgeBorder = '#EF4444';
      textColor = '#EF4444';
    }

    const completedDateFormatted = lead.appointment_completed_at
      ? new Date(lead.appointment_completed_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'Recently';

    return (
      <View style={styles.completedCard}>
        <View style={styles.completedHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={16} color="#10B981" />
            <Text style={styles.completedCardTitle}>SIT-DOWN OUTCOME RECORDED</Text>
          </View>
          <TouchableOpacity
            style={styles.editOutcomeBtn}
            onPress={() => {
              HapticsService.tick();
              setIsEditingOutcome(true);
            }}
          >
            <Text style={styles.editOutcomeBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.outcomeBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
          {icon}
          <Text style={[styles.outcomeBadgeText, { color: textColor }]}>{label}</Text>
        </View>

        <Text style={styles.completedMetaText}>
          Recorded {completedDateFormatted} • Originally scheduled for {dateStr} @ {timeStr}
        </Text>
      </View>
    );
  }

  // Active Sit-Down Wrap-Up Card
  return (
    <View style={styles.cardContainer}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.iconCircle}>
            <Calendar size={18} color={Colors.heavenlyGold} />
          </View>
          <View>
            <Text style={styles.cardTitle}>POST-APPOINTMENT SIT-DOWN WRAP-UP</Text>
            <Text style={styles.cardSubtitle}>
              Scheduled: <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>{dateStr} @ {timeStr}</Text>
              {lead.planning_period ? ` (${lead.planning_period})` : ''}
              {lead.room_number ? ` • Rm ${lead.room_number}` : ''}
            </Text>
          </View>
        </View>

        {isEditingOutcome && (
          <TouchableOpacity
            style={styles.closeEditBtn}
            onPress={() => setIsEditingOutcome(false)}
          >
            <X size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.promptText}>
        Record the definitive sit-down outcome to keep your pipeline and dashboard clean:
      </Text>

      {/* 4 Action Buttons Grid */}
      <View style={styles.actionsGrid}>
        {/* 1. Converted to Client */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnClient]}
          onPress={async () => {
            if (isSubmitting) return;
            setIsSubmitting(true);
            try {
              await onConverted();
              setIsEditingOutcome(false);
            } finally {
              setIsSubmitting(false);
            }
          }}
          activeOpacity={0.8}
          disabled={isSubmitting}
        >
          <Award size={18} color="#10B981" />
          <View style={{ flex: 1 }}>
            <Text style={styles.actionBtnClientTitle}>★ Converted to Client</Text>
            <Text style={styles.actionBtnClientSub}>Enrolls in client ledger & annual review</Text>
          </View>
        </TouchableOpacity>

        {/* 2. Moved to Prospect Drip */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnDrip]}
          onPress={async () => {
            if (isSubmitting) return;
            setIsSubmitting(true);
            try {
              await onNurtureDrip();
              setIsEditingOutcome(false);
            } finally {
              setIsSubmitting(false);
            }
          }}
          activeOpacity={0.8}
          disabled={isSubmitting}
        >
          <MessageSquare size={18} color="#0284C7" />
          <View style={{ flex: 1 }}>
            <Text style={styles.actionBtnDripTitle}>💬 Moved to Prospect Drip</Text>
            <Text style={styles.actionBtnDripSub}>Track A: Day 7 Multiplier educational text</Text>
          </View>
        </TouchableOpacity>

        {/* 3. Reschedule Sit-Down */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnReschedule]}
          onPress={() => {
            HapticsService.tick();
            setRescheduleModalVisible(true);
          }}
          activeOpacity={0.8}
          disabled={isSubmitting}
        >
          <RotateCcw size={18} color={Colors.heavenlyGold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.actionBtnRescheduleTitle}>📅 Reschedule Sit-Down</Text>
            <Text style={styles.actionBtnRescheduleSub}>Postpone to new date/time & sync calendar</Text>
          </View>
        </TouchableOpacity>

        {/* 4. No-Show / Declined */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnNoShow]}
          onPress={() => {
            HapticsService.tick();
            setNoShowModalVisible(true);
          }}
          activeOpacity={0.8}
          disabled={isSubmitting}
        >
          <UserX size={18} color="#94A3B8" />
          <View style={{ flex: 1 }}>
            <Text style={styles.actionBtnNoShowTitle}>🚫 No-Show / Declined</Text>
            <Text style={styles.actionBtnNoShowSub}>Educator was absent or decided not to proceed</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Reschedule Preset Modal */}
      <Modal visible={rescheduleModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSurface}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <RotateCcw size={18} color={Colors.heavenlyGold} />
                <Text style={styles.modalTitle}>Reschedule Sit-Down</Text>
              </View>
              <TouchableOpacity onPress={() => setRescheduleModalVisible(false)} style={{ padding: 4 }}>
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select the new target date for {lead.name}:
            </Text>

            {/* Presets */}
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                const nextPlanning = CalendarService.calculateNextPlanningDate(
                  lead.planning_period,
                  lead.school
                );
                onReschedule(nextPlanning.toISOString(), lead.planning_period || undefined);
                setRescheduleModalVisible(false);
              }}
            >
              <View style={styles.modalOptionLeft}>
                <Clock size={16} color={Colors.heavenlyGold} />
                <View>
                  <Text style={styles.modalOptionTitle}>Next Planning Period</Text>
                  <Text style={styles.modalOptionDesc}>Automatic bell schedule alignment</Text>
                </View>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                const d = new Date();
                d.setDate(d.getDate() + 2);
                d.setHours(13, 0, 0, 0);
                onReschedule(d.toISOString());
                setRescheduleModalVisible(false);
              }}
            >
              <View style={styles.modalOptionLeft}>
                <Calendar size={16} color="#38BDF8" />
                <View>
                  <Text style={styles.modalOptionTitle}>+2 Days (Afternoon)</Text>
                  <Text style={styles.modalOptionDesc}>48-hour follow-up buffer</Text>
                </View>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                d.setHours(13, 0, 0, 0);
                onReschedule(d.toISOString());
                setRescheduleModalVisible(false);
              }}
            >
              <View style={styles.modalOptionLeft}>
                <Calendar size={16} color="#10B981" />
                <View>
                  <Text style={styles.modalOptionTitle}>+1 Week (Same Time)</Text>
                  <Text style={styles.modalOptionDesc}>Next week's school visit</Text>
                </View>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setRescheduleModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* No-Show / Declined Modal */}
      <Modal visible={noShowModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSurface}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={18} color="#F59E0B" />
                <Text style={styles.modalTitle}>Sit-Down Conclusion</Text>
              </View>
              <TouchableOpacity onPress={() => setNoShowModalVisible(false)} style={{ padding: 4 }}>
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Specify why the sit-down did not result in a client conversion:
            </Text>

            <TouchableOpacity
              style={[styles.modalOption, { borderColor: '#F59E0B' }]}
              onPress={() => {
                onNoShowOrDeclined('no_show');
                setNoShowModalVisible(false);
              }}
            >
              <View style={styles.modalOptionLeft}>
                <UserX size={16} color="#F59E0B" />
                <View>
                  <Text style={[styles.modalOptionTitle, { color: '#B45309' }]}>
                    Educator was No-Show / Unavailable
                  </Text>
                  <Text style={styles.modalOptionDesc}>
                    Preserves appointment booking record; recycles for future outreach
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalOption, { borderColor: '#EF4444' }]}
              onPress={() => {
                onNoShowOrDeclined('declined');
                setNoShowModalVisible(false);
              }}
            >
              <View style={styles.modalOptionLeft}>
                <X size={16} color="#EF4444" />
                <View>
                  <Text style={[styles.modalOptionTitle, { color: '#DC2626' }]}>
                    Educator Declined / Not Interested
                  </Text>
                  <Text style={styles.modalOptionDesc}>
                    Logs conversation outcome and marks as spoken
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setNoShowModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1.5,
    borderColor: '#0284C7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0B3B60',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeEditBtn: {
    padding: 4,
  },
  promptText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 12,
  },
  actionsGrid: {
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1.5,
  },
  actionBtnClient: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: '#10B981',
  },
  actionBtnClientTitle: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '800',
  },
  actionBtnClientSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  actionBtnDrip: {
    backgroundColor: 'rgba(2, 132, 199, 0.08)',
    borderColor: '#0284C7',
  },
  actionBtnDripTitle: {
    color: '#0284C7',
    fontSize: 14,
    fontWeight: '800',
  },
  actionBtnDripSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  actionBtnReschedule: {
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
    borderColor: Colors.heavenlyGold,
  },
  actionBtnRescheduleTitle: {
    color: Colors.heavenlyGoldDark,
    fontSize: 14,
    fontWeight: '800',
  },
  actionBtnRescheduleSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  actionBtnNoShow: {
    backgroundColor: Colors.surfaceSubtle,
    borderColor: Colors.borderStrong,
  },
  actionBtnNoShowTitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  actionBtnNoShowSub: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  completedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginVertical: 10,
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  completedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  completedCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  editOutcomeBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  editOutcomeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  outcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    marginBottom: 6,
  },
  outcomeBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  completedMetaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.bgModal,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalSurface: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSubtle,
    marginBottom: 8,
  },
  modalOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalOptionDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
});
