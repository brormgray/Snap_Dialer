import React, { useState, useMemo, useEffect } from 'react';
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
} from 'react-native';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Share2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { Lead } from '../types';
import { Colors } from '../theme/colors';
import { getScheduleForSchool, matchPeriodId, BellPeriod } from '../data/bellSchedules';
import { CalendarService } from '../services/calendarService';
import { HapticsService } from '../services/hapticsService';
import { TelephonyService } from '../services/telephonyService';
import { AiSmsService } from '../services/aiSmsService';
import { SettingsRepository } from '../db/settingsRepository';

export type MeetingPurpose =
  | 'annual_review'
  | 'product_enhancement'
  | 'frs_review'
  | 'policy_service'
  | 'general_sitdown'
  | 'custom'
  | string;

export interface PurposeOption {
  id: string;
  label: string;
  icon: string;
  defaultNote: string;
  calendarTitle: string;
}

export const MEETING_PURPOSES: PurposeOption[] = [
  {
    id: 'annual_review',
    label: 'Annual Review',
    icon: '🌟',
    defaultNote: 'Annual Client Review: Reviewing 403(b) annuity performance, policy values, and beneficiary designations.',
    calendarTitle: 'Annual Client Review',
  },
  {
    id: 'product_enhancement',
    label: 'Product Enhancement',
    icon: '🚀',
    defaultNote: 'Product Enhancement & Update: Reviewing annuity transfer-in, IUL/life protection, and supplemental retirement plan options.',
    calendarTitle: 'Product Enhancement & Policy Update',
  },
  {
    id: 'frs_review',
    label: 'FRS Pension & DROP',
    icon: '🏛️',
    defaultNote: 'FRS Pension & DROP Consultation: DROP entry calculation, pension vs investment plan, and retirement roadmap.',
    calendarTitle: 'FRS Pension & DROP Review',
  },
  {
    id: 'policy_service',
    label: 'Policy Service',
    icon: '📑',
    defaultNote: 'Policy Service & Delivery: Policy delivery review, allocation adjustment, and servicing documentation.',
    calendarTitle: 'Policy Service Consultation',
  },
  {
    id: 'general_sitdown',
    label: 'Sit-Down / Consult',
    icon: '☕',
    defaultNote: 'Confirmed Sit-Down: One-on-one retirement consultation and customized benefit illustration.',
    calendarTitle: 'Retirement Strategy Sit-Down',
  },
  {
    id: 'custom',
    label: 'Custom / Other',
    icon: '✏️',
    defaultNote: 'Meeting consultation and review.',
    calendarTitle: 'Sit-Down Consultation',
  },
];

export interface AppointmentSchedulerModalProps {
  visible: boolean;
  lead: Lead | null;
  initialDate?: Date | null;
  initialNotes?: string;
  initialPurpose?: string;
  onClose: () => void;
  onSave: (payload: {
    scheduledDate: Date;
    scheduledISO: string;
    roomNumber?: string;
    notes?: string;
    locationType?: string;
    purpose?: string;
  }) => Promise<void>;
}

export function AppointmentSchedulerModal(props: AppointmentSchedulerModalProps) {
  if (!props.visible || !props.lead) return null;
  return <AppointmentSchedulerModalContent {...props} lead={props.lead} />;
}

function AppointmentSchedulerModalContent({
  visible,
  lead,
  initialDate,
  initialNotes = '',
  initialPurpose,
  onClose,
  onSave,
}: AppointmentSchedulerModalProps & { lead: Lead }) {
  // 1. School schedule and free planning period
  const schoolSchedule = useMemo(() => getScheduleForSchool(lead.school), [lead.school]);
  const educatorPeriodId = useMemo(() => matchPeriodId(lead.planning_period), [lead.planning_period]);
  const matchedPeriod = useMemo(
    () => (educatorPeriodId ? schoolSchedule.find((p) => p.id === educatorPeriodId) : null),
    [schoolSchedule, educatorPeriodId]
  );

  // 2. Quick school days calculation (next 10 school days, skipping Sat/Sun)
  const availableSchoolDays = useMemo(() => {
    const days: { date: Date; label: string; dateKey: string; isToday: boolean; isTomorrow: boolean }[] = [];
    const ref = new Date();
    let current = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

    const isTodayWeekday = current.getDay() >= 1 && current.getDay() <= 5;
    if (isTodayWeekday) {
      days.push({
        date: new Date(current),
        label: 'Today',
        dateKey: current.toISOString().slice(0, 10),
        isToday: true,
        isTomorrow: false,
      });
    }

    let count = 0;
    while (days.length < 10 && count < 25) {
      count++;
      current = new Date(current.getTime() + 86400000);
      const dow = current.getDay();
      if (dow >= 1 && dow <= 5) {
        const isTomorrow = days.length === 1 && days[0].isToday;
        const weekdayName = current.toLocaleDateString('en-US', { weekday: 'short' });
        const monthDay = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        days.push({
          date: new Date(current),
          label: isTomorrow ? 'Tomorrow' : `${weekdayName}, ${monthDay}`,
          dateKey: current.toISOString().slice(0, 10),
          isToday: false,
          isTomorrow,
        });
      }
    }
    return days;
  }, []);

  // 3. Selection States
  const [selectedPurpose, setSelectedPurpose] = useState<string>(() => {
    if (initialPurpose && MEETING_PURPOSES.some((p) => p.id === initialPurpose)) {
      return initialPurpose;
    }
    if (initialPurpose) return 'custom';
    return lead.is_client ? 'annual_review' : lead.is_frs !== false ? 'frs_review' : 'general_sitdown';
  });

  const [purposeText, setPurposeText] = useState<string>(() => {
    if (initialPurpose) {
      const match = MEETING_PURPOSES.find((p) => p.id === initialPurpose);
      return match ? match.label : initialPurpose;
    }
    return lead.is_client ? 'Annual Review' : lead.is_frs !== false ? 'FRS Pension & DROP' : 'Sit-Down / Consult';
  });

  const [selectedDayKey, setSelectedDayKey] = useState<string>('');
  const [showFullMonthGrid, setShowFullMonthGrid] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  // Time States
  const [timeMode, setTimeMode] = useState<'period' | 'custom'>('period');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [customHour, setCustomHour] = useState<number>(10);
  const [customMinute, setCustomMinute] = useState<number>(15);
  const [customAmPm, setCustomAmPm] = useState<'AM' | 'PM'>('AM');
  const [durationMinutes, setDurationMinutes] = useState<number>(25);

  // Location & Notes
  const [locationType, setLocationType] = useState<string>('classroom');
  const [roomNumber, setRoomNumber] = useState<string>(lead.room_number || '');
  const [notes, setNotes] = useState<string>(initialNotes);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Initialize defaults on open or lead change
  useEffect(() => {
    if (!visible) return;

    // Resolve Purpose
    const matchedPreset = initialPurpose
      ? MEETING_PURPOSES.find(
          (p) => p.id === initialPurpose || p.label.toLowerCase() === initialPurpose.toLowerCase()
        )
      : null;

    let resolvedId = 'custom';
    let resolvedText = initialPurpose || '';

    if (matchedPreset) {
      resolvedId = matchedPreset.id;
      resolvedText = matchedPreset.label;
    } else if (!initialPurpose) {
      if (lead.is_client) {
        resolvedId = 'annual_review';
        resolvedText = 'Annual Review';
      } else if (lead.is_frs !== false) {
        resolvedId = 'frs_review';
        resolvedText = 'FRS Pension & DROP';
      } else {
        resolvedId = 'general_sitdown';
        resolvedText = 'Sit-Down / Consult';
      }
    }

    setSelectedPurpose(resolvedId);
    setPurposeText(resolvedText);

    const activePurposeObj = MEETING_PURPOSES.find((p) => p.id === resolvedId);
    const resolvedInitialNotes = initialNotes || (activePurposeObj ? activePurposeObj.defaultNote : '');
    setNotes(resolvedInitialNotes);

    // Initial Date Handling
    let initD: Date | null = null;
    if (initialDate && !isNaN(initialDate.getTime())) {
      initD = initialDate;
    } else if (lead.appointment_scheduled_at) {
      const parsed = new Date(lead.appointment_scheduled_at);
      if (!isNaN(parsed.getTime())) initD = parsed;
    }

    if (initD) {
      const dKey = initD.toISOString().slice(0, 10);
      setSelectedDayKey(dKey);
      setCalendarMonth(new Date(initD.getFullYear(), initD.getMonth(), 1));

      // Match period or custom time
      const h = initD.getHours();
      const m = initD.getMinutes();
      setCustomHour(h % 12 === 0 ? 12 : h % 12);
      setCustomMinute(m);
      setCustomAmPm(h >= 12 ? 'PM' : 'AM');

      // Check if matches a known period
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const foundP = schoolSchedule.find((p) => p.startTime === timeStr);
      if (foundP && lead.is_frs !== false && !lead.is_client) {
        setSelectedPeriodId(foundP.id);
        setTimeMode('period');
      } else {
        setTimeMode('custom');
      }
    } else {
      // Default to first available school day (Tomorrow or Today if morning)
      const defaultDay = availableSchoolDays.find((d) => !d.isToday) || availableSchoolDays[0];
      if (defaultDay) {
        setSelectedDayKey(defaultDay.dateKey);
        setCalendarMonth(new Date(defaultDay.date.getFullYear(), defaultDay.date.getMonth(), 1));
      }

      // Default time mode: Clients & Non-FRS default to Custom Time
      const preferCustomTime = Boolean(lead.is_client || lead.is_frs === false || !matchedPeriod);
      if (preferCustomTime) {
        setTimeMode('custom');
        setCustomHour(10);
        setCustomMinute(0);
        setCustomAmPm('AM');
      } else if (matchedPeriod) {
        setSelectedPeriodId(matchedPeriod.id);
        const [sH, sM] = matchedPeriod.startTime.split(':').map(Number);
        setCustomHour(sH % 12 === 0 ? 12 : sH % 12);
        setCustomMinute(sM);
        setCustomAmPm(sH >= 12 ? 'PM' : 'AM');
        setTimeMode('period');
      } else {
        const p3 = schoolSchedule[2] || schoolSchedule[0];
        if (p3) {
          setSelectedPeriodId(p3.id);
          const [sH, sM] = p3.startTime.split(':').map(Number);
          setCustomHour(sH % 12 === 0 ? 12 : sH % 12);
          setCustomMinute(sM);
          setCustomAmPm(sH >= 12 ? 'PM' : 'AM');
        }
        setTimeMode('period');
      }
    }

    // Default location: Clients/Non-FRS default to office or phone/virtual
    if (lead.is_client || lead.is_frs === false) {
      setLocationType('office');
    } else {
      setLocationType('classroom');
    }

    setRoomNumber(lead.room_number || '');
    setShowFullMonthGrid(false);
  }, [visible, lead, initialDate, initialPurpose, initialNotes]);

  // Handle Purpose Selection
  const handleSelectPurpose = (purposeId: string) => {
    HapticsService.tick();
    setSelectedPurpose(purposeId);
    const purposeObj = MEETING_PURPOSES.find((p) => p.id === purposeId);
    if (!purposeObj) return;

    if (purposeId === 'custom') {
      if (!purposeText || MEETING_PURPOSES.some((p) => p.label === purposeText)) {
        setPurposeText('');
      }
      return;
    }

    setPurposeText(purposeObj.label);
    const isCurrentADefaultNote = MEETING_PURPOSES.some((p) => p.defaultNote === notes.trim());
    if (!notes.trim() || isCurrentADefaultNote) {
      setNotes(purposeObj.defaultNote);
    }
  };

  // Handle Quick Date Jumps
  const handleQuickJump = (targetDate: Date) => {
    HapticsService.tick();
    const dKey = targetDate.toISOString().slice(0, 10);
    setSelectedDayKey(dKey);
    setCalendarMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
  };

  // Handle Bell Period Selection
  const handleSelectPeriod = (period: BellPeriod) => {
    HapticsService.tick();
    setSelectedPeriodId(period.id);
    setTimeMode('period');
    const [sH, sM] = period.startTime.split(':').map(Number);
    setCustomHour(sH % 12 === 0 ? 12 : sH % 12);
    setCustomMinute(sM);
    setCustomAmPm(sH >= 12 ? 'PM' : 'AM');
  };

  // Compute Active Scheduled Date
  const computedScheduledDate = useMemo(() => {
    if (!selectedDayKey) return new Date();
    const [y, m, d] = selectedDayKey.split('-').map(Number);

    let startH = customHour;
    if (customAmPm === 'PM' && startH < 12) startH += 12;
    if (customAmPm === 'AM' && startH === 12) startH = 0;

    return new Date(y, m - 1, d, startH, customMinute, 0, 0);
  }, [selectedDayKey, customHour, customMinute, customAmPm]);

  // Full Month Calendar Matrix Generation
  const monthCalendarMatrix = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const matrix: ({ dayNumber: number; dateKey: string; isPast: boolean; isWeekend: boolean } | null)[] = [];

    // Pre-pad blank days
    for (let i = 0; i < firstDayIndex; i++) {
      matrix.push(null);
    }

    const todayStr = new Date().toISOString().slice(0, 10);

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

  // 1-Tap Calendar Piping Handlers
  const getModalLocationStr = () => {
    const isFrs = lead.is_frs !== false;
    if (locationType === 'office') return 'Advisor Office • ValuTeachers';
    if (locationType === 'in_person') return 'Client In-Person / Home';
    if (locationType === 'virtual') return 'Virtual / Zoom Video Call';
    if (locationType === 'phone') return 'Phone Consultation';
    if (locationType === 'coffee') return 'Coffee / Local Meeting';
    const defaultLoc = isFrs ? 'Campus' : 'Office / Remote';
    return roomNumber
      ? `${lead.school || (isFrs ? 'Campus' : 'Office/Remote')} • Room ${roomNumber}`
      : lead.school || defaultLoc;
  };

  const getActivePurposeTitle = () => {
    const trimmed = purposeText.trim();
    if (trimmed) return trimmed;
    const activePurposeObj = MEETING_PURPOSES.find((p) => p.id === selectedPurpose);
    return activePurposeObj ? activePurposeObj.calendarTitle : 'Sit-Down Consultation';
  };

  const handleExportAppleIcs = async () => {
    await HapticsService.medium();
    const locationStr = getModalLocationStr();
    const purposeTitle = getActivePurposeTitle();
    const event = CalendarService.buildEducatorEvent(lead, computedScheduledDate, durationMinutes, notes, purposeTitle);
    event.location = locationStr;
    await CalendarService.downloadIcsFile(event);
  };

  const handleOpenGoogleCal = async () => {
    await HapticsService.medium();
    const locationStr = getModalLocationStr();
    const purposeTitle = getActivePurposeTitle();
    const event = CalendarService.buildEducatorEvent(lead, computedScheduledDate, durationMinutes, notes, purposeTitle);
    event.location = locationStr;
    CalendarService.openGoogleCalendar(event);
  };

  const handleOpenOutlookCal = async () => {
    await HapticsService.medium();
    const locationStr = getModalLocationStr();
    const purposeTitle = getActivePurposeTitle();
    const event = CalendarService.buildEducatorEvent(lead, computedScheduledDate, durationMinutes, notes, purposeTitle);
    event.location = locationStr;
    CalendarService.openOutlookCalendar(event);
  };

  const handleTextConfirmation = async () => {
    await HapticsService.medium();
    const scheduledISO = computedScheduledDate.toISOString();
    const settings = await SettingsRepository.getSettings();
    const agentName = settings?.user_name || 'Alex';

    const tempLead: Lead = {
      ...lead,
      appointment_scheduled_at: scheduledISO,
      last_disposition: 'appointment_set',
      room_number: roomNumber.trim() || lead.room_number,
      planning_period: selectedPeriodId
        ? schoolSchedule.find((p) => p.id === selectedPeriodId)?.name || lead.planning_period
        : lead.planning_period,
    };

    const smsText = AiSmsService.getSmartFallbackSMS(tempLead, agentName, 'meeting_confirmation', new Date());
    await TelephonyService.sendSMS(lead.phone, smsText);
  };

  // Submit Handler
  const handleConfirm = async () => {
    await HapticsService.success();
    setIsSaving(true);
    try {
      const scheduledISO = computedScheduledDate.toISOString();
      const finalPurpose = getActivePurposeTitle();
      await onSave({
        scheduledDate: computedScheduledDate,
        scheduledISO,
        roomNumber: roomNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        locationType,
        purpose: finalPurpose,
      });
      onClose();
    } catch (e) {
      console.warn('Failed to save appointment:', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => {
            HapticsService.tick().catch(() => {});
            onClose();
          }}
        />
        <View style={styles.modalContent} pointerEvents="auto">
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <CalendarIcon size={18} color={Colors.brandAccent} />
                <Text style={styles.modalTitle}>SCHEDULE SIT-DOWN APPOINTMENT</Text>
              </View>
              <Text style={styles.leadSubHeader} numberOfLines={1}>
                {lead.name} • {lead.school || 'Campus'} {lead.planning_period ? `• ${lead.planning_period}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                HapticsService.tick().catch(() => {});
                onClose();
              }}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={18} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Section 0: Meeting Reason / Purpose */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>0. MEETING PURPOSE / REASON</Text>
                <Text style={styles.sectionSubHint}>Any Reason • Custom or Preset</Text>
              </View>

              {/* Freeform Editable Purpose Input */}
              <View style={styles.purposeInputCard}>
                <View style={styles.purposeInputRow}>
                  <Sparkles size={16} color={Colors.brandAccent} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.purposeTextInput}
                    value={purposeText}
                    onChangeText={(text) => {
                      setPurposeText(text);
                      const matched = MEETING_PURPOSES.find(
                        (p) => p.label.toLowerCase() === text.trim().toLowerCase()
                      );
                      setSelectedPurpose(matched ? matched.id : 'custom');
                    }}
                    placeholder="Type ANY purpose (e.g. Annual Review, 403b, DROP, Tax...)"
                    placeholderTextColor={Colors.textMuted}
                  />
                  {purposeText.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => {
                        setPurposeText('');
                        setSelectedPurpose('custom');
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4 }}
                    >
                      <X size={15} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Quick Preset Suggestion Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.purposeStrip}>
                {MEETING_PURPOSES.map((p) => {
                  const isSelected =
                    selectedPurpose === p.id ||
                    (p.id !== 'custom' && purposeText.trim().toLowerCase() === p.label.toLowerCase());
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.purposePill, isSelected && styles.purposePillActive]}
                      onPress={() => handleSelectPurpose(p.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.purposePillIcon}>{p.icon}</Text>
                      <Text style={[styles.purposePillText, isSelected && styles.purposePillTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Section 1: Select Day */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>1. SELECT DATE</Text>
                <TouchableOpacity
                  style={styles.toggleCalendarBtn}
                  onPress={() => {
                    HapticsService.tick();
                    setShowFullMonthGrid((prev) => !prev);
                  }}
                >
                  <Text style={styles.toggleCalendarText}>
                    {showFullMonthGrid ? 'Quick Days' : 'Full Month Calendar'}
                  </Text>
                  {showFullMonthGrid ? (
                    <ChevronUp size={14} color={Colors.brandAccent} />
                  ) : (
                    <ChevronDown size={14} color={Colors.brandAccent} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Quick Jump Shortcuts */}
              <View style={styles.quickJumpRow}>
                <Text style={styles.quickJumpLabel}>Quick Jumps:</Text>
                <TouchableOpacity
                  style={styles.quickJumpBtn}
                  onPress={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    handleQuickJump(tomorrow);
                  }}
                >
                  <Text style={styles.quickJumpBtnText}>Tomorrow</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickJumpBtn}
                  onPress={() => {
                    const nextWeek = new Date();
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    handleQuickJump(nextWeek);
                  }}
                >
                  <Text style={styles.quickJumpBtnText}>+1 Wk</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickJumpBtn}
                  onPress={() => {
                    const nextMonth = new Date();
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    handleQuickJump(nextMonth);
                  }}
                >
                  <Text style={styles.quickJumpBtnText}>+1 Mo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickJumpBtn, styles.quickJumpBtnGold]}
                  onPress={() => {
                    if (lead.annual_review_due_date && !isNaN(new Date(lead.annual_review_due_date).getTime())) {
                      handleQuickJump(new Date(lead.annual_review_due_date));
                    } else {
                      const nextYear = new Date();
                      nextYear.setFullYear(nextYear.getFullYear() + 1);
                      handleQuickJump(nextYear);
                    }
                  }}
                >
                  <Text style={[styles.quickJumpBtnText, styles.quickJumpBtnGoldText]}>
                    🌟 Annual Review (+1 Yr)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Quick School-Day Horizontal Strip */}
              {!showFullMonthGrid ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                  {availableSchoolDays.map((d) => {
                    const isSelected = selectedDayKey === d.dateKey;
                    return (
                      <TouchableOpacity
                        key={d.dateKey}
                        style={[styles.dayPill, isSelected && styles.dayPillActive]}
                        onPress={() => {
                          HapticsService.tick();
                          setSelectedDayKey(d.dateKey);
                        }}
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
                /* Full Month Interactive Calendar Grid */
                <View style={styles.monthCalendarCard}>
                  <View style={styles.monthNavRow}>
                    <TouchableOpacity
                      onPress={() => {
                        HapticsService.tick();
                        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
                      }}
                      style={styles.monthNavBtn}
                    >
                      <ChevronLeft size={18} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.monthNavTitle}>
                      {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        HapticsService.tick();
                        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
                      }}
                      style={styles.monthNavBtn}
                    >
                      <ChevronRight size={18} color={Colors.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  {/* Day of Week Headers */}
                  <View style={styles.dowHeaderRow}>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dow, idx) => (
                      <Text key={idx} style={[styles.dowHeaderText, (idx === 5 || idx === 6) && { color: Colors.textMuted }]}>
                        {dow}
                      </Text>
                    ))}
                  </View>

                  {/* Calendar Day Grid */}
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
                          onPress={() => {
                            HapticsService.tick();
                            setSelectedDayKey(item.dateKey);
                          }}
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
            </View>

            {/* Section 2: Time & Bell Schedule Period Matching */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>2. SELECT TIME / PERIOD</Text>
                <View style={styles.timeModePills}>
                  <TouchableOpacity
                    style={[styles.timeModePill, timeMode === 'period' && styles.timeModePillActive]}
                    onPress={() => {
                      HapticsService.tick();
                      setTimeMode('period');
                    }}
                  >
                    <Text style={[styles.timeModePillText, timeMode === 'period' && styles.timeModePillTextActive]}>
                      Bell Schedule
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.timeModePill, timeMode === 'custom' && styles.timeModePillActive]}
                    onPress={() => {
                      HapticsService.tick();
                      setTimeMode('custom');
                    }}
                  >
                    <Text style={[styles.timeModePillText, timeMode === 'custom' && styles.timeModePillTextActive]}>
                      Custom Time
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {timeMode === 'period' ? (
                /* Period Cards */
                <View style={styles.periodCardsContainer}>
                  {schoolSchedule.map((p) => {
                    const isEducatorFreePeriod = p.id === educatorPeriodId;
                    const isSelected = selectedPeriodId === p.id;

                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          styles.periodCard,
                          isEducatorFreePeriod && styles.periodCardRecommended,
                          isSelected && styles.periodCardActive,
                        ]}
                        onPress={() => handleSelectPeriod(p)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.periodCardTop}>
                          <Text style={[styles.periodCardName, isSelected && styles.periodCardNameActive]}>
                            {p.name}
                          </Text>
                          {isEducatorFreePeriod && (
                            <View style={styles.bestTimeBadge}>
                              <Sparkles size={11} color="#B45309" />
                              <Text style={styles.bestTimeBadgeText}>PLANNING</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.periodCardTime, isSelected && styles.periodCardTimeActive]}>
                          {p.startTime} – {p.endTime}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                /* Custom Time Stepper & Duration */
                <View style={styles.customTimeBox}>
                  {/* Quick Times Presets */}
                  <View style={styles.quickTimesRow}>
                    <Text style={styles.quickTimeLabel}>Presets:</Text>
                    {[
                      { h: 9, m: 0, ampm: 'AM' as const },
                      { h: 10, m: 30, ampm: 'AM' as const },
                      { h: 1, m: 15, ampm: 'PM' as const },
                      { h: 3, m: 30, ampm: 'PM' as const },
                      { h: 5, m: 0, ampm: 'PM' as const },
                      { h: 6, m: 30, ampm: 'PM' as const },
                    ].map((t, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.quickTimeChip,
                          customHour === t.h && customMinute === t.m && customAmPm === t.ampm && styles.quickTimeChipActive,
                        ]}
                        onPress={() => {
                          HapticsService.tick();
                          setCustomHour(t.h);
                          setCustomMinute(t.m);
                          setCustomAmPm(t.ampm);
                        }}
                      >
                        <Text
                          style={[
                            styles.quickTimeChipText,
                            customHour === t.h && customMinute === t.m && customAmPm === t.ampm && styles.quickTimeChipTextActive,
                          ]}
                        >
                          {t.h}:{String(t.m).padStart(2, '0')} {t.ampm}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.customTimeRow}>
                    {/* Hours */}
                    <View style={styles.timeStepperCol}>
                      <Text style={styles.timeStepperLabel}>Hour</Text>
                      <View style={styles.hourSelectorRow}>
                        {[7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                          <TouchableOpacity
                            key={h}
                            style={[styles.hourChip, customHour === h && styles.hourChipActive]}
                            onPress={() => {
                              HapticsService.tick();
                              setCustomHour(h);
                            }}
                          >
                            <Text style={[styles.hourChipText, customHour === h && styles.hourChipTextActive]}>
                              {h}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Minutes */}
                    <View style={styles.timeStepperCol}>
                      <Text style={styles.timeStepperLabel}>Minute</Text>
                      <View style={styles.minuteSelectorRow}>
                        {[0, 15, 30, 45].map((m) => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.minuteChip, customMinute === m && styles.minuteChipActive]}
                            onPress={() => {
                              HapticsService.tick();
                              setCustomMinute(m);
                            }}
                          >
                            <Text style={[styles.minuteChipText, customMinute === m && styles.minuteChipTextActive]}>
                              :{String(m).padStart(2, '0')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* AM / PM Toggle */}
                    <View style={styles.amPmCol}>
                      <Text style={styles.timeStepperLabel}>AM / PM</Text>
                      <View style={styles.amPmToggleRow}>
                        <TouchableOpacity
                          style={[styles.amPmBtn, customAmPm === 'AM' && styles.amPmBtnActive]}
                          onPress={() => {
                            HapticsService.tick();
                            setCustomAmPm('AM');
                          }}
                        >
                          <Text style={[styles.amPmBtnText, customAmPm === 'AM' && styles.amPmBtnTextActive]}>AM</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.amPmBtn, customAmPm === 'PM' && styles.amPmBtnActive]}
                          onPress={() => {
                            HapticsService.tick();
                            setCustomAmPm('PM');
                          }}
                        >
                          <Text style={[styles.amPmBtnText, customAmPm === 'PM' && styles.amPmBtnTextActive]}>PM</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Duration Selector */}
                  <View style={styles.durationRow}>
                    <Text style={styles.durationLabel}>Duration:</Text>
                    {[15, 20, 25, 30, 45, 60].map((dur) => (
                      <TouchableOpacity
                        key={dur}
                        style={[styles.durChip, durationMinutes === dur && styles.durChipActive]}
                        onPress={() => {
                          HapticsService.tick();
                          setDurationMinutes(dur);
                        }}
                      >
                        <Text style={[styles.durChipText, durationMinutes === dur && styles.durChipTextActive]}>
                          {dur} min
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Section 3: Location / Setting */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>3. LOCATION / SETTING</Text>
              <View style={styles.locationChipsRow}>
                {[
                  { id: 'classroom', label: '🏫 School Classroom' },
                  { id: 'office', label: '🏢 Advisor Office' },
                  { id: 'in_person', label: '🏠 Client Home' },
                  { id: 'virtual', label: '💻 Virtual / Zoom' },
                  { id: 'phone', label: '📞 Phone Sit-Down' },
                  { id: 'coffee', label: '☕ Coffee / Neutral' },
                ].map((loc) => {
                  const isSelected = locationType === loc.id;
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      style={[styles.locationChip, isSelected && styles.locationChipActive]}
                      onPress={() => {
                        HapticsService.tick();
                        setLocationType(loc.id);
                      }}
                    >
                      <Text style={[styles.locationChipText, isSelected && styles.locationChipTextActive]}>
                        {loc.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {locationType === 'classroom' && (
                <View style={styles.roomInputRow}>
                  <Text style={styles.roomInputLabel}>Room #:</Text>
                  <TextInput
                    style={styles.roomInput}
                    placeholder="e.g. 204 or 4-102"
                    placeholderTextColor={Colors.textMuted}
                    value={roomNumber}
                    onChangeText={setRoomNumber}
                  />
                </View>
              )}
            </View>

            {/* Section 4: Appointment Notes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>4. APPOINTMENT NOTES & AGENDA</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="e.g. Confirmed sit-down. Reviewing annuity performance and benefit options."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />
            </View>

            {/* Section 5: Calendar Synchronization Preview & Piping */}
            <View style={styles.calendarPipingCard}>
              <View style={styles.pipingHeader}>
                <View style={styles.pipingTitleRow}>
                  <Sparkles size={15} color={Colors.heavenlyGold} />
                  <Text style={styles.pipingTitle}>
                    {MEETING_PURPOSES.find((p) => p.id === selectedPurpose)?.label.toUpperCase() || 'CONFIRMED SIT-DOWN'} PREVIEW
                  </Text>
                </View>
                <Text style={styles.pipingDateSummary}>
                  {computedScheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} @{' '}
                  {computedScheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  {roomNumber ? ` • Room ${roomNumber}` : ''}
                </Text>
              </View>

              <View style={styles.calendarButtonsRow}>
                <TouchableOpacity style={styles.calSyncBtn} onPress={handleExportAppleIcs}>
                  <Text style={styles.calSyncBtnText}>🍏 Apple (.ics)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calSyncBtn} onPress={handleOpenGoogleCal}>
                  <Text style={styles.calSyncBtnText}>🌐 Google Cal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calSyncBtn} onPress={handleOpenOutlookCal}>
                  <Text style={styles.calSyncBtnText}>📧 Outlook</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.calSyncBtn, { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}
                  onPress={handleTextConfirmation}
                >
                  <Text style={[styles.calSyncBtnText, { color: '#38BDF8' }]}>💬 Text SMS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Fixed Footer Action Buttons */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSaving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, isSaving && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={18} color="#FFFFFF" />
                  <Text style={styles.confirmBtnText}>Confirm & Lock Sit-Down</Text>
                </>
              )}
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
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.brandPrimary,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  leadSubHeader: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  scrollBody: {
    maxHeight: 520,
  },
  scrollContent: {
    padding: 18,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.6,
  },
  sectionSubHint: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brandAccent,
    textTransform: 'uppercase',
  },
  purposeInputCard: {
    backgroundColor: Colors.bgApp,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginTop: 2,
  },
  purposeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  purposeTextInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingVertical: 8,
  },
  toggleCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
  },
  toggleCalendarText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brandAccent,
  },
  purposeStrip: {
    gap: 8,
    paddingVertical: 4,
  },
  purposePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.bgApp,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
  },
  purposePillActive: {
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderColor: Colors.borderGold,
  },
  purposePillIcon: {
    fontSize: 14,
  },
  purposePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  purposePillTextActive: {
    color: Colors.heavenlyGold,
    fontWeight: '800',
  },
  quickJumpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  quickJumpLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    marginRight: 2,
  },
  quickJumpBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  quickJumpBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  quickJumpBtnGold: {
    backgroundColor: 'rgba(212, 160, 23, 0.14)',
    borderColor: Colors.borderGold,
  },
  quickJumpBtnGoldText: {
    color: Colors.heavenlyGold,
    fontWeight: '800',
  },
  quickTimesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  quickTimeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  quickTimeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  quickTimeChipActive: {
    backgroundColor: Colors.brandAccent,
    borderColor: Colors.brandAccent,
  },
  quickTimeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  quickTimeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayStrip: {
    gap: 8,
    paddingVertical: 4,
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.bgApp,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    minWidth: 80,
  },
  dayPillActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  dayPillLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  dayPillLabelActive: {
    color: '#FFFFFF',
  },
  dayPillSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  dayPillSubActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  monthCalendarCard: {
    backgroundColor: Colors.bgApp,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  monthNavTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dowHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  dowHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    width: 32,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  gridDayCell: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderRadius: 17,
  },
  gridDayCellActive: {
    backgroundColor: Colors.brandPrimary,
  },
  gridDayCellWeekend: {
    opacity: 0.6,
  },
  gridDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  gridDayTextDisabled: {
    color: Colors.borderSubtle,
  },
  gridDayTextWeekend: {
    color: Colors.textMuted,
  },
  gridDayTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  timeModePills: {
    flexDirection: 'row',
    backgroundColor: Colors.bgApp,
    borderRadius: 8,
    padding: 2,
  },
  timeModePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timeModePillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  timeModePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  timeModePillTextActive: {
    color: Colors.brandPrimary,
    fontWeight: '700',
  },
  periodCardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodCard: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.bgApp,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
  },
  periodCardRecommended: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  periodCardActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  periodCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  periodCardName: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  periodCardNameActive: {
    color: '#FFFFFF',
  },
  bestTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bestTimeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
  },
  periodCardTime: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  periodCardTimeActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  customTimeBox: {
    backgroundColor: Colors.bgApp,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 12,
  },
  customTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeStepperCol: {
    flex: 1,
  },
  timeStepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  hourSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  hourChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
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
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  hourChipTextActive: {
    color: '#FFFFFF',
  },
  minuteSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  minuteChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
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
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  minuteChipTextActive: {
    color: '#FFFFFF',
  },
  amPmCol: {
    width: 72,
  },
  amPmToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  amPmBtn: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 6,
  },
  amPmBtnActive: {
    backgroundColor: Colors.brandAccent,
  },
  amPmBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  amPmBtnTextActive: {
    color: '#FFFFFF',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    paddingTop: 10,
  },
  durationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  durChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  durChipActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  durChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  durChipTextActive: {
    color: '#FFFFFF',
  },
  locationChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  locationChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  locationChipActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderColor: Colors.brandAccent,
  },
  locationChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  locationChipTextActive: {
    color: Colors.brandAccent,
    fontWeight: '700',
  },
  roomInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  roomInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  roomInput: {
    flex: 1,
    backgroundColor: Colors.bgApp,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  notesInput: {
    backgroundColor: Colors.bgApp,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: Colors.textPrimary,
    minHeight: 52,
  },
  calendarPipingCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  pipingHeader: {
    gap: 4,
  },
  pipingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pipingTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.heavenlyGold,
    letterSpacing: 0.5,
  },
  pipingDateSummary: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  calendarButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  calSyncBtn: {
    flex: 1,
    minWidth: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  calSyncBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.bgApp,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.brandAccent,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
