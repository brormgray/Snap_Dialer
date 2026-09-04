import React, { useState, useEffect } from 'react';
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
} from 'lucide-react-native';
import { LeadsRepository } from '../db/leadsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { TelephonyService } from '../services/telephonyService';
import { HapticsService } from '../services/hapticsService';
import { AiSmsService } from '../services/aiSmsService';
import { CalendarService } from '../services/calendarService';
import { isTeacherInPlanningNow } from '../data/bellSchedules';
import { NotesService, NoteEntry, EDUCATOR_QUICK_TAGS } from '../services/notesService';
import { Lead, CallLog, CallDisposition, LeadList } from '../types';
import { Colors } from '../theme/colors';
import ZoomableImageModal from '../components/ZoomableImageModal';

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

  // Call & Post-Call Disposition State
  const [showDispositionRow, setShowDispositionRow] = useState<boolean>(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);

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

  useEffect(() => {
    loadLeadData();
  }, [leadId]);

  const loadLeadData = async () => {
    const [l, lists] = await Promise.all([
      LeadsRepository.getLeadById(leadId),
      LeadsRepository.getAllLists(),
    ]);

    if (l) {
      setLead({ ...l });
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
    }
    setAvailableLists(lists);

    const history = await CallLogsRepository.getLogsForLead(leadId);
    setLogs(history);
  };

  const handleTogglePriority = async () => {
    if (!lead) return;
    await HapticsService.medium();
    const newTier = (lead.priority_tier === 3) ? 1 : 3;
    setLead((prev) => (prev ? { ...prev, priority_tier: newTier } : null));
    await LeadsRepository.updateLeadPriority(lead.id, newTier);
    loadLeadData();
  };

  const handleSaveEdit = async () => {
    if (!lead) return;
    await HapticsService.success();
    try {
      await LeadsRepository.updateLeadDetails({
        id: lead.id,
        name: name.trim(),
        phone: phone.trim(),
        school: school.trim() || 'VOL',
        email: email.trim() || null,
        room_number: roomNumber.trim() || null,
        planning_period: planningPeriod.trim() || null,
        years_in_frs: yearsInFrs.trim() || null,
        notes: notes || null,
        priority_tier: priorityTier,
        list_id: listIdVal,
      });

      setLead((prev) =>
        prev
          ? {
              ...prev,
              name: name.trim(),
              phone: phone.trim(),
              school: school.trim() || 'VOL',
              email: email.trim() || null,
              room_number: roomNumber.trim() || null,
              planning_period: planningPeriod.trim() || null,
              years_in_frs: yearsInFrs.trim() || null,
              notes: notes || null,
              priority_tier: priorityTier,
              list_id: listIdVal,
            }
          : null
      );

      setIsEditing(false);
      await loadLeadData();
      showToast('✓ Educator details saved successfully.');
    } catch (err: any) {
      console.error('Failed to save educator details:', err);
      Alert.alert('Save Failed', err?.message || 'Could not update educator details.');
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
        setLead((prev) => (prev ? { ...prev, last_disposition: 'pending' } : null));
        await LeadsRepository.updateLeadDisposition(lead.id, 'pending', 'DNC removed / Reinstated to Queue');
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
        setLead((prev) => (prev ? { ...prev, last_disposition: 'do_not_call' } : null));
        await LeadsRepository.updateLeadDisposition(lead.id, 'do_not_call', 'Flagged as DNC / Opt-Out');
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

  const handleLogCallOutcome = async (disposition: CallDisposition) => {
    if (!lead) return;
    await HapticsService.success();
    const durationSeconds = callStartTime ? Math.max(0, Math.floor((Date.now() - callStartTime) / 1000)) : 0;
    setCallStartTime(null);
    setShowDispositionRow(false);

    const defaultNote =
      disposition === 'appointment_set'
        ? 'Direct profile call: Appointment Set.'
        : disposition === 'connected' || disposition === 'spoke'
        ? 'Direct profile call: Spoke with educator.'
        : disposition === 'no_answer'
        ? 'Direct profile call: No Answer.'
        : disposition === 'voicemail'
        ? 'Direct profile call: Left Voicemail.'
        : disposition === 'callback_requested'
        ? 'Direct profile call: Callback requested.'
        : `Direct profile call: ${disposition}.`;

    const updatedNotes = NotesService.addNote(lead.notes, defaultNote);

    await LeadsRepository.updateLeadDisposition(lead.id, disposition, updatedNotes);
    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds,
      disposition,
      note: defaultNote,
    });

    await loadLeadData();
    showToast(`✓ Logged: ${getDispositionLabel(disposition)}`);
  };

  const openSmsModal = async () => {
    if (!lead) return;
    await HapticsService.tick();

    if (lead.text_ok === false || lead.text_ok === (0 as any)) {
      Alert.alert(
        'SMS Consent Notice',
        `"${lead.name}" has marked Text OK: NO on their card. Do you still wish to open the SMS composer?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Proceed to SMS',
            style: 'destructive',
            onPress: () => {
              setSmsModalVisible(true);
              handleGenerateAiSms();
            },
          },
        ]
      );
      return;
    }

    setSmsModalVisible(true);
    handleGenerateAiSms();
  };

  const handleGenerateAiSms = async (toneFocus?: any) => {
    if (!lead) return;
    setIsGeneratingAi(true);
    try {
      const generated = await AiSmsService.generatePersuasiveSMS(
        lead,
        lead.last_disposition || 'follow_up',
        undefined,
        toneFocus
      );
      setSmsBody(generated);
      await HapticsService.success();
    } catch {
      setSmsBody(
        `Hi ${lead.name.split(' ')[0]}, this is with ValuTeachers following up on your FRS Report Card from ${lead.school || 'your school'}. When is a good time to connect?`
      );
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSendSms = async () => {
    if (!lead) return;
    await HapticsService.medium();
    setSmsModalVisible(false);
    await TelephonyService.sendSMS(lead.phone, smsBody);
    // Log the SMS event as an outreach touchpoint without re-registering an appointment booking
    const smsLogDisposition: CallDisposition =
      lead.last_disposition === 'appointment_set'
        ? 'connected'
        : lead.last_disposition && lead.last_disposition !== 'pending'
        ? lead.last_disposition
        : 'no_answer';
    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id,
      durationSeconds: 0,
      disposition: smsLogDisposition,
      note: lead.last_disposition === 'appointment_set' ? 'Sent appointment confirmation SMS' : 'Sent persuasive ValuTeachers SMS',
      smsSent: true,
      smsBody: smsBody,
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
        <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
          <Text style={styles.editLink}>{isEditing ? 'Cancel' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <View style={styles.toastBanner}>
          <Text style={styles.toastBannerText}>{toastMessage}</Text>
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
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
                      This educator has requested not to be called. They have been permanently removed from all active dialing queues.
                    </Text>
                  </View>
                </View>
              )}

              {/* School & FRS Info */}
              <View style={styles.frsInfoBox}>
                <View style={styles.infoRow}>
                  <School size={16} color="#38BDF8" />
                  <Text style={styles.infoText}>
                    {lead.school || 'VOL'}
                    {lead.room_number ? ` • Room ${lead.room_number}` : ''}
                    {lead.planning_period ? ` • ${lead.planning_period}` : ''}
                  </Text>
                </View>

                <View style={[styles.infoRow, { marginTop: 6 }]}>
                  <GraduationCap size={16} color="#38BDF8" />
                  <Text style={styles.infoText}>
                    {lead.years_in_frs ? `${lead.years_in_frs} Years in FRS` : 'FRS Member'}
                    {lead.age ? ` • Age ${lead.age}` : ''}
                    {lead.frs_knowledge ? ` • FRS Knowledge: "${lead.frs_knowledge}"` : ''}
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
                const scheduledDate = CalendarService.calculateNextPlanningDate(
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
                    <Text style={{ fontSize: 12, color: Colors.livingWhite, marginBottom: 10, lineHeight: 17 }}>
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
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    style={styles.calDetailBtn}
                    onPress={async () => {
                      HapticsService.medium();
                      const event = CalendarService.buildEducatorEvent(lead, new Date(), 20, lead.notes);
                      await CalendarService.downloadIcsFile(event);
                    }}
                  >
                    <Text style={styles.calDetailBtnText}>🍏 Apple (.ics)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.calDetailBtn, { borderColor: '#38BDF8' }]}
                    onPress={() => {
                      HapticsService.medium();
                      const event = CalendarService.buildEducatorEvent(lead, new Date(), 20, lead.notes);
                      CalendarService.openGoogleCalendar(event);
                    }}
                  >
                    <Text style={[styles.calDetailBtnText, { color: '#38BDF8' }]}>🌐 Google Cal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.calDetailBtn, { borderColor: '#A78BFA' }]}
                    onPress={() => {
                      HapticsService.medium();
                      const event = CalendarService.buildEducatorEvent(lead, new Date(), 20, lead.notes);
                      CalendarService.openOutlookCalendar(event);
                    }}
                  >
                    <Text style={[styles.calDetailBtnText, { color: '#A78BFA' }]}>📧 Outlook</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick Actions */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.callButton}
                  onPress={handleCall}
                >
                  <PhoneCall size={18} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Call Now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.smsButton}
                  onPress={openSmsModal}
                >
                  <MessageSquare size={18} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Draft Text</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dncActionButton, isDNC && styles.dncActionButtonRevert]}
                  onPress={handleToggleDNC}
                  activeOpacity={0.8}
                >
                  {isDNC ? (
                    <>
                      <RotateCcw size={14} color="#34D399" />
                      <Text style={[styles.dncActionButtonText, { color: '#34D399' }]}>Reinstate</Text>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={14} color="#EF4444" />
                      <Text style={[styles.dncActionButtonText, { color: '#EF4444' }]}>DNC</Text>
                    </>
                  )}
                </TouchableOpacity>
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
                  </View>
                </View>
              )}
            </>
          ) : (
            /* Edit Form */
            <View style={styles.editForm}>
              <Text style={styles.fieldLabel}>Educator Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} />

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

      {/* AI Draft SMS Modal */}
      <Modal visible={smsModalVisible} animationType="slide" transparent>
        <View style={styles.imageModalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.modalTitle}>Draft Text Message</Text>
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
                style={styles.focusChip}
                onPress={() => handleGenerateAiSms('meeting_confirmation')}
              >
                <Text style={styles.focusChipText}>🎯 Meeting Slot</Text>
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
              onChangeText={setSmsBody}
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
      <Modal visible={noteEditModalVisible} animationType="slide" transparent>
        <View style={styles.imageModalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Edit3 size={16} color={Colors.heavenlyGold} />
                <Text style={styles.modalTitle}>Edit Educator Note</Text>
              </View>
              <TouchableOpacity
                style={{ padding: 4 }}
                onPress={() => {
                  setNoteEditModalVisible(false);
                  setEditingNoteId(null);
                  setEditingNoteText('');
                }}
              >
                <X size={18} color={Colors.livingWhite} />
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
        subtitle={`${lead?.name || 'Educator'} • ${lead?.school || 'ValuTeachers'}`}
        onClose={() => setImageModalVisible(false)}
      />
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 13,
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
});
