import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import {
  Calendar as CalendarIcon,
  Clock,
  X,
  Check,
  School,
  RotateCcw,
} from 'lucide-react-native';
import { Lead } from '../types';
import { Colors } from '../theme/colors';
import { getScheduleForSchool, matchPeriodId, BellPeriod } from '../data/bellSchedules';
import { HapticsService } from '../services/hapticsService';

export interface CallbackSchedulerModalProps {
  visible: boolean;
  lead: Lead | null;
  initialDate?: Date | null;
  initialNote?: string;
  onClose: () => void;
  onSave: (payload: { followUpDateISO: string; note: string }) => Promise<void>;
  onClear?: () => Promise<void>;
}

export function CallbackSchedulerModal({
  visible,
  lead,
  initialDate,
  initialNote = '',
  onClose,
  onSave,
  onClear,
}: CallbackSchedulerModalProps) {
  if (!lead) return null;

  // School bell schedule resolution
  const schoolSchedule = useMemo(() => getScheduleForSchool(lead.school), [lead.school]);
  const educatorPeriodId = useMemo(() => matchPeriodId(lead.planning_period), [lead.planning_period]);
  const matchedPeriod = useMemo(
    () => (educatorPeriodId ? schoolSchedule.find((p) => p.id === educatorPeriodId) : null),
    [schoolSchedule, educatorPeriodId]
  );

  // Form State
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDate && !isNaN(new Date(initialDate).getTime())) {
      return new Date(initialDate);
    }
    return new Date(Date.now() + 2 * 3600 * 1000);
  });
  const [activePreset, setActivePreset] = useState<string | null>('2h');
  const [selectedPeriod, setSelectedPeriod] = useState<BellPeriod | null>(() => matchedPeriod || null);
  const [note, setNote] = useState<string>(initialNote);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Synchronize when opened
  useEffect(() => {
    if (visible) {
      if (initialDate && !isNaN(new Date(initialDate).getTime())) {
        setSelectedDate(new Date(initialDate));
        setActivePreset(null);
      } else {
        const d = new Date(Date.now() + 2 * 3600 * 1000);
        setSelectedDate(d);
        setActivePreset('2h');
      }
      setNote(initialNote || '');
      setIsSaving(false);
    }
  }, [visible, initialDate, initialNote]);

  // Preset Handlers
  const applyPreset = (presetKey: string) => {
    HapticsService.tick().catch(() => {});
    setActivePreset(presetKey);
    const now = new Date();

    if (presetKey === '2h') {
      const d = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setSelectedDate(d);
      setSelectedPeriod(null);
    } else if (presetKey === 'tomorrow_10am') {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      setSelectedDate(d);
      setSelectedPeriod(null);
    } else if (presetKey === 'in_2_days') {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      setSelectedDate(d);
      setSelectedPeriod(null);
    } else if (presetKey === 'next_week') {
      const d = new Date(now);
      const daysUntilNextMon = ((1 + 7 - d.getDay()) % 7) || 7;
      d.setDate(d.getDate() + daysUntilNextMon);
      d.setHours(10, 0, 0, 0);
      setSelectedDate(d);
      setSelectedPeriod(null);
    } else if (presetKey === 'planning') {
      const [sH, sM] = (matchedPeriod?.startTime || '10:00').split(':').map(Number);
      const todaySlot = new Date(now);
      todaySlot.setHours(sH, sM, 0, 0);

      const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
      if (isWeekday && todaySlot.getTime() > now.getTime()) {
        setSelectedDate(todaySlot);
      } else {
        const nextDay = new Date(now);
        nextDay.setDate(nextDay.getDate() + 1);
        while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
          nextDay.setDate(nextDay.getDate() + 1);
        }
        nextDay.setHours(sH, sM, 0, 0);
        setSelectedDate(nextDay);
      }
      setSelectedPeriod(matchedPeriod || null);
    }
  };

  const handleSelectPeriod = (period: BellPeriod) => {
    HapticsService.tick().catch(() => {});
    setSelectedPeriod(period);
    setActivePreset(null);

    const [sH, sM] = period.startTime.split(':').map(Number);
    const updated = new Date(selectedDate);
    updated.setHours(sH, sM, 0, 0);
    setSelectedDate(updated);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await HapticsService.success();
      const validDate =
        selectedDate && !isNaN(selectedDate.getTime())
          ? selectedDate
          : new Date(Date.now() + 2 * 3600 * 1000);
      const periodLabel = selectedPeriod ? ` (${selectedPeriod.name})` : '';
      const fullNote = note.trim()
        ? `${note.trim()}${periodLabel}`
        : `Scheduled callback${periodLabel}`;
      await onSave({
        followUpDateISO: validDate.toISOString(),
        note: fullNote,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CalendarIcon size={18} color={Colors.badgeWarningText} />
                <Text style={styles.modalTitle}>Schedule Callback</Text>
              </View>
              <Text style={styles.modalSubtitle}>
                {lead.name} • {lead.school || 'VOL'}{lead.planning_period ? ` (${lead.planning_period})` : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>QUICK TIMING PRESETS</Text>
            <View style={styles.presetsGrid}>
              <TouchableOpacity
                style={[styles.presetChip, activePreset === '2h' && styles.presetChipActive]}
                onPress={() => applyPreset('2h')}
              >
                <Text style={[styles.presetChipText, activePreset === '2h' && styles.presetChipTextActive]}>
                  ⏱️ In 2 Hours
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.presetChip, activePreset === 'tomorrow_10am' && styles.presetChipActive]}
                onPress={() => applyPreset('tomorrow_10am')}
              >
                <Text style={[styles.presetChipText, activePreset === 'tomorrow_10am' && styles.presetChipTextActive]}>
                  🌅 Tomorrow 10 AM
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.presetChip, activePreset === 'in_2_days' && styles.presetChipActive]}
                onPress={() => applyPreset('in_2_days')}
              >
                <Text style={[styles.presetChipText, activePreset === 'in_2_days' && styles.presetChipTextActive]}>
                  📅 In 2 Days
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.presetChip, activePreset === 'next_week' && styles.presetChipActive]}
                onPress={() => applyPreset('next_week')}
              >
                <Text style={[styles.presetChipText, activePreset === 'next_week' && styles.presetChipTextActive]}>
                  📆 Next Week
                </Text>
              </TouchableOpacity>

              {matchedPeriod && (
                <TouchableOpacity
                  style={[
                    styles.presetChipPlanning,
                    activePreset === 'planning' && styles.presetChipPlanningActive,
                  ]}
                  onPress={() => applyPreset('planning')}
                >
                  <School size={13} color={activePreset === 'planning' ? '#FFFFFF' : Colors.heavenlyGold} />
                  <Text style={[styles.presetChipPlanningText, activePreset === 'planning' && { color: '#FFFFFF' }]}>
                    🏫 Next {matchedPeriod.name} ({matchedPeriod.displayTime.split('–')[0].trim()})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>
              TARGET BELL PERIOD ({lead.school || 'Volusia High'})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
              <View style={styles.periodRow}>
                {schoolSchedule.map((p) => {
                  const isEducatorPlanning = p.id === educatorPeriodId;
                  const isSelected = selectedPeriod?.id === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.periodChip,
                        isEducatorPlanning && styles.periodChipPlanningHighlight,
                        isSelected && styles.periodChipSelected,
                      ]}
                      onPress={() => handleSelectPeriod(p)}
                    >
                      <Text style={[styles.periodChipTitle, isSelected && styles.periodChipTitleSelected]}>
                        {p.name} {isEducatorPlanning ? '★' : ''}
                      </Text>
                      <Text style={[styles.periodChipTime, isSelected && styles.periodChipTimeSelected]}>
                        {p.displayTime.split('–')[0].trim()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.targetPreviewCard}>
              <Clock size={16} color={Colors.badgeWarningText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.targetPreviewLabel}>CONFIRMED CALLBACK TARGET</Text>
                <Text style={styles.targetPreviewValue}>
                  {selectedDate && !isNaN(selectedDate.getTime())
                    ? `${selectedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} @ ${selectedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    : 'Select callback time'}
                  {selectedPeriod ? ` • ${selectedPeriod.name}` : ''}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>REMINDER NOTE (OPTIONAL)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. Callback during 4th period planning to discuss DROP bonus..."
              placeholderTextColor={Colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
            />

            <View style={styles.noteSnippetRow}>
              <TouchableOpacity
                style={styles.snippetChip}
                onPress={() => setNote('Call during planning period')}
              >
                <Text style={styles.snippetChipText}>+ Call in planning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.snippetChip}
                onPress={() => setNote('Discuss DROP & 5% bonus')}
              >
                <Text style={styles.snippetChipText}>+ DROP & 5% bonus</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.snippetChip}
                onPress={() => setNote('Follow up on voicemail')}
              >
                <Text style={styles.snippetChipText}>+ Follow up on VM</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.modalButtonsRow}>
            {onClear && (
              <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
                <RotateCcw size={14} color={Colors.badgeDangerText} />
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Confirm Callback</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.bgModal,
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    padding: 18,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  presetChipActive: {
    backgroundColor: Colors.badgeWarningBg,
    borderColor: Colors.badgeWarningText,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  presetChipTextActive: {
    color: Colors.badgeWarningText,
    fontWeight: '800',
  },
  presetChipPlanning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 160, 23, 0.10)',
    borderWidth: 1,
    borderColor: Colors.borderGold,
  },
  presetChipPlanningActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.heavenlyGold,
  },
  presetChipPlanningText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.heavenlyGold,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
  },
  periodChipPlanningHighlight: {
    borderColor: Colors.brandAccent,
    backgroundColor: 'rgba(2, 132, 199, 0.08)',
  },
  periodChipSelected: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  periodChipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  periodChipTitleSelected: {
    color: '#FFFFFF',
  },
  periodChipTime: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  periodChipTimeSelected: {
    color: '#94A3B8',
  },
  targetPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.badgeWarningBg,
    borderWidth: 1,
    borderColor: Colors.badgeWarningText,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  targetPreviewLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.badgeWarningText,
    letterSpacing: 0.6,
  },
  targetPreviewValue: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 1,
  },
  noteInput: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: Colors.textPrimary,
    minHeight: 65,
    textAlignVertical: 'top',
  },
  noteSnippetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  snippetChip: {
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  snippetChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    paddingTop: 12,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
