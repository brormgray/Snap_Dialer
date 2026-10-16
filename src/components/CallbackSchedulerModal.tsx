import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import {
  Calendar as CalendarIcon,
  Clock,
  X,
  Check,
  School,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
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

export function CallbackSchedulerModal(props: CallbackSchedulerModalProps) {
  if (!props.visible || !props.lead) return null;
  return <CallbackSchedulerModalContent {...props} lead={props.lead} />;
}

function CallbackSchedulerModalContent({
  visible,
  lead,
  initialDate,
  initialNote = '',
  onClose,
  onSave,
  onClear,
}: CallbackSchedulerModalProps & { lead: Lead }) {
  // School bell schedule resolution
  const schoolSchedule = useMemo(() => getScheduleForSchool(lead.school), [lead.school]);
  const educatorPeriodId = useMemo(() => matchPeriodId(lead.planning_period), [lead.planning_period]);
  const matchedPeriod = useMemo(
    () => (educatorPeriodId ? schoolSchedule.find((p) => p.id === educatorPeriodId) : null),
    [schoolSchedule, educatorPeriodId]
  );

  // 14-Day Upcoming Day Strip
  const availableDays = useMemo(() => {
    const days: { date: Date; label: string; dateKey: string; isToday: boolean; isTomorrow: boolean; isWeekend: boolean }[] = [];
    const ref = new Date();
    let current = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

    for (let i = 0; i < 14; i++) {
      const dow = current.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isToday = i === 0;
      const isTomorrow = i === 1;
      const weekdayName = current.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      let label = `${weekdayName}, ${monthDay}`;
      if (isToday) label = 'Today';
      else if (isTomorrow) label = 'Tomorrow';

      days.push({
        date: new Date(current),
        label,
        dateKey: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`,
        isToday,
        isTomorrow,
        isWeekend,
      });

      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    }
    return days;
  }, []);

  // Form State
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDate && !isNaN(new Date(initialDate).getTime())) {
      return new Date(initialDate);
    }
    return new Date(Date.now() + 2 * 3600 * 1000);
  });
  const [activePreset, setActivePreset] = useState<string | null>('2h');
  const [selectedPeriod, setSelectedPeriod] = useState<BellPeriod | null>(null);
  const [note, setNote] = useState<string>(initialNote);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Custom Date & Time State
  const [isCustomOpen, setIsCustomOpen] = useState<boolean>(false);
  const [showFullMonthGrid, setShowFullMonthGrid] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => {
    const d = initialDate && !isNaN(new Date(initialDate).getTime()) ? new Date(initialDate) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [customHour, setCustomHour] = useState<number>(() => {
    const d = initialDate && !isNaN(new Date(initialDate).getTime()) ? new Date(initialDate) : new Date(Date.now() + 2 * 3600 * 1000);
    const h = d.getHours();
    return h % 12 === 0 ? 12 : h % 12;
  });
  const [customMinute, setCustomMinute] = useState<number>(() => {
    const d = initialDate && !isNaN(new Date(initialDate).getTime()) ? new Date(initialDate) : new Date(Date.now() + 2 * 3600 * 1000);
    return d.getMinutes();
  });
  const [customAmPm, setCustomAmPm] = useState<'AM' | 'PM'>(() => {
    const d = initialDate && !isNaN(new Date(initialDate).getTime()) ? new Date(initialDate) : new Date(Date.now() + 2 * 3600 * 1000);
    return d.getHours() >= 12 ? 'PM' : 'AM';
  });

  // Helper to sync custom variables from a Date
  const syncCustomStateFromDate = (d: Date) => {
    const h = d.getHours();
    const m = d.getMinutes();
    setCustomHour(h % 12 === 0 ? 12 : h % 12);
    setCustomMinute(m);
    setCustomAmPm(h >= 12 ? 'PM' : 'AM');
    const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setSelectedDayKey(dKey);
    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  // Full Month Calendar Matrix Generation
  const monthCalendarMatrix = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const matrix: ({ dayNumber: number; dateKey: string; isPast: boolean; isWeekend: boolean } | null)[] = [];

    for (let i = 0; i < firstDayIndex; i++) {
      matrix.push(null);
    }

    const nowLocal = new Date();
    const todayStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDate = new Date(year, month, day);
      const dow = dayDate.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isPast = dateKey < todayStr;

      matrix.push({
        dayNumber: day,
        dateKey,
        isPast,
        isWeekend,
      });
    }

    return matrix;
  }, [calendarMonth]);

  // Synchronize when opened
  useEffect(() => {
    if (visible) {
      setSelectedPeriod(null);
      if (initialDate && !isNaN(new Date(initialDate).getTime())) {
        const d = new Date(initialDate);
        setSelectedDate(d);
        syncCustomStateFromDate(d);
        setActivePreset('custom');
        setIsCustomOpen(true);
      } else {
        const d = new Date(Date.now() + 2 * 3600 * 1000);
        setSelectedDate(d);
        syncCustomStateFromDate(d);
        setActivePreset('2h');
        setIsCustomOpen(false);
      }
      setNote(initialNote || '');
      setIsSaving(false);
      setShowFullMonthGrid(false);
    }
  }, [visible, lead.id, initialDate, initialNote]);

  // Preset Handlers
  const applyPreset = (presetKey: string) => {
    HapticsService.tick().catch(() => {});
    setActivePreset(presetKey);
    const now = new Date();

    if (presetKey === 'custom') {
      setIsCustomOpen(true);
      setSelectedPeriod(null);
      return;
    }

    setIsCustomOpen(false);

    if (presetKey === '2h') {
      const d = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setSelectedDate(d);
      syncCustomStateFromDate(d);
      setSelectedPeriod(null);
    } else if (presetKey === 'tomorrow_10am') {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      setSelectedDate(d);
      syncCustomStateFromDate(d);
      setSelectedPeriod(null);
    } else if (presetKey === 'in_2_days') {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      setSelectedDate(d);
      syncCustomStateFromDate(d);
      setSelectedPeriod(null);
    } else if (presetKey === 'next_week') {
      const d = new Date(now);
      const daysUntilNextMon = ((1 + 7 - d.getDay()) % 7) || 7;
      d.setDate(d.getDate() + daysUntilNextMon);
      d.setHours(10, 0, 0, 0);
      setSelectedDate(d);
      syncCustomStateFromDate(d);
      setSelectedPeriod(null);
    } else if (presetKey === 'planning') {
      const [sH, sM] = (matchedPeriod?.startTime || '10:00').split(':').map(Number);
      const todaySlot = new Date(now);
      todaySlot.setHours(sH, sM, 0, 0);

      const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
      let targetDate: Date;
      if (isWeekday && todaySlot.getTime() > now.getTime()) {
        targetDate = todaySlot;
      } else {
        const nextDay = new Date(now);
        nextDay.setDate(nextDay.getDate() + 1);
        while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
          nextDay.setDate(nextDay.getDate() + 1);
        }
        nextDay.setHours(sH, sM, 0, 0);
        targetDate = nextDay;
      }
      setSelectedDate(targetDate);
      syncCustomStateFromDate(targetDate);
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
    syncCustomStateFromDate(updated);
  };

  // Custom Day and Time Selectors
  const handleSelectCustomDay = (dateKey: string) => {
    HapticsService.tick().catch(() => {});
    setSelectedDayKey(dateKey);
    setActivePreset('custom');
    setIsCustomOpen(true);
    setSelectedPeriod(null);

    const [y, mo, d] = dateKey.split('-').map(Number);
    let h = customHour;
    if (customAmPm === 'PM' && h < 12) h += 12;
    if (customAmPm === 'AM' && h === 12) h = 0;
    setSelectedDate(new Date(y, mo - 1, d, h, customMinute, 0, 0));
  };

  const handleSelectHour = (h: number) => {
    HapticsService.tick().catch(() => {});
    setCustomHour(h);
    setActivePreset('custom');
    setIsCustomOpen(true);
    setSelectedPeriod(null);

    let finalH = h;
    if (customAmPm === 'PM' && finalH < 12) finalH += 12;
    if (customAmPm === 'AM' && finalH === 12) finalH = 0;
    const updated = new Date(selectedDate);
    updated.setHours(finalH, customMinute, 0, 0);
    setSelectedDate(updated);
  };

  const handleSelectMinute = (m: number) => {
    HapticsService.tick().catch(() => {});
    setCustomMinute(m);
    setActivePreset('custom');
    setIsCustomOpen(true);
    setSelectedPeriod(null);

    const updated = new Date(selectedDate);
    updated.setMinutes(m, 0, 0);
    setSelectedDate(updated);
  };

  const handleToggleAmPm = (amPm: 'AM' | 'PM') => {
    HapticsService.tick().catch(() => {});
    setCustomAmPm(amPm);
    setActivePreset('custom');
    setIsCustomOpen(true);
    setSelectedPeriod(null);

    let finalH = customHour;
    if (amPm === 'PM' && finalH < 12) finalH += 12;
    if (amPm === 'AM' && finalH === 12) finalH = 0;
    const updated = new Date(selectedDate);
    updated.setHours(finalH, customMinute, 0, 0);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => {
            HapticsService.tick().catch(() => {});
            onClose();
          }}
        />
        <View style={styles.modalContent} pointerEvents="auto">
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

          <ScrollView style={{ maxHeight: 520, flexShrink: 1 }} showsVerticalScrollIndicator={false}>
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

              {/* Custom Date & Time Preset Chip */}
              <TouchableOpacity
                style={[styles.presetChip, activePreset === 'custom' && styles.presetChipActive]}
                onPress={() => applyPreset('custom')}
              >
                <Text style={[styles.presetChipText, activePreset === 'custom' && styles.presetChipTextActive]}>
                  🗓️ Custom Date & Time
                </Text>
              </TouchableOpacity>
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

            {/* Custom Date & Time Picker Section */}
            <View style={styles.customSectionHeader}>
              <Text style={styles.sectionLabel}>CUSTOM DATE & TIME PICKER</Text>
              <TouchableOpacity
                style={styles.customToggleBtn}
                onPress={() => {
                  HapticsService.tick().catch(() => {});
                  setIsCustomOpen((prev) => {
                    const next = !prev;
                    if (next && activePreset !== 'custom') {
                      setActivePreset('custom');
                      setSelectedPeriod(null);
                    }
                    return next;
                  });
                }}
              >
                <Text style={styles.customToggleBtnText}>
                  {isCustomOpen || activePreset === 'custom' ? 'Collapse' : 'Custom Time'}
                </Text>
                {isCustomOpen || activePreset === 'custom' ? (
                  <ChevronUp size={14} color={Colors.brandAccent} />
                ) : (
                  <ChevronDown size={14} color={Colors.brandAccent} />
                )}
              </TouchableOpacity>
            </View>

            {(isCustomOpen || activePreset === 'custom') && (
              <View style={styles.customContainer}>
                {/* 1. Date Selection */}
                <View style={styles.customSubHeader}>
                  <Text style={styles.customSubLabel}>1. CHOOSE DATE</Text>
                  <TouchableOpacity
                    style={styles.toggleCalendarBtn}
                    onPress={() => {
                      HapticsService.tick().catch(() => {});
                      setShowFullMonthGrid((prev) => !prev);
                    }}
                  >
                    <Text style={styles.toggleCalendarText}>
                      {showFullMonthGrid ? 'Quick Upcoming Days' : 'Full Month Calendar'}
                    </Text>
                    {showFullMonthGrid ? (
                      <ChevronUp size={13} color={Colors.brandAccent} />
                    ) : (
                      <ChevronDown size={13} color={Colors.brandAccent} />
                    )}
                  </TouchableOpacity>
                </View>

                {!showFullMonthGrid ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                    {availableDays.map((d) => {
                      const isSelected = selectedDayKey === d.dateKey;
                      return (
                        <TouchableOpacity
                          key={d.dateKey}
                          style={[styles.dayPill, isSelected && styles.dayPillActive]}
                          onPress={() => handleSelectCustomDay(d.dateKey)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.dayPillLabel, isSelected && styles.dayPillLabelActive]}>
                            {d.label}
                          </Text>
                          <Text style={[styles.dayPillSub, isSelected && styles.dayPillSubActive]}>
                            {d.date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={styles.monthCalendarCard}>
                    <View style={styles.monthNavRow}>
                      <TouchableOpacity
                        onPress={() => {
                          HapticsService.tick().catch(() => {});
                          setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
                        }}
                        style={styles.monthNavBtn}
                      >
                        <ChevronLeft size={16} color={Colors.textPrimary} />
                      </TouchableOpacity>
                      <Text style={styles.monthNavTitle}>
                        {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          HapticsService.tick().catch(() => {});
                          setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
                        }}
                        style={styles.monthNavBtn}
                      >
                        <ChevronRight size={16} color={Colors.textPrimary} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.dowHeaderRow}>
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dow, idx) => (
                        <Text
                          key={idx}
                          style={[styles.dowHeaderText, (idx === 5 || idx === 6) && { color: Colors.textMuted }]}
                        >
                          {dow}
                        </Text>
                      ))}
                    </View>

                    <View style={styles.calendarGrid}>
                      {monthCalendarMatrix.map((item, idx) => {
                        if (!item) {
                          return <View key={`blank_${idx}`} style={styles.gridDayCell} />;
                        }
                        const isSelected = selectedDayKey === item.dateKey;
                        const isDisabled = item.isPast;

                        return (
                          <TouchableOpacity
                            key={item.dateKey}
                            style={[
                              styles.gridDayCell,
                              isSelected && styles.gridDayCellActive,
                              item.isWeekend && styles.gridDayCellWeekend,
                            ]}
                            disabled={isDisabled}
                            onPress={() => handleSelectCustomDay(item.dateKey)}
                          >
                            <Text
                              style={[
                                styles.gridDayText,
                                isDisabled && styles.gridDayTextDisabled,
                                item.isWeekend && styles.gridDayTextWeekend,
                                isSelected && styles.gridDayTextActive,
                              ]}
                            >
                              {item.dayNumber}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* 2. Time Selection */}
                <View style={[styles.customSubHeader, { marginTop: 10 }]}>
                  <Text style={styles.customSubLabel}>2. CHOOSE TIME</Text>
                </View>

                <View style={styles.customTimeBox}>
                  <View style={styles.customTimeRow}>
                    {/* Hours */}
                    <View style={styles.timeStepperCol}>
                      <Text style={styles.timeStepperLabel}>Hour</Text>
                      <View style={styles.hourSelectorRow}>
                        {[7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6].map((h) => (
                          <TouchableOpacity
                            key={h}
                            style={[styles.hourChip, customHour === h && styles.hourChipActive]}
                            onPress={() => handleSelectHour(h)}
                          >
                            <Text style={[styles.hourChipText, customHour === h && styles.hourChipTextActive]}>
                              {h}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Minutes */}
                    <View style={styles.timeStepperColSmall}>
                      <Text style={styles.timeStepperLabel}>Minute</Text>
                      <View style={styles.minuteSelectorRow}>
                        {[0, 10, 15, 20, 30, 40, 45, 50].map((m) => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.minuteChip, customMinute === m && styles.minuteChipActive]}
                            onPress={() => handleSelectMinute(m)}
                          >
                            <Text style={[styles.minuteChipText, customMinute === m && styles.minuteChipTextActive]}>
                              :{String(m).padStart(2, '0')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* AM / PM */}
                    <View style={styles.amPmCol}>
                      <Text style={styles.timeStepperLabel}>AM / PM</Text>
                      <View style={styles.amPmToggleRow}>
                        <TouchableOpacity
                          style={[styles.amPmBtn, customAmPm === 'AM' && styles.amPmBtnActive]}
                          onPress={() => handleToggleAmPm('AM')}
                        >
                          <Text style={[styles.amPmBtnText, customAmPm === 'AM' && styles.amPmBtnTextActive]}>
                            AM
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.amPmBtn, customAmPm === 'PM' && styles.amPmBtnActive]}
                          onPress={() => handleToggleAmPm('PM')}
                        >
                          <Text style={[styles.amPmBtnText, customAmPm === 'PM' && styles.amPmBtnTextActive]}>
                            PM
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.targetPreviewCard}>
              <Clock size={16} color={Colors.badgeWarningText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.targetPreviewLabel}>CONFIRMED CALLBACK TARGET</Text>
                <Text style={styles.targetPreviewValue} numberOfLines={2}>
                  {selectedDate && !isNaN(selectedDate.getTime())
                    ? `${selectedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} @ ${selectedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    : 'Select callback time'}
                  {selectedPeriod ? ` • ${selectedPeriod.name}` : activePreset === 'custom' ? ' • Custom Time' : ''}
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
              <TouchableOpacity
                style={styles.snippetChip}
                onPress={() => setNote('Custom callback time requested')}
              >
                <Text style={styles.snippetChipText}>+ Custom callback</Text>
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
      </KeyboardAvoidingView>
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
    maxHeight: '92%',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
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
  customSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  customToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.10)',
    flexShrink: 0,
  },
  customToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brandAccent,
  },
  customContainer: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 8,
    gap: 8,
  },
  customSubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customSubLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  toggleCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  toggleCalendarText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brandAccent,
  },
  dayStrip: {
    gap: 6,
    paddingVertical: 4,
  },
  dayPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    minWidth: 70,
  },
  dayPillActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  dayPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  dayPillLabelActive: {
    color: '#FFFFFF',
  },
  dayPillSub: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },
  dayPillSubActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  monthCalendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  monthNavBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSubtle,
  },
  monthNavTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dowHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  dowHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    width: 28,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  gridDayCell: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderRadius: 15,
  },
  gridDayCellActive: {
    backgroundColor: Colors.brandPrimary,
  },
  gridDayCellWeekend: {
    opacity: 0.65,
  },
  gridDayText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  gridDayTextDisabled: {
    color: Colors.borderStrong,
  },
  gridDayTextWeekend: {
    color: Colors.textMuted,
  },
  gridDayTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  customTimeBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  customTimeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  timeStepperCol: {
    flex: 2,
  },
  timeStepperColSmall: {
    flex: 1.5,
  },
  timeStepperLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  hourSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  hourChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourChipActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  hourChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  hourChipTextActive: {
    color: '#FFFFFF',
  },
  minuteSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  minuteChip: {
    paddingHorizontal: 6,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minuteChipActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  minuteChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  minuteChipTextActive: {
    color: '#FFFFFF',
  },
  amPmCol: {
    minWidth: 50,
  },
  amPmToggleRow: {
    flexDirection: 'column',
    gap: 4,
  },
  amPmBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
  },
  amPmBtnActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  amPmBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  amPmBtnTextActive: {
    color: '#FFFFFF',
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
    fontSize: 16,
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
