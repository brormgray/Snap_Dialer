import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  PhoneCall,
  MessageSquare,
  Clock,
  Building,
  FileText,
  User,
  ShieldAlert,
  Trash2,
  Save,
  CheckCircle2,
  Calendar,
  GraduationCap,
  School,
  Check,
  HelpCircle,
  Eye,
  FileCheck,
  X,
  Sparkles,
  Flame,
  Archive,
  Layers,
  Mail,
  RotateCcw,
  Edit3,
  Plus,
  Award,
  ClipboardList,
  Briefcase,
  Landmark,
} from 'lucide-react-native';
import { LeadsRepository } from '../db/leadsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { SettingsRepository } from '../db/settingsRepository';
import { TelephonyService } from '../services/telephonyService';
import { HapticsService } from '../services/hapticsService';
import { AiSmsService } from '../services/aiSmsService';
import { CalendarService } from '../services/calendarService';
import { DateTimeAwareService } from '../services/dateTimeAwareService';
import { isTeacherInPlanningNow } from '../data/bellSchedules';
import { NotesService, NoteEntry, EDUCATOR_QUICK_TAGS } from '../services/notesService';
import { Lead, CallLog, CallDisposition, LeadList } from '../types';
import { Colors } from '../theme/colors';
import ZoomableImageModal from '../components/ZoomableImageModal';
import { ClientPortfolioCard } from '../components/ClientPortfolioCard';
import { PostApptWrapUpCard } from '../components/PostApptWrapUpCard';
import { AppointmentSchedulerModal } from '../components/AppointmentSchedulerModal';
import { CallbackSchedulerModal } from '../components/CallbackSchedulerModal';

export default function LeadDetailScreen({ route, navigation }: any) {
  const leadId = route.params?.leadId;

  const [lead, setLead] = useState<Lead | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [availableLists, setAvailableLists] = useState<LeadList[]>([]);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [imageModalVisible, setImageModalVisible] = useState<boolean>(false);

  // Notes CRUD state
  const [noteInputText, setNoteInputText] = useState<string>('');
  const [noteEditModalVisible, setNoteEditModalVisible] = useState<boolean>(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState<string>('');

  // SMS Modal State
  const [smsModalVisible, setSmsModalVisible] = useState<boolean>(false);
  const [smsBody, setSmsBody] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const userEditedSmsRef = useRef<boolean>(false);

  // Call & Post-Call Disposition State
  const [showDispositionRow, setShowDispositionRow] = useState<boolean>(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [apptSchedulerVisible, setApptSchedulerVisible] = useState<boolean>(false);
  const [schedulerInitialNotes, setSchedulerInitialNotes] = useState<string>('');
  const [schedulerInitialPurpose, setSchedulerInitialPurpose] = useState<string | undefined>(undefined);
  const [schedulerInitialDate, setSchedulerInitialDate] = useState<Date | null>(null);
  const [callbackModalVisible, setCallbackModalVisible] = useState<boolean>(false);
  const [otherModalVisible, setOtherModalVisible] = useState<boolean>(false);
  const [otherDispoNote, setOtherDispoNote] = useState<string>('');
  const [otherDispoChips, setOtherDispoChips] = useState<string[]>([]);

  const openSchedulerModalWithContext = (
    purposeTitle?: string,
    purposeId?: string,
    targetDateStr?: string
  ) => {
    let targetDate: Date | null = null;
    if (targetDateStr && !isNaN(new Date(targetDateStr).getTime())) {
      targetDate = new Date(targetDateStr);
    }
    setSchedulerInitialPurpose(purposeId);
    setSchedulerInitialDate(targetDate);
    setApptSchedulerVisible(true);
  };

  // Edit form state
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [school, setSchool] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [planningPeriod, setPlanningPeriod] = useState<string>('');
  const [yearsInFrs, setYearsInFrs] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [priorityTier, setPriorityTier] = useState<number>(1);
  const [listIdVal, setListIdVal] = useState<string>('master_queue');
  const [isFrsVal, setIsFrsVal] = useState<boolean>(true);

  useEffect(() => {
    loadLeadData().then((loadedLead) => {
      if (route.params?.autoOpenSms && loadedLead) {
        openSmsModal(loadedLead);
      }
      if (route.params?.openDispo) {
        setShowDispositionRow(true);
      }
      if (route.params?.startCall && loadedLead) {
        handleCall();
      }
      if (route.params?.autoOpenScheduler && loadedLead) {
        if (route.params?.initialSchedulerNotes) {
          setSchedulerInitialNotes(route.params.initialSchedulerNotes);
        }
        if (route.params?.initialPurpose) {
          setSchedulerInitialPurpose(route.params.initialPurpose);
        }
        if (route.params?.initialSchedulerDate) {
          setSchedulerInitialDate(new Date(route.params.initialSchedulerDate));
        }
        setApptSchedulerVisible(true);
      }
    });
  }, [
    leadId,
    route.params?.openDispo,
    route.params?.startCall,
    route.params?.autoOpenScheduler,
    route.params?.initialPurpose,
  ]);

  const loadLeadData = async (): Promise<Lead | null> => {
    const [l, lists] = await Promise.all([
      LeadsRepository.getLeadById(leadId),
      LeadsRepository.getAllLists(),
    ]);

    if (l) {
      setLead({ ...l });
      if (!isEditing) {
        setName(l.name);
        setPhone(l.phone);
        setSchool(l.school || '');
        setEmail(l.email || '');
        setRoomNumber(l.room_number || '');
        setPlanningPeriod(l.planning_period || '');
        setYearsInFrs(l.years_in_frs || '');
        setNotes(l.notes || '');
        setPriorityTier(l.priority_tier || 1);
        setListIdVal(l.list_id || 'master_queue');
        setIsFrsVal(l.is_frs !== false);
      }
    }
    setAvailableLists(lists);

    const history = await CallLogsRepository.getLogsForLead(leadId);
    setLogs(history);
    return l || null;
  };

  const handleTogglePriority = async () => {
    if (!lead) return;
    await HapticsService.medium();
    const newTier = (lead.priority_tier === 3) ? 1 : 3;
    setLead((prev) => (prev ? { ...prev, priority_tier: newTier } : null));
    await LeadsRepository.updateLeadPriority(lead.id, newTier);
    await loadLeadData();
  };

  const handleToggleFrs = async () => {
    if (!lead) return;
    const prevIsFrs = lead.is_frs !== false;
    const newIsFrs = !prevIsFrs;

    await HapticsService.medium();
    // Immediate optimistic state updates across lead and form states
    setLead((prev) => (prev ? { ...prev, is_frs: newIsFrs } : null));
    setIsFrsVal(newIsFrs);

    try {
      await LeadsRepository.updateLeadDetails({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        school: lead.school,
        email: lead.email,
        room_number: lead.room_number,
        planning_period: lead.planning_period,
        years_in_frs: lead.years_in_frs,
        notes: lead.notes,
        priority_tier: lead.priority_tier,
        list_id: lead.list_id,
        is_frs: newIsFrs,
      });
      showToast(newIsFrs ? 'Marked as FRS Member (FRS messaging active)' : 'Marked as Non-FRS Client (General retirement messaging active)');
      await loadLeadData();
    } catch (err: any) {
      console.error('Failed to toggle FRS status:', err);
      // Clean rollback on failure
      setLead((prev) => (prev ? { ...prev, is_frs: prevIsFrs } : null));
      setIsFrsVal(prevIsFrs);
      Alert.alert('Error', 'Failed to update client retirement system status.');
    }
  };

  const handleSaveEdit = async () => {
    if (!lead) return;
    await HapticsService.success();
    try {
      await LeadsRepository.updateLeadDetails({
        id: lead.id,
        name: name.trim(),
        phone: phone.trim(),
        school: school.trim() || (isFrsVal ? 'VOL' : 'General Client'),
        email: email.trim() || null,
        room_number: roomNumber.trim() || null,
        planning_period: planningPeriod.trim() || null,
        years_in_frs: yearsInFrs.trim() || null,
        notes: notes || null,
        priority_tier: priorityTier,
        list_id: listIdVal,
        is_frs: isFrsVal,
      });

      setLead((prev) =>
        prev
          ? {
              ...prev,
              name: name.trim(),
              phone: phone.trim(),
              school: school.trim() || (isFrsVal ? 'VOL' : 'General Client'),
              email: email.trim() || null,
              room_number: roomNumber.trim() || null,
              planning_period: planningPeriod.trim() || null,
              years_in_frs: yearsInFrs.trim() || null,
              notes: notes || null,
              priority_tier: priorityTier,
              list_id: listIdVal,
              is_frs: isFrsVal,
            }
          : null
      );

      setIsEditing(false);
      await loadLeadData();
      showToast('✓ Contact details saved successfully.');
    } catch (err: any) {
      console.error('Failed to save contact details:', err);
      Alert.alert('Save Failed', err?.message || 'Could not update contact details.');
    }
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const isDNC = lead?.last_disposition === 'do_not_call';

  const handleToggleDNC = async () => {
    if (!lead) return;
    await HapticsService.medium();

    if (isDNC) {
      // Reinstating lead to queue
      const doReinstate = async () => {
        await HapticsService.success();
        const noteText = 'DNC removed / Reinstated to Queue';
        const updatedNotes = NotesService.addNote(lead.notes, noteText);
        setLead((prev) => (prev ? { ...prev, last_disposition: 'pending', notes: updatedNotes } : null));
        await LeadsRepository.updateLeadDisposition(lead.id, 'pending', updatedNotes);
        await loadLeadData();
        showToast('✓ Lead reinstated to active calling queue.');
      };

      if (Platform.OS === 'web') {
        const confirmed = typeof window !== 'undefined' && window.confirm(`Reinstate "${lead.name}"? This removes the DNC flag and returns them to your active calling queue as Ready to Call.`);
        if (confirmed) await doReinstate();
        return;
      }

      Alert.alert(
        'Reinstate Educator',
        `Remove Do Not Call flag and return "${lead.name}" to the active calling queue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reinstate to Queue', onPress: doReinstate },
        ]
      );
    } else {
      // Flagging lead as DNC
      const doFlagDNC = async () => {
        await HapticsService.heavy();
        const noteText = 'Flagged as DNC / Opt-Out';
        const updatedNotes = NotesService.addNote(lead.notes, noteText);
        setLead((prev) => (prev ? { ...prev, last_disposition: 'do_not_call', notes: updatedNotes } : null));
        await LeadsRepository.updateLeadDisposition(lead.id, 'do_not_call', updatedNotes);
        await loadLeadData();
        showToast('🛡️ Flagged as Do Not Call (Removed from Queue)');
      };

      if (Platform.OS === 'web') {
        const confirmed = typeof window !== 'undefined' && window.confirm(`Flag "${lead.name}" as Do Not Call (DNC)? This will permanently remove them from all active calling queues.`);
        if (confirmed) await doFlagDNC();
        return;
      }

      Alert.alert(
        'Do Not Call (DNC) Compliance',
        `Flag "${lead.name}" as Do Not Call? This permanently removes them from all active calling queues.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Flag as DNC', style: 'destructive', onPress: doFlagDNC },
        ]
      );
    }
  };

  const handleCall = async () => {
    if (!lead) return;
    await HapticsService.medium();
    setCallStartTime(Date.now());
    setShowDispositionRow(true);
    await TelephonyService.makeCall(lead.phone);
  };

  const handleScheduleAppointmentWithCalendar = async (
    scheduledDateISO: string,
    periodName?: string,
    customNotes?: string,
    purpose?: string
  ) => {
    if (!lead) return;
    await HapticsService.success();
    const durationSeconds = callStartTime ? Math.max(0, Math.floor((Date.now() - callStartTime) / 1000)) : 0;
    setCallStartTime(null);
    setShowDispositionRow(false);

    const dateFormatted = new Date(scheduledDateISO).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timeFormatted = new Date(scheduledDateISO).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    const purposePrefix = purpose?.trim() ? `[${purpose.trim()}] ` : '';
    const note = `${purposePrefix}Confirmed Sit-Down scheduled for ${dateFormatted} @ ${timeFormatted}${periodName ? ` (${periodName})` : ''}${customNotes ? `. Notes: ${customNotes}` : ''}.`;
    const updatedNotes = NotesService.addNote(lead.notes, note);

    await LeadsRepository.scheduleAppointment(lead.id, scheduledDateISO, updatedNotes);

    if (periodName && periodName !== lead.planning_period) {
      await LeadsRepository.updateLeadDetails({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        planning_period: periodName,
      });
    }

    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds,
      disposition: 'appointment_set',
      note,
    });

    await loadLeadData();
    showToast(`✓ Scheduled: ${purpose?.trim() || 'Sit-Down'} (${dateFormatted} @ ${timeFormatted})`);
  };

  const handleLogCallOutcome = async (disposition: CallDisposition, customNote?: string) => {
    if (!lead) return;
    await HapticsService.success();

    if (disposition === 'appointment_set') {
      setApptSchedulerVisible(true);
      return;
    }

    if (disposition === 'callback_requested') {
      setCallbackModalVisible(true);
      return;
    }

    if (disposition === 'other' && !customNote) {
      setOtherDispoNote('');
      setOtherDispoChips([]);
      setOtherModalVisible(true);
      return;
    }

    const durationSeconds = callStartTime ? Math.max(0, Math.floor((Date.now() - callStartTime) / 1000)) : 0;
    setCallStartTime(null);
    setShowDispositionRow(false);

    const defaultNote =
      disposition === 'connected' || disposition === 'spoke'
        ? 'Direct profile call: Spoke with educator.'
        : disposition === 'no_answer'
        ? 'Direct profile call: No Answer.'
        : disposition === 'voicemail'
        ? 'Direct profile call: Left Voicemail.'
        : disposition === 'bad_number'
        ? 'Direct profile call: Bad Number / Disconnected.'
        : disposition === 'do_not_call'
        ? 'Direct profile call: Flagged Do Not Call.'
        : disposition === 'other'
        ? `Direct profile call (Other): ${customNote || 'Custom outcome recorded.'}`
        : `Direct profile call: ${disposition}.`;

    const noteToRecord = customNote || defaultNote;
    const updatedNotes = NotesService.addNote(lead.notes, noteToRecord);
    await LeadsRepository.updateLeadDisposition(lead.id, disposition, updatedNotes);

    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds,
      disposition,
      note: noteToRecord,
    });

    await loadLeadData();
    showToast(`✓ Logged: ${getDispositionLabel(disposition)}`);
  };

  const handleConfirmCallback = async ({ followUpDateISO, note: noteToRecord }: { followUpDateISO: string; note: string }) => {
    if (!lead) return;
    await HapticsService.success();
    const durationSeconds = callStartTime ? Math.max(0, Math.floor((Date.now() - callStartTime) / 1000)) : 0;
    setCallStartTime(null);
    setShowDispositionRow(false);
    setCallbackModalVisible(false);

    await LeadsRepository.scheduleFollowUp(lead.id, followUpDateISO, noteToRecord);

    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds,
      disposition: 'callback_requested',
      note: noteToRecord,
    });

    await loadLeadData();
    const followUpDate = new Date(followUpDateISO);
    if (!isNaN(followUpDate.getTime())) {
      const dateFormatted = followUpDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeFormatted = followUpDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      showToast(`✓ Callback Scheduled: ${dateFormatted} @ ${timeFormatted}`);
    } else {
      showToast('✓ Callback Scheduled.');
    }
  };

  const toggleOtherChip = (chip: string) => {
    HapticsService.tick().catch(() => {});
    if (otherDispoChips.includes(chip)) {
      setOtherDispoChips(otherDispoChips.filter((c) => c !== chip));
    } else {
      setOtherDispoChips([...otherDispoChips, chip]);
    }
  };

  const handleSaveOtherDispo = () => {
    setOtherModalVisible(false);
    const chipText = otherDispoChips.join('; ');
    const userText = otherDispoNote.trim();
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
    handleLogCallOutcome('other', combinedNote);
  };

  const handleClearCallback = async () => {
    if (!lead) return;
    await HapticsService.medium();

    const doClear = async () => {
      await HapticsService.success();
      setCallbackModalVisible(false);
      const noteText = '[Callback Completed] Follow-up marked complete.';
      await LeadsRepository.clearFollowUp(lead.id, noteText);
      await loadLeadData();
      showToast('✓ Callback completed and cleared from pipeline.');
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm('Mark this scheduled callback as completed?');
      if (confirmed) await doClear();
      return;
    }

    Alert.alert(
      'Complete Callback',
      'Mark this scheduled callback as completed and remove from queue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark Complete', onPress: doClear },
      ]
    );
  };

  const handleWrapUpConverted = async () => {
    if (!lead) return;
    await HapticsService.success();
    const note = '[Sit-Down Wrap-Up] Converted to client after sit-down.';

    await LeadsRepository.recordAppointmentDisposition(lead.id, {
      outcome: 'converted',
      notes: note,
    });

    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds: 0,
      disposition: 'connected',
      note,
    });

    await loadLeadData();
    showToast('★ Converted to Client! Add policy details below.');
  };

  const handleWrapUpProspectDrip = async () => {
    if (!lead) return;
    await HapticsService.success();
    const note = '[Sit-Down Wrap-Up] Enrolled in FRS Prospect Nurture Drip (Day 7 Multiplier).';

    await LeadsRepository.recordAppointmentDisposition(lead.id, {
      outcome: 'nurture_drip',
      notes: note,
    });

    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds: 0,
      disposition: 'connected',
      note,
    });

    await loadLeadData();
    showToast('💬 Enrolled in Prospect Nurture Drip (Track A)');
  };

  const handleConfirmReschedule = async (newDateISO: string, newPeriod?: string) => {
    if (!lead) return;
    await HapticsService.success();
    const note = `[Sit-Down Rescheduled] New sit-down scheduled for ${new Date(newDateISO).toLocaleDateString()} @ ${new Date(newDateISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;

    await LeadsRepository.recordAppointmentDisposition(lead.id, {
      outcome: 'rescheduled',
      newScheduledDate: newDateISO,
      newPlanningPeriod: newPeriod,
      notes: note,
    });

    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds: 0,
      disposition: 'appointment_set',
      note,
    });

    await loadLeadData();
    showToast('📅 Sit-Down Rescheduled!');
  };

  const handleConfirmNoShowOrDeclined = async (outcome: 'no_show' | 'declined') => {
    if (!lead) return;
    await HapticsService.tick();
    const note =
      outcome === 'no_show'
        ? '[Sit-Down Outcome] Educator was a no-show / unavailable during planning.'
        : '[Sit-Down Outcome] Educator declined to proceed with retirement options.';

    await LeadsRepository.recordAppointmentDisposition(lead.id, {
      outcome,
      notes: note,
    });

    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds: 0,
      disposition: outcome === 'no_show' ? 'no_answer' : 'spoke',
      note,
    });

    await loadLeadData();
    showToast(outcome === 'no_show' ? 'Marked as No-Show' : 'Marked as Declined');
  };

  const openSmsModal = async (targetLead?: Lead | any) => {
    const l = (targetLead && typeof targetLead.id === 'string') ? targetLead : lead;
    if (!l) return;
    await HapticsService.tick();

    if (l.text_ok === false || l.text_ok === (0 as any)) {
      if (Platform.OS === 'web') {
        const proceed =
          typeof window !== 'undefined' && window.confirm
            ? window.confirm(
                `SMS Consent Notice: "${l.name}" has marked Text OK: NO on their card. Do you still wish to open the SMS composer?`
              )
            : true;
        if (!proceed) return;
      } else {
        Alert.alert(
          'SMS Consent Notice',
          `"${l.name}" has marked Text OK: NO on their card. Do you still wish to open the SMS composer?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Proceed to SMS',
              style: 'destructive',
              onPress: () => {
                launchSmsComposer(l);
              },
            },
          ]
        );
        return;
      }
    }

    launchSmsComposer(l);
  };

  const launchSmsComposer = async (targetLead: Lead, forcedToneFocus?: any) => {
    const l = targetLead || lead;
    if (!l) return;

    const settings = await SettingsRepository.getSettings();
    const agentName = settings?.user_name || 'Alex';

    const hasAppt = Boolean(l.appointment_scheduled_at) || l.last_disposition === 'appointment_set';
    const effectiveTone = forcedToneFocus || (hasAppt ? 'meeting_confirmation' : undefined);

    const initialDraft = AiSmsService.getSmartFallbackSMS(l, agentName, effectiveTone);
    userEditedSmsRef.current = false;
    setSmsBody(initialDraft);
    setSmsModalVisible(true);
    handleGenerateAiSms(effectiveTone, l);
  };

  const handleGenerateAiSms = async (toneFocus?: any, targetLead?: Lead) => {
    const l = targetLead || lead;
    if (!l) return;
    setIsGeneratingAi(true);
    try {
      const hasAppt = Boolean(l.appointment_scheduled_at) || l.last_disposition === 'appointment_set';
      const effectiveTone = toneFocus || (hasAppt ? 'meeting_confirmation' : undefined);
      const effectiveDispo = hasAppt ? 'appointment_set' : (l.last_disposition || 'follow_up');

      const generated = await AiSmsService.generatePersuasiveSMS(
        l,
        effectiveDispo,
        undefined,
        effectiveTone
      );
      if (generated && generated.trim().length > 0) {
        // Only overwrite if the advisor hasn't manually edited the text, or if they explicitly tapped an AI tone chip
        if (!userEditedSmsRef.current || toneFocus) {
          setSmsBody(generated.trim().replace(/^["']|["']$/g, ''));
          userEditedSmsRef.current = false;
        }
      }
      await HapticsService.success();
    } catch (e) {
      console.warn('AI SMS generation fallback:', e);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSendSms = async () => {
    if (!lead) return;
    const phone = lead.phone;
    const body = smsBody;

    // Launch telephony immediately to preserve iOS Safari touch gesture token
    TelephonyService.sendSMS(phone, body);
    HapticsService.medium().catch(() => {});
    setSmsModalVisible(false);

    // Log the SMS event as a standalone outreach touchpoint
    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds: 0,
      disposition: 'sms_sent',
      note: lead.last_disposition === 'appointment_set' ? 'Sent appointment confirmation SMS' : 'Sent persuasive follow-up SMS',
      smsSent: true,
      smsBody: body,
    });
    loadLeadData();
  };

  // Structured Notes CRUD
  const handleAddNote = async (customText?: string) => {
    if (!lead) return;
    const textToAdd = (customText || noteInputText).trim();
    if (!textToAdd) return;
    await HapticsService.success();
    const updated = NotesService.addNote(lead.notes, textToAdd);
    setLead({ ...lead, notes: updated });
    setNotes(updated);
    await LeadsRepository.updateLeadNotes(lead.id, updated);
    setNoteInputText('');
  };

  const handleStartEditNote = (entry: NoteEntry) => {
    setEditingNoteId(entry.id);
    setEditingNoteText(entry.text);
    setNoteEditModalVisible(true);
  };

  const handleSaveEditNote = async () => {
    if (!lead || !editingNoteId) return;
    await HapticsService.success();
    const updated = NotesService.editNote(lead.notes, editingNoteId, editingNoteText);
    setLead({ ...lead, notes: updated });
    setNotes(updated);
    await LeadsRepository.updateLeadNotes(lead.id, updated);
    setNoteEditModalVisible(false);
    setEditingNoteId(null);
    setEditingNoteText('');
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!lead) return;
    const doDelete = async () => {
      await HapticsService.heavy();
      const updated = NotesService.deleteNote(lead.notes, noteId);
      setLead({ ...lead, notes: updated });
      setNotes(updated);
      await LeadsRepository.updateLeadNotes(lead.id, updated);
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm('Are you sure you want to delete this note?');
      if (confirmed) await doDelete();
      return;
    }

    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };


  const handleDeleteLead = async () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm('Are you sure you want to permanently delete this lead?');
      if (confirmed) {
        await HapticsService.heavy();
        await LeadsRepository.deleteLead(leadId);
        navigation.goBack();
      }
      return;
    }

    Alert.alert('Delete Contact', 'Are you sure you want to permanently delete this lead?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await HapticsService.heavy();
          await LeadsRepository.deleteLead(leadId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!lead) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={{ color: Colors.textMuted }}>Loading contact details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const getDispositionColor = (disp?: CallDisposition | null) => {
    switch (disp) {
      case 'appointment_set':
      case 'connected':
      case 'spoke':
        return Colors.badgeSuccessText;
      case 'callback_requested':
        return Colors.badgeWarningText;
      case 'other':
        return '#8B5CF6';
      case 'no_answer':
      case 'voicemail':
        return Colors.badgeNeutralText;
      case 'bad_number':
      case 'do_not_call':
        return Colors.badgeDangerText;
      default:
        return Colors.brandAccent;
    }
  };

  const getDispositionBg = (disp?: CallDisposition | null) => {
    switch (disp) {
      case 'appointment_set':
      case 'connected':
      case 'spoke':
        return Colors.badgeSuccessBg;
      case 'callback_requested':
        return Colors.badgeWarningBg;
      case 'other':
        return 'rgba(139, 92, 246, 0.15)';
      case 'no_answer':
      case 'voicemail':
        return Colors.badgeNeutralBg;
      case 'bad_number':
      case 'do_not_call':
        return Colors.badgeDangerBg;
      default:
        return Colors.surfaceSubtle;
    }
  };

  const getDispositionLabel = (disp?: CallDisposition | null) => {
    switch (disp) {
      case 'appointment_set':
        return '🎯 APPT. SET';
      case 'connected':
      case 'spoke':
        return '💬 SPOKE / CONNECTED';
      case 'callback_requested':
        return '📅 CALLBACK';
      case 'other':
        return '📋 OTHER / NOTED';
      case 'no_answer':
        return '📞 NO ANSWER';
      case 'voicemail':
        return '📼 VOICEMAIL';
      case 'do_not_call':
        return '🛡️ DO NOT CALL';
      case 'bad_number':
        return '⚠️ BAD NUMBER';
      default:
        return 'READY TO CALL';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Educator Profile</Text>
        <TouchableOpacity
          onPress={() => {
            if (!isEditing && lead) {
              setName(lead.name);
              setPhone(lead.phone);
              setSchool(lead.school || '');
              setEmail(lead.email || '');
              setRoomNumber(lead.room_number || '');
              setPlanningPeriod(lead.planning_period || '');
              setYearsInFrs(lead.years_in_frs || '');
              setNotes(lead.notes || '');
              setPriorityTier(lead.priority_tier || 1);
              setListIdVal(lead.list_id || 'master_queue');
              setIsFrsVal(lead.is_frs !== false);
            }
            setIsEditing(!isEditing);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.editLink}>{isEditing ? 'Cancel' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <View style={styles.toastBanner}>
          <Text style={styles.toastBannerText}>{toastMessage}</Text>
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 85 }}>
        {/* Main Card */}
        <View style={styles.profileCard}>
          {!isEditing ? (
            <>
              <View style={styles.profileTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nameText}>{lead.name}</Text>
                  <Text style={styles.phoneText}>{lead.phone}</Text>
                  {lead.email ? <Text style={styles.emailText}>{lead.email}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {lead.is_client && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: 'rgba(16, 185, 129, 0.18)',
                        borderColor: '#10B981',
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        gap: 4,
                      }}
                    >
                      <Award size={11} color="#10B981" />
                      <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>
                        ★ CLIENT
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={lead.priority_tier === 3 ? styles.detailLegacyBadge : styles.detailFreshBadge}
                    onPress={handleTogglePriority}
                    activeOpacity={0.8}
                  >
                    {lead.priority_tier === 3 ? (
                      <>
                        <Archive size={11} color="#94A3B8" />
                        <Text style={styles.detailLegacyBadgeText}>Legacy (Tap to toggle)</Text>
                      </>
                    ) : (
                      <>
                        <Flame size={11} color={Colors.heavenlyGold} />
                        <Text style={styles.detailFreshBadgeText}>Fresh (Tap to toggle)</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* FRS vs Non-FRS Interactive Toggle */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: lead.is_frs !== false ? 'rgba(139, 92, 246, 0.18)' : 'rgba(59, 130, 246, 0.18)',
                      borderColor: lead.is_frs !== false ? '#8B5CF6' : '#3B82F6',
                      borderWidth: 1,
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      minHeight: 28,
                      gap: 4,
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={handleToggleFrs}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={lead.is_frs !== false ? "FRS Member, tap to mark as Non-FRS" : "Non-FRS Client, tap to mark as FRS"}
                  >
                    {lead.is_frs !== false ? (
                      <>
                        <Landmark size={12} color="#C084FC" />
                        <Text style={{ color: '#C084FC', fontSize: 11, fontWeight: '800' }}>
                          🏛️ FRS Member
                        </Text>
                      </>
                    ) : (
                      <>
                        <Briefcase size={12} color="#60A5FA" />
                        <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '800' }}>
                          💼 Non-FRS
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getDispositionBg(lead.last_disposition) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: getDispositionColor(lead.last_disposition) },
                      ]}
                    >
                      {getDispositionLabel(lead.last_disposition)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* DNC Status Banner if opted-out */}
              {isDNC && (
                <View style={styles.dncWarningBox}>
                  <ShieldAlert size={18} color="#EF4444" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dncWarningTitle}>DO NOT CALL (DNC COMPLIANCE)</Text>
                    <Text style={styles.dncWarningText}>
                      This contact has requested not to be called. They have been permanently removed from all active dialing queues.
                    </Text>
                  </View>
                </View>
              )}

              {/* School / Organization & Pension Info */}
              <View style={styles.frsInfoBox}>
                <View style={styles.infoRow}>
                  {lead.is_frs !== false ? (
                    <School size={16} color="#38BDF8" />
                  ) : (
                    <Building size={16} color="#38BDF8" />
                  )}
                  <Text style={styles.infoText}>
                    {lead.school || (lead.is_frs !== false ? 'VOL' : 'General Client')}
                    {lead.room_number ? ` • Room ${lead.room_number}` : ''}
                    {lead.planning_period ? ` • Best time: ${lead.planning_period}` : ''}
                  </Text>
                </View>

                <View style={[styles.infoRow, { marginTop: 6 }]}>
                  {lead.is_frs !== false ? (
                    <GraduationCap size={16} color="#38BDF8" />
                  ) : (
                    <Briefcase size={16} color="#38BDF8" />
                  )}
                  <Text style={styles.infoText}>
                    {lead.is_frs !== false
                      ? (lead.years_in_frs ? `${lead.years_in_frs} Years in FRS` : 'FRS Member')
                      : 'Non-FRS Retirement Client'}
                    {lead.age ? ` • Age ${lead.age}` : ''}
                    {lead.frs_knowledge ? ` • Info: "${lead.frs_knowledge}"` : ''}
                  </Text>
                </View>

                {lead.email ? (
                  <View style={[styles.infoRow, { marginTop: 6 }]}>
                    <Mail size={16} color={Colors.heavenlyGold} />
                    <TouchableOpacity
                      onPress={() => {
                        if (typeof window !== 'undefined' && lead.email) {
                          window.open(`mailto:${lead.email}`);
                        }
                      }}
                    >
                      <Text style={[styles.infoText, { color: Colors.heavenlyGold, textDecorationLine: 'underline' }]}>
                        {lead.email}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {/* Dynamic Bell Schedule Planning Period Badge */}
              {lead.planning_period ? (() => {
                const pInfo = isTeacherInPlanningNow(lead.planning_period, lead.school);
                return (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: pInfo.inPlanning ? 'rgba(34, 197, 94, 0.18)' : 'rgba(212, 160, 23, 0.12)',
                      borderWidth: 1,
                      borderColor: pInfo.inPlanning ? '#22C55E' : Colors.borderGold,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      marginTop: 10,
                    }}
                  >
                    <Clock size={16} color={pInfo.inPlanning ? '#4ADE80' : Colors.heavenlyGold} />
                    <Text
                      style={{
                        fontSize: 13,
                        color: pInfo.inPlanning ? '#4ADE80' : Colors.heavenlyGold,
                        fontWeight: pInfo.inPlanning ? '700' : '600',
                        flex: 1,
                        flexShrink: 1,
                      }}
                    >
                      {pInfo.inPlanning
                        ? `🟢 IN PLANNING PERIOD NOW (${pInfo.displayTime}) — Prime Calling Window!`
                        : `Planning Window: ${lead.planning_period}${pInfo.displayTime ? ` (${pInfo.displayTime})` : ''}`}
                    </Text>
                  </View>
                );
              })() : null}

              {/* FRS Needs / Checkboxes */}
              {lead.frs_interests && lead.frs_interests.length > 0 && (
                <View style={styles.interestsBox}>
                  <Text style={styles.interestsHeader}>REPORT CARD NEEDS & INQUIRIES:</Text>
                  {lead.frs_interests.map((interest, i) => (
                    <View key={i} style={styles.interestRow}>
                      <Check size={14} color="#10B981" />
                      <Text style={styles.interestText}>{interest}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Custom Written Questions */}
              {lead.custom_questions ? (
                <View style={styles.customQuestionBox}>
                  <HelpCircle size={14} color="#F59E0B" />
                  <Text style={styles.customQuestionText}>
                    Question: "{lead.custom_questions}"
                  </Text>
                </View>
              ) : null}

              {/* Meeting Time Preferences */}
              {lead.meeting_preferences && lead.meeting_preferences.length > 0 && (
                <View style={styles.meetingPrefsBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Calendar size={14} color="#8B5CF6" />
                    <Text style={styles.meetingPrefsTitle}>PREFERRED MEETING AVAILABILITY:</Text>
                  </View>
                  {lead.meeting_preferences.map((pref, i) => (
                    <Text key={i} style={styles.prefText}>• {pref}</Text>
                  ))}
                </View>
              )}

              {/* Confirmed Sit-Down 1-Tap Calendar Card */}
              {lead.last_disposition === 'appointment_set' && (() => {
                const scheduledDate = lead.appointment_scheduled_at
                  ? new Date(lead.appointment_scheduled_at)
                  : CalendarService.calculateNextPlanningDate(
                      lead.planning_period,
                      lead.school
                    );
                const dateStr = scheduledDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                });
                const timeStr = scheduledDate.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                });

                return (
                  <View
                    style={{
                      backgroundColor: 'rgba(212, 160, 23, 0.12)',
                      borderColor: Colors.borderGold,
                      borderWidth: 1.5,
                      borderRadius: 14,
                      padding: 14,
                      marginVertical: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Calendar size={16} color={Colors.heavenlyGold} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.heavenlyGold, letterSpacing: 0.5 }}>
                        CONFIRMED SIT-DOWN • 1-TAP CALENDAR SYNC
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: Colors.textPrimary, marginBottom: 10, lineHeight: 17 }}>
                      Target Window: <Text style={{ fontWeight: '800' }}>{dateStr} @ {timeStr}</Text> ({lead.planning_period || 'Planning Period'}) in Room {lead.room_number || 'Classroom'}.
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          minWidth: 130,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: Colors.bgDark,
                          borderColor: Colors.borderGold,
                          borderWidth: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          gap: 6,
                        }}
                        onPress={async () => {
                          HapticsService.medium();
                          const event = CalendarService.buildEducatorEvent(lead, scheduledDate, 25, lead.notes);
                          await CalendarService.downloadIcsFile(event);
                        }}
                      >
                        <Text style={{ color: Colors.heavenlyGold, fontSize: 12, fontWeight: '700' }}>
                          🍏 Apple / iCal (.ics)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          minWidth: 130,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: Colors.bgDark,
                          borderColor: '#38BDF8',
                          borderWidth: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          gap: 6,
                        }}
                        onPress={() => {
                          HapticsService.medium();
                          const event = CalendarService.buildEducatorEvent(lead, scheduledDate, 25, lead.notes);
                          CalendarService.openGoogleCalendar(event);
                        }}
                      >
                        <Text style={{ color: '#38BDF8', fontSize: 12, fontWeight: '700' }}>
                          🌐 Google Calendar
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          width: '100%',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(56, 189, 248, 0.14)',
                          borderColor: '#38BDF8',
                          borderWidth: 1.5,
                          paddingVertical: 11,
                          borderRadius: 10,
                          gap: 6,
                          marginTop: 2,
                        }}
                        onPress={() => {
                          HapticsService.medium();
                          launchSmsComposer(lead, 'meeting_confirmation');
                        }}
                      >
                        <MessageSquare size={16} color="#38BDF8" />
                        <Text style={{ color: '#38BDF8', fontSize: 13, fontWeight: '800' }}>
                          📱 Send Time-Aware Confirmation SMS
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          width: '100%',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: Colors.bgDark,
                          borderColor: Colors.borderGold,
                          borderWidth: 1.5,
                          paddingVertical: 10,
                          borderRadius: 10,
                          gap: 6,
                          marginTop: 2,
                        }}
                        onPress={() => {
                          HapticsService.medium();
                          setApptSchedulerVisible(true);
                        }}
                      >
                        <Text style={{ color: Colors.heavenlyGold, fontSize: 13, fontWeight: '800' }}>
                          ✏️ Reschedule / Change Sit-Down Time
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          width: '100%',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(212, 160, 23, 0.14)',
                          borderColor: Colors.borderGold,
                          borderWidth: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          gap: 6,
                          marginTop: 2,
                        }}
                        onPress={() => {
                          HapticsService.medium();
                          openSchedulerModalWithContext(
                            lead.is_client ? 'Annual Client Review' : 'New Sit-Down Meeting',
                            lead.is_client ? 'annual_review' : 'general_sitdown'
                          );
                        }}
                      >
                        <Calendar size={14} color={Colors.heavenlyGold} />
                        <Text style={{ color: Colors.heavenlyGold, fontSize: 13, fontWeight: '800' }}>
                          📅 Book Another / Additional Meeting
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

              {/* Direct Sit-Down & Client Review Scheduler Entrypoint (When No Confirmed Appt Active) */}
              {lead.last_disposition !== 'appointment_set' && (
                <View
                  style={{
                    backgroundColor: 'rgba(212, 160, 23, 0.10)',
                    borderColor: Colors.borderGold,
                    borderWidth: 1.5,
                    borderRadius: 14,
                    padding: 14,
                    marginVertical: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Calendar size={16} color={Colors.heavenlyGold} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.heavenlyGold, letterSpacing: 0.5 }}>
                        {lead.is_client ? 'SCHEDULE CLIENT REVIEW / SIT-DOWN' : 'SCHEDULE SIT-DOWN MEETING'}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: 'rgba(56, 189, 248, 0.16)',
                        borderColor: '#38BDF8',
                        borderWidth: 1,
                        borderRadius: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#38BDF8' }}>ANYTIME</Text>
                    </View>
                  </View>

                  <Text style={{ fontSize: 12, color: Colors.textPrimary, marginBottom: 10, lineHeight: 17 }}>
                    {lead.is_client
                      ? 'Schedule an annual review, product enhancement/update, or in-person consultation for whenever you like.'
                      : 'Lock in a confirmed sit-down for FRS retirement review, 403(b) illustration, or classroom consultation.'}
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        minWidth: 140,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: Colors.brandAccent,
                        paddingVertical: 11,
                        borderRadius: 10,
                        gap: 6,
                      }}
                      onPress={() => {
                        HapticsService.medium();
                        openSchedulerModalWithContext(
                          lead.is_client ? 'Annual Client Review' : 'Confirmed Sit-Down',
                          lead.is_client ? 'annual_review' : 'frs_review'
                        );
                      }}
                      activeOpacity={0.8}
                    >
                      <Calendar size={15} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>
                        {lead.is_client ? '📅 Book Annual Review' : '📅 Book Sit-Down'}
                      </Text>
                    </TouchableOpacity>

                    {lead.is_client ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          minWidth: 140,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(56, 189, 248, 0.14)',
                          borderColor: '#38BDF8',
                          borderWidth: 1.5,
                          paddingVertical: 11,
                          borderRadius: 10,
                          gap: 6,
                        }}
                        onPress={() => {
                          HapticsService.medium();
                          openSchedulerModalWithContext(
                            'Product Enhancement & Policy Update',
                            'product_enhancement'
                          );
                        }}
                        activeOpacity={0.8}
                      >
                        <Sparkles size={15} color="#38BDF8" />
                        <Text style={{ color: '#38BDF8', fontSize: 13, fontWeight: '800' }}>
                          🚀 Product Update
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          minWidth: 140,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: Colors.bgDark,
                          borderColor: Colors.borderGold,
                          borderWidth: 1.5,
                          paddingVertical: 11,
                          borderRadius: 10,
                          gap: 6,
                        }}
                        onPress={() => {
                          HapticsService.medium();
                          openSchedulerModalWithContext(
                            'General Retirement Consultation',
                            'general_sitdown'
                          );
                        }}
                        activeOpacity={0.8}
                      >
                        <Clock size={15} color={Colors.heavenlyGold} />
                        <Text style={{ color: Colors.heavenlyGold, fontSize: 13, fontWeight: '800' }}>
                          ☕ Custom Meeting
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Scheduled Callback Reminder Card */}
              {(lead.last_disposition === 'callback_requested' || !!lead.follow_up_at) && lead.last_disposition !== 'appointment_set' && (() => {
                const followUpDate = lead.follow_up_at && !isNaN(new Date(lead.follow_up_at).getTime())
                  ? new Date(lead.follow_up_at)
                  : null;

                if (!followUpDate && lead.last_disposition !== 'callback_requested') {
                  return null;
                }

                const now = new Date();
                const isOverdue = followUpDate ? followUpDate.getTime() < now.getTime() : false;
                const isToday = followUpDate ? followUpDate.toDateString() === now.toDateString() : false;
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const isTomorrow = followUpDate ? followUpDate.toDateString() === tomorrow.toDateString() : false;

                let relativeTimeStr = '';
                if (followUpDate) {
                  const diffMs = followUpDate.getTime() - now.getTime();
                  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
                  const diffMins = Math.round(diffMs / (1000 * 60));

                  if (isOverdue) {
                    const overdueMins = Math.abs(diffMins);
                    relativeTimeStr = overdueMins < 60 ? `${overdueMins}m overdue` : `${Math.abs(diffHours)}h overdue`;
                  } else if (isToday) {
                    relativeTimeStr = diffMins < 60 ? `In ${diffMins} mins` : `Today at ${followUpDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                  } else if (isTomorrow) {
                    relativeTimeStr = `Tomorrow at ${followUpDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                  } else {
                    relativeTimeStr = followUpDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
                      ` at ${followUpDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                  }
                } else {
                  relativeTimeStr = 'Pending Scheduling';
                }

                // Extract latest callback note
                const parsedNotes = NotesService.parseNotes(lead.notes);
                const latestCallbackNote = parsedNotes.find((n) => 
                  n.text.toLowerCase().includes('callback') || n.text.toLowerCase().includes('follow-up')
                )?.text || parsedNotes[0]?.text;

                return (
                  <View style={styles.callbackCardContainer}>
                    <View style={styles.callbackCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                        <Calendar size={16} color={isOverdue ? Colors.badgeDangerText : Colors.badgeWarningText} />
                        <Text style={[styles.callbackCardTitle, isOverdue && { color: Colors.badgeDangerText }]} numberOfLines={1}>
                          SCHEDULED CALLBACK REMINDER
                        </Text>
                      </View>
                      <View style={[styles.callbackStatusPill, isOverdue ? styles.callbackPillOverdue : styles.callbackPillDue]}>
                        <Text style={[styles.callbackStatusPillText, isOverdue ? styles.callbackPillOverdueText : styles.callbackPillDueText]}>
                          {isOverdue ? '🔴 OVERDUE' : isToday ? '🟡 TODAY' : '🟢 SCHEDULED'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.callbackTimeRow}>
                      <Text style={styles.callbackTimePrimary}>
                        {followUpDate
                          ? `${followUpDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} @ ${followUpDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                          : 'Callback Requested'}
                      </Text>
                      <Text style={[styles.callbackTimeRelative, isOverdue && { color: Colors.badgeDangerText, fontWeight: '700' }]}>
                        ({relativeTimeStr})
                      </Text>
                    </View>

                    {lead.planning_period && (
                      <View style={styles.callbackPlanningContextRow}>
                        <Clock size={13} color={Colors.brandAccent} />
                        <Text style={styles.callbackPlanningContextText}>
                          Educator Planning: {lead.planning_period} ({lead.school || 'School'})
                        </Text>
                      </View>
                    )}

                    {latestCallbackNote ? (
                      <View style={styles.callbackNoteBox}>
                        <FileText size={13} color={Colors.textSecondary} />
                        <Text style={styles.callbackNoteText} numberOfLines={2}>
                          "{latestCallbackNote}"
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.callbackActionsRow}>
                      <TouchableOpacity
                        style={styles.callbackCallNowBtn}
                        onPress={handleCall}
                        activeOpacity={0.8}
                      >
                        <PhoneCall size={14} color="#FFFFFF" />
                        <Text style={styles.callbackCallNowBtnText}>Call Now</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.callbackRescheduleBtn}
                        onPress={() => {
                          HapticsService.medium();
                          setCallbackModalVisible(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <Edit3 size={14} color={Colors.brandAccent} />
                        <Text style={styles.callbackRescheduleBtnText}>Reschedule</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.callbackClearBtn}
                        onPress={handleClearCallback}
                        activeOpacity={0.8}
                      >
                        <Check size={14} color={Colors.badgeSuccessText} />
                        <Text style={styles.callbackClearBtnText}>Complete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

              {/* Proof of Contact / View Scanned Sheet Button */}
              <TouchableOpacity
                style={styles.proofButton}
                onPress={() => {
                  HapticsService.tick();
                  setImageModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <FileCheck size={16} color="#38BDF8" />
                <Text style={styles.proofButtonText}>View Original Report Card (Proof of Request)</Text>
                <Eye size={16} color="#38BDF8" />
              </TouchableOpacity>

              {/* Post-Appointment Sit-Down Wrap-Up Card */}
              <PostApptWrapUpCard
                lead={lead}
                onConverted={handleWrapUpConverted}
                onNurtureDrip={handleWrapUpProspectDrip}
                onReschedule={handleConfirmReschedule}
                onNoShowOrDeclined={handleConfirmNoShowOrDeclined}
              />

              {/* Client Portfolio & Policy Card */}
              <ClientPortfolioCard
                key={`portfolio_${lead.id}_${lead.is_client ? 1 : 0}_${lead.appointment_outcome || ''}_${lead.updated_at || ''}`}
                lead={lead}
                onScheduleReview={(purpose, targetDate) => {
                  openSchedulerModalWithContext(
                    purpose === 'annual_review' ? 'Annual Client Review' : 'Product Enhancement & Update',
                    purpose,
                    targetDate
                  );
                }}
                onSave={async (portfolioUpdates) => {
                  const isNowClient = Boolean(portfolioUpdates.is_client);
                  const isDripNurture = portfolioUpdates.drip_track === 'prospect_nurture';
                  const hadApptSet = lead.last_disposition === 'appointment_set';
                  const nowISO = new Date().toISOString();

                  let syncOutcome = portfolioUpdates.appointment_outcome !== undefined ? portfolioUpdates.appointment_outcome : lead.appointment_outcome;
                  let syncCompletedAt = portfolioUpdates.appointment_completed_at !== undefined ? portfolioUpdates.appointment_completed_at : lead.appointment_completed_at;
                  let syncDisposition = portfolioUpdates.last_disposition || lead.last_disposition;

                  if (isNowClient) {
                    const hasActiveAppt = hadApptSet && Boolean(lead.appointment_scheduled_at);
                    if (!hasActiveAppt) {
                      syncOutcome = 'converted';
                      syncCompletedAt = syncCompletedAt || nowISO;
                      if (hadApptSet) syncDisposition = 'connected';
                    }
                  } else if (isDripNurture && hadApptSet) {
                    if (!syncOutcome) syncOutcome = 'nurture_drip';
                    syncCompletedAt = syncCompletedAt || nowISO;
                    syncDisposition = 'connected';
                  }

                  await LeadsRepository.updateLeadDetails({
                    id: lead.id,
                    name: lead.name,
                    phone: lead.phone,
                    school: lead.school,
                    ...portfolioUpdates,
                    appointment_outcome: syncOutcome,
                    appointment_completed_at: syncCompletedAt,
                    last_disposition: syncDisposition,
                  });
                  await loadLeadData();
                  showToast(isNowClient ? '★ Converted to Client & Appointment Resolved' : '✓ Portfolio & Drip Cadence Saved');
                }}
              />

              {/* Educator Structured Notes Card */}
              <View style={styles.detailNotesCard}>
                <View style={styles.detailNotesHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <FileText size={15} color={Colors.heavenlyGold} />
                    <Text style={styles.detailNotesTitle}>CLASSROOM & ADVISOR NOTES</Text>
                  </View>
                  <View style={styles.notesCountBadge}>
                    <Text style={styles.notesCountBadgeText}>
                      {NotesService.parseNotes(lead.notes).length} Notes
                    </Text>
                  </View>
                </View>

                {/* Notes List */}
                {NotesService.parseNotes(lead.notes).length > 0 ? (
                  <View style={styles.detailNotesList}>
                    {NotesService.parseNotes(lead.notes).map((entry) => (
                      <View key={entry.id} style={styles.detailNoteItem}>
                        <View style={styles.detailNoteItemHeader}>
                          <View style={styles.detailNoteTimestamp}>
                            <Clock size={11} color={Colors.heavenlyGold} />
                            <Text style={styles.detailNoteTimestampText}>{entry.timestamp}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={styles.detailNoteActionBtn}
                              onPress={() => handleStartEditNote(entry)}
                            >
                              <Edit3 size={13} color={Colors.deepSkyBlueLight} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.detailNoteActionBtn}
                              onPress={() => handleDeleteNote(entry.id)}
                            >
                              <Trash2 size={13} color={Colors.statusDangerText} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={styles.detailNoteBody}>{entry.text}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.detailNotesEmptyText}>No educator notes recorded yet.</Text>
                )}

                {/* Quick Add Note Section */}
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: Colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                    QUICK TAGS:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 34, marginBottom: 8 }}>
                    {EDUCATOR_QUICK_TAGS.map((tag, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.quickTagDetailPill}
                        onPress={() => handleAddNote(tag)}
                      >
                        <Text style={styles.quickTagDetailText}>+ {tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <View style={styles.addNoteInputRow}>
                    <TextInput
                      style={styles.addNoteInput}
                      value={noteInputText}
                      onChangeText={setNoteInputText}
                      placeholder="Add relevant classroom or FRS note..."
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity
                      style={[styles.addNoteButton, !noteInputText.trim() && { opacity: 0.5 }]}
                      onPress={() => handleAddNote()}
                      disabled={!noteInputText.trim()}
                    >
                      <Plus size={14} color="#FFFFFF" />
                      <Text style={styles.addNoteButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 1-Tap Calendar Piping Card */}
              <View style={styles.calCardContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Calendar size={14} color={Colors.heavenlyGold} />
                  <Text style={styles.calCardHeader}>PIPE TO PERSONAL CALENDAR (15-MIN PRE-ALARM)</Text>
                </View>
                {(() => {
                  const targetDate = lead.appointment_scheduled_at
                    ? new Date(lead.appointment_scheduled_at)
                    : CalendarService.calculateNextPlanningDate(lead.planning_period, lead.school);

                  return (
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <TouchableOpacity
                        style={styles.calDetailBtn}
                        onPress={async () => {
                          HapticsService.medium();
                          const event = CalendarService.buildEducatorEvent(lead, targetDate, 20, lead.notes);
                          await CalendarService.downloadIcsFile(event);
                        }}
                      >
                        <Text style={styles.calDetailBtnText}>🍏 Apple (.ics)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.calDetailBtn, { borderColor: '#38BDF8' }]}
                        onPress={() => {
                          HapticsService.medium();
                          const event = CalendarService.buildEducatorEvent(lead, targetDate, 20, lead.notes);
                          CalendarService.openGoogleCalendar(event);
                        }}
                      >
                        <Text style={[styles.calDetailBtnText, { color: '#38BDF8' }]}>🌐 Google Cal</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.calDetailBtn, { borderColor: '#A78BFA' }]}
                        onPress={() => {
                          HapticsService.medium();
                          const event = CalendarService.buildEducatorEvent(lead, targetDate, 20, lead.notes);
                          CalendarService.openOutlookCalendar(event);
                        }}
                      >
                        <Text style={[styles.calDetailBtnText, { color: '#A78BFA' }]}>📧 Outlook</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>


              {/* Post-Call Outcome Logging Strip */}
              {showDispositionRow && (
                <View style={styles.detailDispositionSection}>
                  <View style={styles.detailDispositionHeader}>
                    <Text style={styles.detailDispositionTitle}>LOG CALL OUTCOME (1-TAP)</Text>
                    <TouchableOpacity onPress={() => setShowDispositionRow(false)}>
                      <Text style={styles.detailDispositionDismiss}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.detailDispositionGrid}>
                    <TouchableOpacity
                      style={[styles.detailDispBtn, { backgroundColor: Colors.badgeSuccessBg, borderColor: Colors.badgeSuccessText }]}
                      onPress={() => handleLogCallOutcome('appointment_set')}
                    >
                      <Text style={[styles.detailDispBtnText, { color: Colors.badgeSuccessText }]}>🎯 Appt Set</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.detailDispBtn, { backgroundColor: Colors.badgeSuccessBg, borderColor: Colors.badgeSuccessText }]}
                      onPress={() => handleLogCallOutcome('connected')}
                    >
                      <Text style={[styles.detailDispBtnText, { color: Colors.badgeSuccessText }]}>💬 Connected</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.detailDispBtn, { backgroundColor: Colors.badgeWarningBg, borderColor: Colors.badgeWarningText }]}
                      onPress={() => handleLogCallOutcome('voicemail')}
                    >
                      <Text style={[styles.detailDispBtnText, { color: Colors.badgeWarningText }]}>📼 Left VM</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.detailDispBtn, { backgroundColor: Colors.badgeNeutralBg, borderColor: Colors.borderStrong }]}
                      onPress={() => handleLogCallOutcome('no_answer')}
                    >
                      <Text style={[styles.detailDispBtnText, { color: Colors.badgeNeutralText }]}>📞 No Answer</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.detailDispBtn, { backgroundColor: Colors.badgeWarningBg, borderColor: Colors.badgeWarningText }]}
                      onPress={() => handleLogCallOutcome('callback_requested')}
                    >
                      <Text style={[styles.detailDispBtnText, { color: Colors.badgeWarningText }]}>📅 Callback</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.detailDispBtn, { backgroundColor: 'rgba(139, 92, 246, 0.12)', borderColor: '#8B5CF6' }]}
                      onPress={() => handleLogCallOutcome('other')}
                    >
                      <Text style={[styles.detailDispBtnText, { color: '#8B5CF6' }]}>📋 Other...</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.detailDispBtn, { backgroundColor: Colors.badgeDangerBg, borderColor: Colors.badgeDangerText }]}
                      onPress={() => handleLogCallOutcome('do_not_call')}
                    >
                      <Text style={[styles.detailDispBtnText, { color: Colors.badgeDangerText }]}>🛡️ DNC</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.detailDispBtn, { backgroundColor: Colors.badgeNeutralBg, borderColor: Colors.badgeWarningText }]}
                      onPress={() => handleLogCallOutcome('bad_number')}
                    >
                      <Text style={[styles.detailDispBtnText, { color: Colors.badgeWarningText }]}>⚠️ Bad #</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          ) : (
            /* Edit Form */
            <View style={styles.editForm}>
              <Text style={styles.fieldLabel}>Contact Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Client Type / Retirement System</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.tierEditBtn,
                    isFrsVal && {
                      backgroundColor: 'rgba(139, 92, 246, 0.18)',
                      borderColor: '#8B5CF6',
                    },
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    setIsFrsVal(true);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Set Client Type as FRS Member"
                >
                  <Landmark size={15} color={isFrsVal ? '#C084FC' : Colors.brandAccent} />
                  <Text style={[styles.tierEditBtnText, isFrsVal && { color: '#C084FC', fontWeight: '800' }]}>
                    🏛️ FRS Member
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.tierEditBtn,
                    !isFrsVal && {
                      backgroundColor: 'rgba(59, 130, 246, 0.18)',
                      borderColor: '#3B82F6',
                    },
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    setIsFrsVal(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Set Client Type as Non-FRS Client"
                >
                  <Briefcase size={15} color={!isFrsVal ? '#60A5FA' : Colors.textMuted} />
                  <Text style={[styles.tierEditBtnText, !isFrsVal && { color: '#60A5FA', fontWeight: '800' }]}>
                    💼 Non-FRS Client
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Email Address (School / Personal)</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="e.g. teacher@volusia.k12.fl.us"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>School / District</Text>
              <TextInput style={styles.input} value={school} onChangeText={setSchool} placeholder="e.g. Deltona High" placeholderTextColor={Colors.textMuted} />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Room Number</Text>
              <TextInput style={styles.input} value={roomNumber} onChangeText={setRoomNumber} placeholder="e.g. 4-102" placeholderTextColor={Colors.textMuted} />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Planning Period</Text>
              <TextInput style={styles.input} value={planningPeriod} onChangeText={setPlanningPeriod} placeholder="e.g. 3rd Period (10:15 - 11:05 AM)" placeholderTextColor={Colors.textMuted} />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Years in FRS</Text>
              <TextInput style={styles.input} value={yearsInFrs} onChangeText={setYearsInFrs} />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Calling Queue Priority Tier</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.tierEditBtn,
                    priorityTier === 1 && styles.tierEditBtnActiveFresh,
                  ]}
                  onPress={() => setPriorityTier(1)}
                >
                  <Flame size={14} color={priorityTier === 1 ? Colors.badgeSuccessText : Colors.brandAccent} />
                  <Text style={[styles.tierEditBtnText, priorityTier === 1 && { color: Colors.badgeSuccessText, fontWeight: '800' }]}>
                    Fresh Priority
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.tierEditBtn,
                    priorityTier === 3 && styles.tierEditBtnActiveLegacy,
                  ]}
                  onPress={() => setPriorityTier(3)}
                >
                  <Archive size={14} color={priorityTier === 3 ? Colors.textPrimary : Colors.textMuted} />
                  <Text style={[styles.tierEditBtnText, priorityTier === 3 && { color: Colors.textPrimary, fontWeight: '800' }]}>
                    Legacy Archive
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Campaign List</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[
                      styles.listSelectChip,
                      listIdVal === 'master_queue' && styles.listSelectChipActive,
                    ]}
                    onPress={() => setListIdVal('master_queue')}
                  >
                    <Layers size={12} color={listIdVal === 'master_queue' ? '#FFFFFF' : Colors.brandAccent} />
                    <Text style={[styles.listSelectChipText, listIdVal === 'master_queue' && styles.listSelectChipTextActive]}>
                      Master Pipeline
                    </Text>
                  </TouchableOpacity>
                  {availableLists.map((lst) => (
                    <TouchableOpacity
                      key={lst.id}
                      style={[
                        styles.listSelectChip,
                        listIdVal === lst.id && styles.listSelectChipActive,
                      ]}
                      onPress={() => setListIdVal(lst.id)}
                    >
                      <Text style={[styles.listSelectChipText, listIdVal === lst.id && styles.listSelectChipTextActive]}>
                        {lst.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <TouchableOpacity style={styles.saveEditButton} onPress={handleSaveEdit}>
                <Save size={18} color="#FFFFFF" />
                <Text style={styles.saveEditText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Call Attempt History Timeline */}
        <Text style={styles.sectionHeader}>CALL ATTEMPT HISTORY ({logs.length})</Text>

        {logs.length === 0 ? (
          <View style={styles.emptyLogsCard}>
            <Clock size={24} color="#64748B" />
            <Text style={styles.emptyLogsText}>No call attempts logged for this contact yet.</Text>
          </View>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logHeader}>
                <View style={styles.logHeaderLeft}>
                  <CheckCircle2 size={16} color={getDispositionColor(log.disposition)} />
                  <Text style={styles.logDisposition}>
                    {log.disposition.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.logTimestamp}>
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                  {new Date(log.timestamp).toLocaleDateString()}
                </Text>
              </View>

              {log.duration_seconds > 0 && (
                <Text style={styles.logDuration}>
                  Talk Time: {Math.floor(log.duration_seconds / 60)}m {log.duration_seconds % 60}s
                </Text>
              )}

              {log.note && <Text style={styles.logNote}>"{log.note}"</Text>}

              {log.sms_sent && (
                <View style={styles.smsSentBox}>
                  <MessageSquare size={12} color="#3B82F6" />
                  <Text style={styles.smsSentText}>SMS Delivered: "{log.sms_body}"</Text>
                </View>
              )}
            </View>
          ))
        )}

        {/* Delete Contact Button */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteLead}>
          <Trash2 size={16} color="#EF4444" />
          <Text style={styles.deleteButtonText}>Delete Contact</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sticky Bottom Communications Dock */}
      {lead && !isEditing && (
        <View style={styles.stickyBottomDock}>
          <TouchableOpacity
            style={styles.stickyCallButton}
            onPress={handleCall}
            activeOpacity={0.8}
          >
            <PhoneCall size={18} color="#FFFFFF" />
            <Text style={styles.stickyCallButtonText}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.stickyDispoButton,
              showDispositionRow && styles.stickyDispoButtonActive,
            ]}
            onPress={() => {
              HapticsService.tick();
              setShowDispositionRow((prev) => !prev);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Toggle disposition deck"
          >
            <ClipboardList size={18} color={showDispositionRow ? '#FFFFFF' : '#8B5CF6'} />
            <Text style={[styles.stickyDispoButtonText, showDispositionRow && styles.stickyDispoButtonTextActive]}>
              Dispo
            </Text>
          </TouchableOpacity>

          {/* Dedicated Sit-Down & Review Scheduler Button on Dock */}
          <TouchableOpacity
            style={[
              styles.stickyApptButton,
              lead.last_disposition === 'appointment_set' && styles.stickyApptButtonActive,
            ]}
            onPress={() => {
              HapticsService.medium();
              openSchedulerModalWithContext(
                lead.is_client ? 'Annual Client Review' : 'Confirmed Sit-Down',
                lead.is_client ? 'annual_review' : 'frs_review'
              );
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={lead.last_disposition === 'appointment_set' ? 'View/Reschedule sit-down' : 'Schedule sit-down meeting'}
          >
            <Calendar size={17} color={lead.last_disposition === 'appointment_set' ? '#FFFFFF' : Colors.heavenlyGold} />
            <Text style={[styles.stickyApptButtonText, lead.last_disposition === 'appointment_set' && styles.stickyApptButtonTextActive]}>
              {lead.last_disposition === 'appointment_set' ? 'Appt' : 'Book'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.stickySmsButton}
            onPress={() => openSmsModal()}
            activeOpacity={0.8}
          >
            <MessageSquare size={18} color="#FFFFFF" />
            <Text style={styles.stickySmsButtonText}>AI Text</Text>
          </TouchableOpacity>

          {/* Standalone Callback Scheduling Button */}
          <TouchableOpacity
            style={[
              styles.stickyCallbackButton,
              lead.follow_up_at ? styles.stickyCallbackButtonActive : null,
            ]}
            onPress={() => {
              HapticsService.medium();
              setCallbackModalVisible(true);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={lead.follow_up_at ? 'Edit scheduled callback' : 'Schedule callback'}
          >
            <Clock size={17} color={lead.follow_up_at ? '#FFFFFF' : Colors.badgeWarningText} />
            {lead.follow_up_at ? <View style={styles.callbackActiveDot} /> : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.stickyDncButton, isDNC && styles.stickyDncButtonRevert]}
            onPress={handleToggleDNC}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={isDNC ? 'Remove from Do Not Call list' : 'Mark educator as Do Not Call'}
          >
            {isDNC ? (
              <RotateCcw size={16} color="#34D399" />
            ) : (
              <ShieldAlert size={16} color="#EF4444" />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* AI Draft SMS Modal */}
      <Modal
        visible={smsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSmsModalVisible(false)}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSmsModalVisible(false)}
          />
          <View style={styles.modalContent} pointerEvents="auto">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.modalTitle}>Draft Text Message</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  style={styles.aiGenerateBtn}
                  onPress={() => handleGenerateAiSms()}
                  disabled={isGeneratingAi}
                >
                  {isGeneratingAi ? (
                    <ActivityIndicator size="small" color="#38BDF8" />
                  ) : (
                    <>
                      <Sparkles size={14} color="#38BDF8" />
                      <Text style={styles.aiGenerateBtnText}>AI Re-Draft</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalHeaderCloseBtn}
                  onPress={() => setSmsModalVisible(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <X size={18} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>
              Preview & edit before sending. Gemini crafts personalized copy based on call notes and FRS needs:
            </Text>

            {/* Quick Focus Chips */}
            <View style={styles.focusChipRow}>
              {(lead?.custom_questions || lead?.notes) && (
                <TouchableOpacity
                  style={[styles.focusChip, { borderColor: Colors.heavenlyGold }]}
                  onPress={() => handleGenerateAiSms('address_question')}
                >
                  <Text style={[styles.focusChipText, { color: Colors.heavenlyGold }]}>📝 Address Note</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.focusChip,
                  (Boolean(lead?.appointment_scheduled_at) || lead?.last_disposition === 'appointment_set') && {
                    borderColor: '#38BDF8',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  },
                ]}
                onPress={() => handleGenerateAiSms('meeting_confirmation')}
              >
                <Text
                  style={[
                    styles.focusChipText,
                    (Boolean(lead?.appointment_scheduled_at) || lead?.last_disposition === 'appointment_set') && {
                      color: '#38BDF8',
                      fontWeight: '800',
                    },
                  ]}
                >
                  {Boolean(lead?.appointment_scheduled_at) || lead?.last_disposition === 'appointment_set'
                    ? '🎯 Confirm Sit-Down'
                    : '🎯 Meeting Slot'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.focusChip}
                onPress={() => handleGenerateAiSms('drop_bonus_focus')}
              >
                <Text style={styles.focusChipText}>💰 5% Bonus & DROP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.focusChip}
                onPress={() => handleGenerateAiSms('planning_period')}
              >
                <Text style={styles.focusChipText}>🏫 Planning</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, { height: 130, marginTop: 8 }]}
              value={smsBody}
              onChangeText={(text) => {
                userEditedSmsRef.current = true;
                setSmsBody(text);
              }}
              multiline
              placeholder="Drafting persuasive SMS..."
              placeholderTextColor={Colors.textMuted}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: Colors.textMuted, fontSize: 11 }}>
                {smsBody.length} characters • Tap above to re-generate or edit directly
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setSmsModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSendSms}
              >
                <Text style={styles.modalSaveText}>Open in SMS App</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Note Edit Modal */}
      <Modal
        visible={noteEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setNoteEditModalVisible(false);
          setEditingNoteId(null);
          setEditingNoteText('');
        }}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setNoteEditModalVisible(false);
              setEditingNoteId(null);
              setEditingNoteText('');
            }}
          />
          <View style={[styles.modalContent, { maxHeight: '80%' }]} pointerEvents="auto">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Edit3 size={16} color={Colors.heavenlyGold} />
                <Text style={styles.modalTitle}>Edit Educator Note</Text>
              </View>
              <TouchableOpacity
                style={styles.modalHeaderCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                onPress={() => {
                  setNoteEditModalVisible(false);
                  setEditingNoteId(null);
                  setEditingNoteText('');
                }}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, { height: 120, textAlignVertical: 'top' }]}
              value={editingNoteText}
              onChangeText={setEditingNoteText}
              placeholder="Edit note content..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            <View style={[styles.modalButtons, { marginTop: 12 }]}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setNoteEditModalVisible(false);
                  setEditingNoteId(null);
                  setEditingNoteText('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSaveEditNote}
              >
                <Text style={styles.modalSaveText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Interactive Zoomable Report Card Photo Modal */}
      <ZoomableImageModal
        visible={imageModalVisible}
        imageUri={lead?.source_image_uri || null}
        title="Proof of Contact Request"
        subtitle={`${lead?.name || 'Client'} • ${lead?.school || 'Review Card'}`}
        onClose={() => setImageModalVisible(false)}
      />

      {/* World-Class Interactive Appointment Scheduler */}
      {lead && (
        <AppointmentSchedulerModal
          visible={apptSchedulerVisible}
          lead={lead}
          initialDate={schedulerInitialDate || (lead.appointment_scheduled_at ? new Date(lead.appointment_scheduled_at) : undefined)}
          initialNotes={schedulerInitialNotes}
          initialPurpose={schedulerInitialPurpose}
          onClose={() => {
            setApptSchedulerVisible(false);
            setSchedulerInitialNotes('');
            setSchedulerInitialPurpose(undefined);
            setSchedulerInitialDate(null);
          }}
          onSave={async ({ scheduledISO, notes, purpose }) => {
            setApptSchedulerVisible(false);
            setSchedulerInitialNotes('');
            setSchedulerInitialPurpose(undefined);
            setSchedulerInitialDate(null);
            await handleScheduleAppointmentWithCalendar(scheduledISO, lead.planning_period || undefined, notes, purpose);
          }}
        />
      )}

      {/* Quick Educator Callback Scheduler */}
      {lead && (
        <CallbackSchedulerModal
          visible={callbackModalVisible}
          lead={lead}
          initialDate={lead.follow_up_at && !isNaN(new Date(lead.follow_up_at).getTime()) ? new Date(lead.follow_up_at) : null}
          onClose={() => setCallbackModalVisible(false)}
          onSave={handleConfirmCallback}
          onClear={lead.follow_up_at ? handleClearCallback : undefined}
        />
      )}

      {/* Other Disposition Custom Note Modal */}
      {lead && (
        <Modal
          visible={otherModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setOtherModalVisible(false)}
        >
          <View style={styles.otherModalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setOtherModalVisible(false)}
            />
            <View style={styles.otherModalCard} pointerEvents="auto">
              <View style={styles.otherModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.otherModalTitle}>📋 Other Disposition</Text>
                  <Text style={styles.otherModalSubtitle}>
                    {lead.name} • {lead.school || 'Campus'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.otherModalCloseBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => setOtherModalVisible(false)}
                >
                  <X size={18} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.otherSectionLabel}>SELECT QUICK REASON CHIPS</Text>
                <View style={styles.otherChipsGrid}>
                  {[
                    'Spoke with Secretary / Front Desk',
                    'Wrong Extension / Transferred',
                    'Educator on Leave / Sabbatical',
                    'Retired / Transferred District',
                    'Hung Up Immediately',
                    'Gatekeeper Refusal',
                    'Requested Email First',
                    'Part-time / Split Campus',
                  ].map((chip) => {
                    const isSelected = otherDispoChips.includes(chip);
                    return (
                      <TouchableOpacity
                        key={chip}
                        style={[styles.otherChip, isSelected && styles.otherChipActive]}
                        onPress={() => toggleOtherChip(chip)}
                      >
                        <Text style={[styles.otherChipText, isSelected && styles.otherChipTextActive]}>
                          {isSelected ? '✓ ' : '+ '}{chip}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.otherSectionLabel, { marginTop: 14 }]}>WRITE-IN DISPOSITION NOTE</Text>
                <TextInput
                  style={styles.otherTextArea}
                  placeholder="e.g. Spoke with front desk, educator only on campus Tuesdays and Thursdays..."
                  placeholderTextColor={Colors.textMuted}
                  value={otherDispoNote}
                  onChangeText={setOtherDispoNote}
                  multiline
                  numberOfLines={4}
                  autoFocus
                />

                <View style={styles.otherModalActionRow}>
                  <TouchableOpacity
                    style={styles.otherCancelBtn}
                    onPress={() => setOtherModalVisible(false)}
                  >
                    <Text style={styles.otherCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.otherSaveBtn}
                    onPress={handleSaveOtherDispo}
                  >
                    <CheckCircle2 size={16} color="#FFFFFF" />
                    <Text style={styles.otherSaveBtnText}>Save 'Other' Outcome</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgApp,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.brandPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.brandPrimary,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editLink: {
    color: Colors.focusRing,
    fontWeight: '700',
    fontSize: 15,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  profileCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 24,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  nameText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  phoneText: {
    fontSize: 16,
    color: Colors.brandAccent,
    marginTop: 2,
    fontWeight: '600',
  },
  emailText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  detailLegacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeNeutralBg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  detailLegacyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.badgeNeutralText,
  },
  detailFreshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeWarningBg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  detailFreshBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.badgeWarningText,
  },
  tierEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
    gap: 8,
  },
  tierEditBtnActiveFresh: {
    backgroundColor: Colors.brandAccent,
    borderColor: Colors.brandAccent,
  },
  tierEditBtnActiveLegacy: {
    backgroundColor: Colors.surfaceSubtle,
    borderColor: Colors.borderStrong,
  },
  tierEditBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  listSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 5,
  },
  listSelectChipActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  listSelectChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  listSelectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  frsInfoBox: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  interestsBox: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 6,
    width: '100%',
  },
  interestsHeader: {
    color: Colors.badgeSuccessText,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  interestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
  },
  interestText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    flexWrap: 'wrap',
    lineHeight: 17,
  },
  customQuestionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.badgeWarningBg,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    gap: 8,
    width: '100%',
  },
  customQuestionText: {
    color: Colors.badgeWarningText,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    flexWrap: 'wrap',
    lineHeight: 17,
  },
  meetingPrefsBox: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  meetingPrefsTitle: {
    color: Colors.brandAccent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  prefText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  proofButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  proofButtonText: {
    color: Colors.brandAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    gap: 10,
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.callActive,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  smsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandAccent,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  toastBanner: {
    backgroundColor: Colors.badgeSuccessBg,
    borderWidth: 1,
    borderColor: Colors.badgeSuccessText,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastBannerText: {
    color: Colors.badgeSuccessText,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  dncWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.badgeDangerBg,
    borderWidth: 1.5,
    borderColor: Colors.badgeDangerText,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 10,
  },
  dncWarningTitle: {
    color: Colors.badgeDangerText,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  dncWarningText: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  dncActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.badgeDangerBg,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.badgeDangerText,
  },
  dncActionButtonRevert: {
    backgroundColor: Colors.badgeSuccessBg,
    borderColor: Colors.badgeSuccessText,
  },
  dncActionButtonText: {
    fontWeight: '800',
    fontSize: 12,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  editForm: {
    gap: 6,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    color: Colors.textPrimary,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    fontSize: 16,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  saveEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 6,
  },
  saveEditText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  sectionHeader: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  emptyLogsCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 8,
  },
  emptyLogsText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  logCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logDisposition: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  logTimestamp: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  logDuration: {
    color: Colors.brandAccent,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  logNote: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 2,
  },
  smsSentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    gap: 6,
  },
  smsSentText: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 20,
    gap: 6,
  },
  deleteButtonText: {
    color: Colors.badgeDangerText,
    fontSize: 14,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: Colors.bgModal,
    justifyContent: 'center',
    padding: 16,
  },
  imageModalContent: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    maxHeight: '90%',
  },
  imageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  imageModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  imageModalSubtitle: {
    fontSize: 12,
    color: Colors.brandAccent,
    marginTop: 2,
    fontWeight: '600',
  },
  imageModalCloseBtn: {
    padding: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
  },
  imageFrame: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    overflow: 'hidden',
    height: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofImage: {
    width: '100%',
    height: '100%',
  },
  complianceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeSuccessBg,
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  complianceText: {
    color: Colors.badgeSuccessText,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  modalContent: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  aiGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    gap: 4,
  },
  aiGenerateBtnText: {
    color: Colors.brandAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  focusChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  focusChip: {
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  focusChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: Colors.surfaceSubtle,
    color: Colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  modalSaveButton: {
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  calCardContainer: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  calCardHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.brandAccent,
    letterSpacing: 0.8,
  },
  calDetailBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  calDetailBtnText: {
    color: Colors.brandAccent,
    fontSize: 11,
    fontWeight: '700',
  },
  detailNotesCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  detailNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  detailNotesTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.brandAccent,
    letterSpacing: 0.8,
  },
  notesCountBadge: {
    backgroundColor: Colors.badgeNeutralBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  notesCountBadgeText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  detailNotesList: {
    gap: 8,
  },
  detailNoteItem: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  detailNoteItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailNoteTimestamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.badgeNeutralBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  detailNoteTimestampText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  detailNoteActionBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: Colors.surfaceCard,
  },
  detailNoteBody: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  detailNotesEmptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  quickTagDetailPill: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  quickTagDetailText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  addNoteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addNoteInput: {
    flex: 1,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  addNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brandPrimary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addNoteButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  detailDispositionSection: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
  },
  detailDispositionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailDispositionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brandAccent,
    letterSpacing: 0.8,
  },
  detailDispositionDismiss: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  detailDispositionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailDispBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailDispBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  stickyBottomDock: {
    backgroundColor: Colors.bgApp,
    borderTopWidth: 1.5,
    borderTopColor: Colors.borderSubtle,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },
  stickyCallButton: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.callActive,
    paddingVertical: 13,
    borderRadius: 12,
    gap: 6,
  },
  stickyCallButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  stickyDispoButton: {
    width: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    gap: 3,
  },
  stickyDispoButtonActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#7C3AED',
  },
  stickyDispoButtonText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '800',
  },
  stickyDispoButtonTextActive: {
    color: '#FFFFFF',
  },
  stickyApptButton: {
    width: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.borderGold,
    gap: 3,
  },
  stickyApptButtonActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.borderGold,
  },
  stickyApptButtonText: {
    color: Colors.heavenlyGold,
    fontSize: 12,
    fontWeight: '800',
  },
  stickyApptButtonTextActive: {
    color: '#FFFFFF',
  },
  stickySmsButton: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandAccent,
    paddingVertical: 13,
    borderRadius: 12,
    gap: 6,
  },
  stickySmsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  stickyDncButton: {
    width: 42,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  stickyDncButtonRevert: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderColor: '#34D399',
  },
  // --- Callback Reminder Card Styles ---
  callbackCardContainer: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginVertical: 10,
  },
  callbackCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  callbackCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  callbackStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    flexShrink: 0,
  },
  callbackStatusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  callbackPillDue: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  callbackPillDueText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '800',
  },
  callbackPillOverdue: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  callbackPillOverdueText: {
    color: '#991B1B',
    fontSize: 10,
    fontWeight: '800',
  },
  callbackTimeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  callbackTimePrimary: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  callbackTimeRelative: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  callbackPlanningContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  callbackPlanningContextText: {
    fontSize: 12,
    color: Colors.brandAccent,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
  },
  callbackNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 10,
  },
  callbackNoteText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  callbackActionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  callbackCallNowBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.callActive,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  callbackCallNowBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  callbackRescheduleBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.brandAccent,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  callbackRescheduleBtnText: {
    color: Colors.brandAccent,
    fontSize: 13,
    fontWeight: '700',
  },
  callbackClearBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.badgeSuccessText,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 4,
  },
  callbackClearBtnText: {
    color: Colors.badgeSuccessText,
    fontSize: 12,
    fontWeight: '700',
  },
  // --- Sticky Dock Callback Button ---
  stickyCallbackButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.badgeWarningBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.badgeWarningText,
    position: 'relative',
  },
  stickyCallbackButtonActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  callbackActiveDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  // Other Disposition Modal Styles
  otherModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  otherModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  otherModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    marginBottom: 12,
  },
  otherModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  otherModalSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  otherModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  modalHeaderCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  otherSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  otherChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  otherChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  otherChipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderColor: '#8B5CF6',
  },
  otherChipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  otherChipTextActive: {
    color: '#8B5CF6',
    fontWeight: '700',
  },
  otherTextArea: {
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
  otherModalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  otherCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  otherCancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  otherSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  otherSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
