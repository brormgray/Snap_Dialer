import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import {
  PhoneCall,
  PhoneOff,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  SkipForward,
  SkipBack,
  ArrowLeft,
  User,
  GraduationCap,
  FileText,
  Flame,
  ShieldAlert,
  Clock,
  Globe,
  AlertTriangle,
  Calendar,
  Sparkles,
  HelpCircle,
  School,
  Check,
  Eye,
  FileCheck,
  X,
  Wand2,
  RefreshCw,
  Archive,
  ShieldCheck,
  BookOpen,
  Edit3,
  Trash2,
  Plus,
  ClipboardList,
  Building,
  Landmark,
  Briefcase,
} from 'lucide-react-native';
import { LeadsRepository } from '../db/leadsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { SettingsRepository } from '../db/settingsRepository';
import { CadenceRepository } from '../db/cadenceRepository';
import { TelephonyService } from '../services/telephonyService';
import { CadenceEngine } from '../services/cadenceEngine';
import { HapticsService } from '../services/hapticsService';
import { TimeZoneService, ProspectTimeInfo } from '../services/timeZoneService';
import { AiSmsService } from '../services/aiSmsService';
import { CalendarService } from '../services/calendarService';
import { NotesService, NoteEntry, EDUCATOR_QUICK_TAGS } from '../services/notesService';
import { FRS_OBJECTIONS, ObjectionCard } from '../data/objections';
import { isTeacherInPlanningNow, getScheduleForSchool, matchPeriodId } from '../data/bellSchedules';
import { Lead, CallDisposition, SMSTemplate, AppSettings, CadenceRule } from '../types';
import { Colors } from '../theme/colors';
import ZoomableImageModal from '../components/ZoomableImageModal';
import { AppointmentSchedulerModal } from '../components/AppointmentSchedulerModal';

export default function DialerHudScreen({ route, navigation }: any) {
  const listId = route.params?.listId || 'master_queue';
  const listTitle = route.params?.listTitle || 'Retirement Calling Queue';
  const schoolName = route.params?.schoolName;

  const [queue, setQueue] = useState<Lead[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const currentIndexRef = useRef<number>(0);
  currentIndexRef.current = currentIndex;
  const queueRef = useRef<Lead[]>([]);
  queueRef.current = queue;
  const isProcessingDispoRef = useRef<boolean>(false);
  const smsAlreadyLoggedRef = useRef<boolean>(false);
  const pendingNoAnswerDispositionRef = useRef<{
    lead: Lead;
    attemptNum: number;
    actualDuration: number;
    disposition: CallDisposition;
  } | null>(null);
  const [isNoAnswerSmsPrompt, setIsNoAnswerSmsPrompt] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const [isAutoPaused, setIsAutoPaused] = useState<boolean>(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Call duration counter
  const [isOnCall, setIsOnCall] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callStartTimeRef = useRef<number | null>(null);

  // Structured Notes Manager Modal
  const [notesModalVisible, setNotesModalVisible] = useState<boolean>(false);
  const [noteDraftText, setNoteDraftText] = useState<string>('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Quick Notes modal for Connected calls / Appointments
  const [noteModalVisible, setNoteModalVisible] = useState<boolean>(false);
  const [apptSchedulerVisible, setApptSchedulerVisible] = useState<boolean>(false);
  const [isSettingAppt, setIsSettingAppt] = useState<boolean>(false);
  const [isOtherDisposition, setIsOtherDisposition] = useState<boolean>(false);
  const [selectedApptDate, setSelectedApptDate] = useState<Date | null>(null);
  const [callNote, setCallNote] = useState<string>('');

  // Live Objection Battlecards Modal
  const [objectionsModalVisible, setObjectionsModalVisible] = useState<boolean>(false);
  const [selectedObjection, setSelectedObjection] = useState<ObjectionCard | null>(null);

  // Follow-up Scheduling Modal
  const [followUpModalVisible, setFollowUpModalVisible] = useState<boolean>(false);
  const [followUpNote, setFollowUpNote] = useState<string>('');

  // Multi-template SMS Modal
  const [smsModalVisible, setSmsModalVisible] = useState<boolean>(false);
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [cadenceRules, setCadenceRules] = useState<CadenceRule[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SMSTemplate | null>(null);
  const [customSmsBody, setCustomSmsBody] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // Original Card Image / Proof of Contact Modal
  const [imageModalVisible, setImageModalVisible] = useState<boolean>(false);

  // Edit Lead Modal State
  const [editLeadModalVisible, setEditLeadModalVisible] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editSchool, setEditSchool] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editRoomNumber, setEditRoomNumber] = useState<string>('');
  const [editPlanningPeriod, setEditPlanningPeriod] = useState<string>('');
  const [editYearsInFrs, setEditYearsInFrs] = useState<string>('');
  const [editIsFrs, setEditIsFrs] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Session stats
  const [sessionDials, setSessionDials] = useState<number>(0);
  const [sessionAppointments, setSessionAppointments] = useState<number>(0);
  const [sessionConnects, setSessionConnects] = useState<number>(0);
  const [sessionCallbacks, setSessionCallbacks] = useState<number>(0);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Gesture Animation State
  const pan = useRef(new Animated.ValueXY()).current;
  const [swipeActionText, setSwipeActionText] = useState<string | null>(null);

  const cardRotate = pan.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-6deg', '0deg', '6deg'],
    extrapolate: 'clamp',
  });

  const resumeQueuePosition = (leads: Lead[]): number => {
    try {
      const storageKey = `snap_dialer_last_lead_${listId || 'master_queue'}_${schoolName || 'all'}`;
      const indexKey = `snap_dialer_last_index_${listId || 'master_queue'}_${schoolName || 'all'}`;
      const savedLeadId = typeof window !== 'undefined' && window.localStorage ? localStorage.getItem(storageKey) : null;
      const savedIndexStr = typeof window !== 'undefined' && window.localStorage ? localStorage.getItem(indexKey) : null;

      if (savedLeadId && leads.length > 0) {
        const foundIndex = leads.findIndex((l) => l.id === savedLeadId);
        if (foundIndex >= 0 && foundIndex < leads.length) {
          return foundIndex;
        }
      }
      if (savedIndexStr && leads.length > 0) {
        const parsed = parseInt(savedIndexStr, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed < leads.length) {
          return parsed;
        }
      }
      // If no saved position, automatically find the first uncontacted/callable lead
      const firstCallableIndex = leads.findIndex(
        (l) => !l.last_disposition || ['pending', 'no_answer', 'voicemail'].includes(l.last_disposition)
      );
      if (firstCallableIndex >= 0) {
        return firstCallableIndex;
      }
    } catch {}
    return 0;
  };

  const loadQueue = async () => {
    setLoading(true);
    try {
      const s = await SettingsRepository.getSettings();
      setAppSettings(s);
      const [allTemplates, allRules] = await Promise.all([
        CadenceRepository.getAllTemplates(),
        CadenceRepository.getAllRules(),
      ]);
      setTemplates(allTemplates);
      setCadenceRules(allRules);

      const leads = (route.params?.leads && Array.isArray(route.params.leads) && route.params.leads.length > 0)
        ? route.params.leads
        : schoolName
        ? await LeadsRepository.getDialingQueueForSchool(schoolName, listId)
        : await LeadsRepository.getDialingQueueForList(listId);
      setQueue(leads);
      const targetIndex = resumeQueuePosition(leads);
      setCurrentIndex(targetIndex);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load dialing queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queue.length > 0 && queue[currentIndex]) {
      try {
        const storageKey = `snap_dialer_last_lead_${listId || 'master_queue'}_${schoolName || 'all'}`;
        const indexKey = `snap_dialer_last_index_${listId || 'master_queue'}_${schoolName || 'all'}`;
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(storageKey, queue[currentIndex].id);
          localStorage.setItem(indexKey, String(currentIndex));
        }
      } catch {}
    }
  }, [currentIndex, queue, listId, schoolName]);

  useEffect(() => {
    loadQueue();
    const unsubscribe = navigation.addListener('focus', async () => {
      // Re-hydrate queue in case a lead was edited on LeadDetailScreen
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      if (q.length > 0 && q[idx]) {
        const fresh = await LeadsRepository.getLeadById(q[idx].id);
        if (fresh) {
          setQueue((prev) => {
            const next = [...prev];
            if (next[idx]) next[idx] = { ...fresh };
            return next;
          });
        }
      }
    });
    return () => {
      unsubscribe();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [listId, schoolName]);

  const cancelAutoAdvanceTimer = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setAutoAdvanceCountdown(null);
    }
  };

  const handleBackToDashboard = () => {
    cancelAutoAdvanceTimer();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    callStartTimeRef.current = null;
    setIsOnCall(false);
    setCallDuration(0);
    if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation && typeof navigation.navigate === 'function') {
      (navigation as any).navigate('MainTabs', { screen: 'Lists' });
    }
  };

  const openEditLeadModal = () => {
    if (!currentLead) return;
    cancelAutoAdvanceTimer();
    HapticsService.tick();
    setEditName(currentLead.name || '');
    setEditPhone(currentLead.phone || '');
    setEditSchool(currentLead.school || '');
    setEditEmail(currentLead.email || '');
    setEditRoomNumber(currentLead.room_number || '');
    setEditPlanningPeriod(currentLead.planning_period || '');
    setEditYearsInFrs(currentLead.years_in_frs || '');
    setEditIsFrs(currentLead.is_frs !== false);
    setEditLeadModalVisible(true);
  };

  const handleToggleFrs = async () => {
    if (!currentLead) return;
    const prevIsFrs = currentLead.is_frs !== false;
    const newIsFrs = !prevIsFrs;

    await HapticsService.medium();
    // Immediate optimistic update
    currentLead.is_frs = newIsFrs;
    setQueue((prev) => {
      const next = [...prev];
      if (next[currentIndex]) {
        next[currentIndex] = {
          ...next[currentIndex],
          is_frs: newIsFrs,
        };
      }
      return next;
    });

    try {
      await LeadsRepository.updateLeadDetails({
        id: currentLead.id,
        name: currentLead.name,
        phone: currentLead.phone,
        school: currentLead.school,
        email: currentLead.email,
        room_number: currentLead.room_number,
        planning_period: currentLead.planning_period,
        years_in_frs: currentLead.years_in_frs,
        notes: currentLead.notes,
        priority_tier: currentLead.priority_tier,
        list_id: currentLead.list_id,
        is_frs: newIsFrs,
      });
      showToast(newIsFrs ? 'Marked as FRS Member (FRS messaging active)' : 'Marked as Non-FRS Client (General retirement messaging active)');
    } catch (e: any) {
      console.error('Failed to toggle FRS status in HUD:', e);
      // Clean rollback on error
      currentLead.is_frs = prevIsFrs;
      setQueue((prev) => {
        const next = [...prev];
        if (next[currentIndex]) {
          next[currentIndex] = {
            ...next[currentIndex],
            is_frs: prevIsFrs,
          };
        }
        return next;
      });
      Alert.alert('Error', 'Failed to update retirement system status.');
    }
  };

  const handleSaveEditedLead = async () => {
    if (!currentLead) return;
    await HapticsService.success();
    try {
      const updatedName = editName.trim();
      const updatedPhone = editPhone.trim();
      const updatedSchool = editSchool.trim() || 'VOL';
      const updatedEmail = editEmail.trim() || null;
      const updatedRoom = editRoomNumber.trim() || null;
      const updatedPlanning = editPlanningPeriod.trim() || null;
      const updatedYears = editYearsInFrs.trim() || null;

      await LeadsRepository.updateLeadDetails({
        id: currentLead.id,
        name: updatedName,
        phone: updatedPhone,
        school: updatedSchool,
        email: updatedEmail,
        room_number: updatedRoom,
        planning_period: updatedPlanning,
        years_in_frs: updatedYears,
        notes: currentLead.notes,
        priority_tier: currentLead.priority_tier,
        list_id: currentLead.list_id,
        is_frs: editIsFrs,
      });

      currentLead.name = updatedName;
      currentLead.phone = updatedPhone;
      currentLead.school = updatedSchool;
      currentLead.email = updatedEmail || undefined;
      currentLead.room_number = updatedRoom || undefined;
      currentLead.planning_period = updatedPlanning || undefined;
      currentLead.years_in_frs = updatedYears || undefined;
      currentLead.is_frs = editIsFrs;

      setQueue((prev) => {
        const next = [...prev];
        if (next[currentIndex]) {
          next[currentIndex] = {
            ...next[currentIndex],
            name: updatedName,
            phone: updatedPhone,
            school: updatedSchool,
            email: updatedEmail || undefined,
            room_number: updatedRoom || undefined,
            planning_period: updatedPlanning || undefined,
            years_in_frs: updatedYears || undefined,
            is_frs: editIsFrs,
          };
        }
        return next;
      });

      setEditLeadModalVisible(false);
      showToast('✓ Educator card details saved & updated!');
    } catch (err: any) {
      console.error('Failed to save edited lead in HUD:', err);
      Alert.alert('Save Failed', err?.message || 'Could not update educator details.');
    }
  };

  const currentLead: Lead | undefined = queue[currentIndex];
  const timeInfo: ProspectTimeInfo | null = currentLead
    ? TimeZoneService.getProspectTimeInfo(currentLead.phone)
    : null;

  // PanResponder Swipe Controller (Two-way thumb navigation)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        pan.setValue({ x: gestureState.dx, y: 0 });
        const cur = currentIndexRef.current;
        if (gestureState.dx > 40) {
          setSwipeActionText(cur > 0 ? '⏮️ RELEASE FOR PREVIOUS' : '🚫 FIRST LEAD');
        } else if (gestureState.dx < -40) {
          setSwipeActionText('⏭️ RELEASE FOR NEXT LEAD');
        } else {
          setSwipeActionText(null);
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, tension: 50, useNativeDriver: false }).start();
        setSwipeActionText(null);
      },
      onPanResponderRelease: (_, gestureState) => {
        const isSwipeRight = gestureState.dx > 40 || gestureState.vx > 0.25;
        const isSwipeLeft = gestureState.dx < -40 || gestureState.vx < -0.25;
        const cur = currentIndexRef.current;

        if (isSwipeRight) {
          if (cur > 0) {
            HapticsService.medium();
            Animated.timing(pan, {
              toValue: { x: 380, y: 0 },
              duration: 140,
              useNativeDriver: false,
            }).start(() => {
              goToPreviousLead();
            });
          } else {
            HapticsService.tick();
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 6,
              tension: 50,
              useNativeDriver: false,
            }).start(() => {
              setSwipeActionText(null);
            });
          }
        } else if (isSwipeLeft) {
          HapticsService.tick();
          Animated.timing(pan, {
            toValue: { x: -380, y: 0 },
            duration: 140,
            useNativeDriver: false,
          }).start(() => {
            advanceNextLead();
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 6,
            tension: 50,
            useNativeDriver: false,
          }).start(() => {
            setSwipeActionText(null);
          });
        }
      },
    })
  ).current;

  // Trigger outbound call via zero-cost native SIM bridge
  const handleDial = async () => {
    if (!currentLead || isOnCall) return;
    cancelAutoAdvanceTimer();
    await HapticsService.medium();
    setSessionDials((prev) => prev + 1);
    setIsOnCall(true);
    setCallDuration(0);
    callStartTimeRef.current = Date.now();

    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => {
      if (callStartTimeRef.current) {
        setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
      }
    }, 1000);

    await TelephonyService.makeCall(currentLead.phone);
  };

  // Disposition Handlers
  const handleDisposition = async (
    disposition: CallDisposition,
    note?: string,
    advanceImmediately: boolean = false,
    scheduledDateOverride?: Date
  ) => {
    if (!currentLead || isProcessingDispoRef.current) return;
    isProcessingDispoRef.current = true;

    try {
      if (disposition === 'appointment_set') {
        await HapticsService.success();
        setSessionAppointments((prev) => prev + 1);
      } else if (disposition === 'connected' || disposition === 'spoke') {
        await HapticsService.success();
        setSessionConnects((prev) => prev + 1);
      } else if (disposition === 'callback_requested') {
        await HapticsService.tick();
        setSessionCallbacks((prev) => prev + 1);
      } else if (disposition === 'bad_number') {
        await HapticsService.heavy();
      } else {
        await HapticsService.tick();
      }

      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setIsOnCall(false);

      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setAutoAdvanceCountdown(null);

      const actualDuration = callStartTimeRef.current
        ? Math.max(callDuration, Math.floor((Date.now() - callStartTimeRef.current) / 1000))
        : callDuration;
      callStartTimeRef.current = null;

      const attemptNum = (currentLead.attempts_count || 0) + 1;
      const isUnanswered = disposition === 'no_answer' || disposition === 'voicemail';
      const stepRule = cadenceRules.find((r) => r.step_number === attemptNum);
      const isCallOnly = stepRule?.action_type === 'call_only';
      const hasTextConsent = currentLead.text_ok !== false && currentLead.text_ok !== (0 as any);
      const shouldPromptSms = isUnanswered && hasTextConsent && !isCallOnly;

      if (shouldPromptSms) {
        // Find template according to configured Cadence rule for this step, or fallback
        const ruleTemplateId = stepRule?.sms_template_id;
        const matchingTemplate =
          (ruleTemplateId ? templates.find((t) => t.id === ruleTemplateId) : null) ||
          templates.find((t) => t.id === 'tpl_just_called') ||
          templates[0] || {
            id: 'tpl_just_called',
            title: 'No Answer - Just Called Follow-up',
            body: currentLead.is_frs !== false
              ? 'Hi {{name}}, this is {{my_name}} with {{company}}! I just tried giving you a quick call regarding your FRS Report Card from {{school}}. Feel free to call me back, or text me a good time during your planning period to connect!'
              : 'Hi {{name}}, this is {{my_name}} with {{company}}! I just tried giving you a quick call regarding your retirement review. Feel free to call me back, or text me a good time to connect!',
          };

        const interpolatedSms = TelephonyService.interpolateTemplate(
          matchingTemplate,
          currentLead,
          appSettings?.user_name || 'Alex',
          new Date(),
          appSettings?.agency_name
        );

        setSelectedTemplate(matchingTemplate);
        setCustomSmsBody(interpolatedSms);
        pendingNoAnswerDispositionRef.current = {
          lead: currentLead,
          attemptNum,
          actualDuration,
          disposition,
        };
        setIsNoAnswerSmsPrompt(true);
        setSmsModalVisible(true);
        return;
      }

      // 2. Build and append timestamped structured note for this outreach attempt
      const defaultNote =
        isUnanswered
          ? `Call attempt #${attemptNum}: No Answer / Voicemail.`
          : disposition === 'spoke' || disposition === 'connected'
          ? `Call attempt #${attemptNum}: Connected / Spoke on phone.`
          : disposition === 'appointment_set'
          ? `Call attempt #${attemptNum}: Appointment Set.`
          : undefined;

      const noteToRecord = note || defaultNote;
      let updatedNotes = currentLead.notes;
      if (noteToRecord) {
        updatedNotes = NotesService.addNote(currentLead.notes, noteToRecord);
        currentLead.notes = updatedNotes;
        setQueue((prev) => {
          const next = [...prev];
          if (next[currentIndex]) {
            next[currentIndex] = { ...next[currentIndex], notes: updatedNotes };
          }
          return next;
        });
      }

      // 3. Save to Database
      try {
        if (noteToRecord) {
          await LeadsRepository.updateLeadNotes(currentLead.id, updatedNotes || null);
        }
        if (disposition === 'appointment_set') {
          const scheduledDate = scheduledDateOverride || CalendarService.calculateNextPlanningDate(
            currentLead.planning_period,
            currentLead.school
          );
          const scheduledISO = scheduledDate.toISOString();
          currentLead.appointment_scheduled_at = scheduledISO;
          currentLead.last_disposition = 'appointment_set';
          currentLead.appointment_outcome = null;
          currentLead.appointment_completed_at = null;
          currentLead.follow_up_at = scheduledISO;

          setQueue((prev) => {
            const next = [...prev];
            if (next[currentIndex]) {
              next[currentIndex] = {
                ...next[currentIndex],
                notes: updatedNotes,
                last_disposition: 'appointment_set',
                appointment_scheduled_at: scheduledISO,
                appointment_outcome: null,
                appointment_completed_at: null,
                follow_up_at: scheduledISO,
              };
            }
            return next;
          });

          await LeadsRepository.scheduleAppointment(
            currentLead.id,
            scheduledISO,
            updatedNotes || undefined
          );
        }
        if (disposition !== 'callback_requested' && disposition !== 'appointment_set') {
          currentLead.follow_up_at = null;
        }
        currentLead.last_disposition = disposition;
        setQueue((prev) => {
          const next = [...prev];
          if (next[currentIndex]) {
            next[currentIndex] = {
              ...next[currentIndex],
              notes: updatedNotes,
              last_disposition: disposition,
              follow_up_at:
                disposition === 'callback_requested' || disposition === 'appointment_set'
                  ? currentLead.follow_up_at || next[currentIndex].follow_up_at
                  : null,
              appointment_scheduled_at:
                disposition === 'appointment_set'
                  ? currentLead.appointment_scheduled_at || next[currentIndex].appointment_scheduled_at
                  : next[currentIndex].appointment_scheduled_at,
              appointment_outcome:
                disposition === 'appointment_set'
                  ? null
                  : next[currentIndex].appointment_outcome,
              appointment_completed_at:
                disposition === 'appointment_set'
                  ? null
                  : next[currentIndex].appointment_completed_at,
            };
          }
          return next;
        });
        await LeadsRepository.updateLeadDisposition(currentLead.id, disposition, updatedNotes || undefined);

        await CallLogsRepository.logCall({
          leadId: currentLead.id,
          listId: currentLead.list_id,
          durationSeconds: actualDuration,
          disposition,
          note: noteToRecord,
          smsSent: false,
        });
      } catch (e) {
        console.warn('Disposition DB save error:', e);
      }

      if (advanceImmediately) {
        advanceNextLead();
      } else {
        if (isAutoPaused) {
          // Stay on current lead, manual pause active
        } else if (appSettings?.auto_advance_enabled) {
          startAutoAdvanceTimer();
        } else {
          advanceNextLead();
        }
      }
    } finally {
      isProcessingDispoRef.current = false;
    }
  };

  const handleScheduleFollowUp = async (presetHours: number) => {
    if (!currentLead || isProcessingDispoRef.current) return;
    isProcessingDispoRef.current = true;
    try {
      await HapticsService.success();
      setFollowUpModalVisible(false);
      setSessionCallbacks((prev) => prev + 1);

      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setIsOnCall(false);

      const followUpDate = new Date();
      followUpDate.setHours(followUpDate.getHours() + presetHours);
      const followUpISO = followUpDate.toISOString();

      currentLead.follow_up_at = followUpISO;
      currentLead.last_disposition = 'callback_requested';
      setQueue((prev) => {
        const next = [...prev];
        if (next[currentIndex]) {
          next[currentIndex] = {
            ...next[currentIndex],
            last_disposition: 'callback_requested',
            follow_up_at: followUpISO,
          };
        }
        return next;
      });

      await LeadsRepository.scheduleFollowUp(
        currentLead.id,
        followUpISO,
        followUpNote || 'Scheduled Callback'
      );

      await CallLogsRepository.logCall({
        leadId: currentLead.id,
        listId: currentLead.list_id,
        durationSeconds: callDuration,
        disposition: 'callback_requested',
        note: `Follow-up set for ${followUpDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      });

      setFollowUpNote('');
      Alert.alert('Follow-Up Saved', `Callback scheduled for ${followUpDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
      advanceNextLead();
    } finally {
      isProcessingDispoRef.current = false;
    }
  };

  const handleMarkDNC = async () => {
    if (!currentLead) return;
    await HapticsService.heavy();
    await handleDisposition('do_not_call', 'Educator requested Do Not Call', true);
  };

  const handleSaveNote = async () => {
    if (!currentLead || isProcessingDispoRef.current) return;
    await HapticsService.success();
    setNoteModalVisible(false);

    const disposition: CallDisposition = isSettingAppt ? 'appointment_set' : isOtherDisposition ? 'other' : 'connected';
    
    // Ensure the date shown as visually selected is passed even if user didn't re-click the active pill
    let apptDateToUse: Date | undefined = undefined;
    if (isSettingAppt) {
      if (selectedApptDate) {
        apptDateToUse = selectedApptDate;
      } else {
        const schedule = getScheduleForSchool(currentLead.school);
        const periodId = matchPeriodId(currentLead.planning_period);
        const period = schedule.find((p) => p.id === periodId) || schedule[2];
        const [sH, sM] = (period?.startTime || '09:00').split(':').map(Number);

        const now = new Date();
        const dow = now.getDay();
        const todaySlot = new Date(now);
        todaySlot.setHours(sH || 9, sM || 0, 0, 0);

        if (dow >= 1 && dow <= 5 && todaySlot.getTime() > now.getTime()) {
          apptDateToUse = todaySlot;
        } else {
          const nextDay = new Date(now);
          nextDay.setDate(nextDay.getDate() + 1);
          while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
            nextDay.setDate(nextDay.getDate() + 1);
          }
          nextDay.setHours(sH || 9, sM || 0, 0, 0);
          apptDateToUse = nextDay;
        }
      }
    }

    await handleDisposition(disposition, callNote, true, apptDateToUse);
    setCallNote('');
    setIsSettingAppt(false);
    setIsOtherDisposition(false);
    setSelectedApptDate(null);
  };

  const openSmsModal = async () => {
    if (!currentLead) return;
    cancelAutoAdvanceTimer();
    pendingNoAnswerDispositionRef.current = null;
    setIsNoAnswerSmsPrompt(false);
    smsAlreadyLoggedRef.current = false;
    await HapticsService.tick();

    const hasAppt = Boolean(currentLead.appointment_scheduled_at) || currentLead.last_disposition === 'appointment_set';
    const initialTone = hasAppt ? 'meeting_confirmation' : undefined;
    const initialDraft = AiSmsService.getSmartFallbackSMS(currentLead, appSettings?.user_name || 'Alex', initialTone, new Date(), appSettings?.agency_name);
    setCustomSmsBody(initialDraft);

    if (currentLead.text_ok === false || currentLead.text_ok === (0 as any)) {
      Alert.alert(
        'SMS Consent Notice',
        `"${currentLead.name}" has marked Text OK: NO on their card. Do you still wish to open the SMS composer?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Proceed to SMS',
            style: 'destructive',
            onPress: () => {
              setSmsModalVisible(true);
              handleGenerateAiSms(initialTone);
            },
          },
        ]
      );
      return;
    }

    setSmsModalVisible(true);
    handleGenerateAiSms(initialTone);
  };

  const handleGenerateAiSms = async (toneFocus?: any) => {
    if (!currentLead) return;
    setIsGeneratingAi(true);
    await HapticsService.medium();
    const hasAppt = Boolean(currentLead.appointment_scheduled_at) || currentLead.last_disposition === 'appointment_set';
    const effectiveTone = toneFocus || (hasAppt ? 'meeting_confirmation' : undefined);
    const effectiveDispo = hasAppt ? 'appointment_set' : (isOnCall ? 'connected' : 'no_answer');

    try {
      const generated = await AiSmsService.generatePersuasiveSMS(
        currentLead,
        effectiveDispo,
        appSettings?.gemini_api_key,
        effectiveTone
      );
      if (generated && generated.trim().length > 0) {
        setCustomSmsBody(generated.trim().replace(/^"|"$/g, ''));
        await HapticsService.success();
      }
    } catch (e: any) {
      console.warn('AI SMS generation fallback:', e);
      const fallbackText = AiSmsService.getSmartFallbackSMS(
        currentLead,
        appSettings?.user_name || 'Alex',
        effectiveTone
      );
      setCustomSmsBody(fallbackText);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Structured Notes CRUD Handlers
  const openNotesModal = () => {
    cancelAutoAdvanceTimer();
    setEditingNoteId(null);
    setNoteDraftText('');
    setNotesModalVisible(true);
  };

  const handleAddNote = async (customText?: string) => {
    if (!currentLead) return;
    const textToAdd = (customText || noteDraftText).trim();
    if (!textToAdd) return;
    await HapticsService.success();
    const updatedNotes = NotesService.addNote(currentLead.notes, textToAdd);
    currentLead.notes = updatedNotes;
    setQueue((prev) => {
      const next = [...prev];
      if (next[currentIndex]) next[currentIndex] = { ...next[currentIndex], notes: updatedNotes };
      return next;
    });
    await LeadsRepository.updateLeadNotes(currentLead.id, updatedNotes);
    setNoteDraftText('');
  };

  const handleStartEditNote = (entry: NoteEntry) => {
    setEditingNoteId(entry.id);
    setNoteDraftText(entry.text);
  };

  const handleSaveEditNote = async () => {
    if (!currentLead || !editingNoteId) return;
    await HapticsService.success();
    const updatedNotes = NotesService.editNote(currentLead.notes, editingNoteId, noteDraftText);
    currentLead.notes = updatedNotes;
    setQueue((prev) => {
      const next = [...prev];
      if (next[currentIndex]) next[currentIndex] = { ...next[currentIndex], notes: updatedNotes };
      return next;
    });
    await LeadsRepository.updateLeadNotes(currentLead.id, updatedNotes);
    setEditingNoteId(null);
    setNoteDraftText('');
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!currentLead) return;
    await HapticsService.heavy();
    const updatedNotes = NotesService.deleteNote(currentLead.notes, noteId);
    currentLead.notes = updatedNotes;
    setQueue((prev) => {
      const next = [...prev];
      if (next[currentIndex]) next[currentIndex] = { ...next[currentIndex], notes: updatedNotes };
      return next;
    });
    await LeadsRepository.updateLeadNotes(currentLead.id, updatedNotes);
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
      setNoteDraftText('');
    }
  };

  const handleSkipNoAnswerSms = async () => {
    const pending = pendingNoAnswerDispositionRef.current;
    pendingNoAnswerDispositionRef.current = null;
    setIsNoAnswerSmsPrompt(false);
    setSmsModalVisible(false);

    if (pending && pending.lead) {
      const targetLead = pending.lead;
      const noteToRecord = `Call attempt #${pending.attemptNum}: No Answer / Voicemail.`;
      const updatedNotes = NotesService.addNote(targetLead.notes, noteToRecord);
      targetLead.notes = updatedNotes;
      setQueue((prev) => {
        const next = [...prev];
        const idx = next.findIndex((l) => l.id === targetLead.id);
        if (idx >= 0) next[idx] = { ...next[idx], notes: updatedNotes };
        return next;
      });

      try {
        await LeadsRepository.updateLeadNotes(targetLead.id, updatedNotes || null);
        await LeadsRepository.updateLeadDisposition(targetLead.id, pending.disposition, updatedNotes || undefined);
        await CallLogsRepository.logCall({
          leadId: targetLead.id,
          listId: targetLead.list_id,
          durationSeconds: pending.actualDuration,
          disposition: pending.disposition,
          note: noteToRecord,
          smsSent: false,
        });
      } catch (e) {
        console.warn('Error recording skip SMS disposition:', e);
      }
    }

    advanceNextLead();
  };

  const handleSendCustomSms = async () => {
    if (!currentLead) return;
    const pending = pendingNoAnswerDispositionRef.current;
    pendingNoAnswerDispositionRef.current = null;
    setIsNoAnswerSmsPrompt(false);
    const messageToSend = customSmsBody;

    setSmsModalVisible(false);

    // CRITICAL: Call TelephonyService.sendSMS synchronously on user click
    // without awaiting any microtasks before it to preserve iOS Safari touch gesture token!
    TelephonyService.sendSMS(currentLead.phone, messageToSend);
    HapticsService.medium().catch(() => {});

    if (pending && pending.lead) {
      const targetLead = pending.lead;
      const noteToRecord = `Call attempt #${pending.attemptNum}: No Answer / Voicemail. Follow-up SMS sent.`;
      const updatedNotes = NotesService.addNote(targetLead.notes, noteToRecord);
      targetLead.notes = updatedNotes;
      setQueue((prev) => {
        const next = [...prev];
        const idx = next.findIndex((l) => l.id === targetLead.id);
        if (idx >= 0) next[idx] = { ...next[idx], notes: updatedNotes };
        return next;
      });

      try {
        await LeadsRepository.updateLeadNotes(targetLead.id, updatedNotes || null);
        await LeadsRepository.updateLeadDisposition(targetLead.id, pending.disposition, updatedNotes || undefined);
        await CallLogsRepository.logCall({
          leadId: targetLead.id,
          listId: targetLead.list_id,
          durationSeconds: pending.actualDuration,
          disposition: pending.disposition,
          note: noteToRecord,
          smsSent: true,
          smsBody: messageToSend,
        });
      } catch (e) {
        console.warn('Error recording send SMS disposition:', e);
      }
      advanceNextLead();
    } else {
      // Standalone Quick SMS from HUD dock
      try {
        const noteToRecord = 'Sent persuasive follow-up SMS';
        const updatedNotes = NotesService.addNote(currentLead.notes, noteToRecord);
        currentLead.notes = updatedNotes;
        await LeadsRepository.updateLeadNotes(currentLead.id, updatedNotes);
        await CallLogsRepository.logCall({
          leadId: currentLead.id,
          listId: currentLead.list_id,
          durationSeconds: 0,
          disposition: 'sms_sent',
          note: noteToRecord,
          smsSent: true,
          smsBody: messageToSend,
        });
      } catch (e) {
        console.warn('Error logging standalone SMS:', e);
      }
      advanceNextLead();
    }
  };


  const startAutoAdvanceTimer = () => {
    if (isAutoPaused || !appSettings?.auto_advance_enabled) {
      // Stay on current lead for manual skip/dial
      return;
    }

    const duration = appSettings?.auto_advance_seconds || 3;
    setAutoAdvanceCountdown(duration);
    let secondsLeft = duration;

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      HapticsService.tick();
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setAutoAdvanceCountdown(null);
        advanceNextLead();
      } else {
        setAutoAdvanceCountdown(secondsLeft);
      }
    }, 1000);
  };

  const advanceNextLead = () => {
    // Clear active call state and timers when advancing/skipping
    setIsOnCall(false);
    setCallDuration(0);
    pan.setValue({ x: 0, y: 0 });
    setSwipeActionText(null);
    setSmsModalVisible(false);
    setNoteModalVisible(false);
    setFollowUpModalVisible(false);
    setNotesModalVisible(false);
    pendingNoAnswerDispositionRef.current = null;
    setIsNoAnswerSmsPrompt(false);

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setAutoAdvanceCountdown(null);
    }

    const cur = currentIndexRef.current;
    const q = queueRef.current;
    if (cur + 1 < q.length) {
      setCurrentIndex(cur + 1);
    } else {
      setCurrentIndex(q.length);
    }
  };

  const goToPreviousLead = () => {
    // Clear active call state and timers when navigating back
    setIsOnCall(false);
    setCallDuration(0);
    pan.setValue({ x: 0, y: 0 });
    setSwipeActionText(null);
    setSmsModalVisible(false);
    setNoteModalVisible(false);
    setFollowUpModalVisible(false);
    setNotesModalVisible(false);
    pendingNoAnswerDispositionRef.current = null;
    setIsNoAnswerSmsPrompt(false);

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setAutoAdvanceCountdown(null);
    }

    const cur = currentIndexRef.current;
    if (cur > 0) {
      setCurrentIndex(cur - 1);
    } else {
      HapticsService.tick();
    }
  };

  const togglePause = async () => {
    await HapticsService.tick();
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setAutoAdvanceCountdown(null);
    }
    setIsAutoPaused((prev) => !prev);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading Calling Queue...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Finished queue
  if (!currentLead || queue.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />
        <View style={styles.finishedContainer}>
          <Flame size={64} color={Colors.badgeWarningText} />
          <Text style={styles.finishedTitle}>Session Complete!</Text>
          <Text style={styles.finishedSubtitle}>
            You have called all active leads in "{listTitle}".
          </Text>

          <View style={styles.sessionSummaryBox}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryVal}>{sessionDials}</Text>
              <Text style={styles.summaryLabel}>Total Dials</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, { color: Colors.heavenlyGold }]}>{sessionAppointments}</Text>
              <Text style={[styles.summaryLabel, { color: Colors.heavenlyGold }]}>🎯 Appts Set</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, { color: Colors.statusSitDownText }]}>{sessionConnects}</Text>
              <Text style={styles.summaryLabel}>Spoke / Met</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, { color: '#C084FC' }]}>{sessionCallbacks}</Text>
              <Text style={styles.summaryLabel}>Callbacks</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.returnButton}
            onPress={handleBackToDashboard}
          >
            <Text style={styles.returnButtonText}>Back to Lead Pipeline</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBackToDashboard}
          style={styles.backButton}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1, marginHorizontal: 6 }}>
          <Text style={styles.queueCounter} numberOfLines={1}>
            Contact {currentIndex + 1} of {queue.length}
          </Text>
          <Text style={styles.listSubheading} numberOfLines={1} ellipsizeMode="tail">{listTitle}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={openEditLeadModal}
            style={styles.hudEditHeaderBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Edit3 size={17} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              cancelAutoAdvanceTimer();
              HapticsService.tick();
              setObjectionsModalVisible(true);
            }}
            style={styles.battlecardsHeaderBtn}
          >
            <ShieldCheck size={16} color="#FFFFFF" />
            <Text style={styles.battlecardsHeaderBtnText}>Scripts</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePause} style={styles.pauseButton}>
            {isAutoPaused ? (
              <Play size={20} color={Colors.badgeSuccessText} />
            ) : (
              <Pause size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <View style={styles.toastBanner}>
          <Text style={styles.toastBannerText}>{toastMessage}</Text>
        </View>
      )}

      {/* Auto Advance Countdown Banner */}
      {autoAdvanceCountdown !== null && (
        <View style={styles.countdownBanner}>
          <Text style={styles.countdownText}>
            Advancing to next contact in {autoAdvanceCountdown}s...
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              setAutoAdvanceCountdown(null);
            }}
          >
            <Text style={styles.countdownCancel}>Pause</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Scrollable Cockpit Viewport */}
      <ScrollView
        style={styles.scrollViewport}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Main Swipeable Educator Contact Card */}
        <Animated.View
          style={[
            styles.contactCard,
            {
              transform: [{ translateX: pan.x }, { rotate: cardRotate }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Swipe Feedback Banner */}
          {swipeActionText && (
            <View
              style={[
                styles.swipeIndicator,
                swipeActionText.includes('PREVIOUS') && { backgroundColor: Colors.brandAccent },
                swipeActionText.includes('NEXT') && { backgroundColor: Colors.callActive },
                swipeActionText.includes('FIRST') && { backgroundColor: Colors.badgeNeutralBg },
              ]}
            >
              <Text style={styles.swipeIndicatorText}>{swipeActionText}</Text>
            </View>
          )}

          {/* Educator Header & School */}
          <View style={styles.contactTopRow}>
            <View style={styles.avatarCircle}>
              <GraduationCap size={24} color={Colors.brandPrimary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.contactName}>{currentLead.name}</Text>
                <TouchableOpacity
                  onPress={openEditLeadModal}
                  style={styles.hudEditLeadBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Edit3 size={13} color={Colors.brandAccent} />
                </TouchableOpacity>
              </View>
              <Text style={styles.contactPhone}>{currentLead.phone}</Text>
              {currentLead.email ? (
                <Text style={styles.contactEmail}>{currentLead.email}</Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {/* Interactive FRS vs Non-FRS Toggle */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: currentLead.is_frs !== false ? 'rgba(139, 92, 246, 0.18)' : 'rgba(59, 130, 246, 0.18)',
                  borderColor: currentLead.is_frs !== false ? '#8B5CF6' : '#3B82F6',
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  gap: 4,
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={handleToggleFrs}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={currentLead.is_frs !== false ? "FRS Member, tap to toggle to Non-FRS" : "Non-FRS Client, tap to toggle to FRS"}
              >
                {currentLead.is_frs !== false ? (
                  <>
                    <Landmark size={10} color="#C084FC" />
                    <Text style={{ color: '#C084FC', fontSize: 10, fontWeight: '800' }}>
                      🏛️ FRS
                    </Text>
                  </>
                ) : (
                  <>
                    <Briefcase size={10} color="#60A5FA" />
                    <Text style={{ color: '#60A5FA', fontSize: 10, fontWeight: '800' }}>
                      💼 NON-FRS
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {currentLead.priority_tier === 3 ? (
                <View style={styles.hudLegacyBadge}>
                  <Archive size={10} color={Colors.badgeNeutralText} />
                  <Text style={styles.hudLegacyBadgeText}>LEGACY LEAD</Text>
                </View>
              ) : (
                <View style={styles.hudFreshBadge}>
                  <Flame size={10} color={Colors.badgeWarningText} />
                  <Text style={styles.hudFreshBadgeText}>FRESH PRIORITY</Text>
                </View>
              )}
              {currentLead.last_disposition && currentLead.last_disposition !== 'pending' ? (
                <View style={[
                  styles.attemptBadge,
                  currentLead.last_disposition === 'appointment_set' && { backgroundColor: Colors.badgeSuccessBg, borderColor: Colors.badgeSuccessText, borderWidth: 1 },
                  currentLead.last_disposition === 'connected' && { backgroundColor: Colors.badgeSuccessBg, borderColor: Colors.badgeSuccessText, borderWidth: 1 },
                  currentLead.last_disposition === 'callback_requested' && { backgroundColor: Colors.badgeWarningBg, borderColor: Colors.badgeWarningText, borderWidth: 1 },
                ]}>
                  <Text style={[
                    styles.attemptText,
                    currentLead.last_disposition === 'appointment_set' && { color: Colors.badgeSuccessText, fontWeight: '700' },
                    currentLead.last_disposition === 'connected' && { color: Colors.badgeSuccessText, fontWeight: '700' },
                    currentLead.last_disposition === 'callback_requested' && { color: Colors.badgeWarningText, fontWeight: '700' },
                  ]}>
                    {currentLead.last_disposition === 'appointment_set' ? '🎯 APPT SET' :
                     currentLead.last_disposition === 'connected' ? '💬 SPOKE' :
                     currentLead.last_disposition === 'callback_requested' ? '📆 CALLBACK' :
                     currentLead.last_disposition === 'voicemail' ? 'VOICEMAIL' :
                     currentLead.last_disposition === 'no_answer' ? 'NO ANSWER' : 'CONTACTED'}
                  </Text>
                </View>
              ) : (
                <View style={styles.attemptBadge}>
                  <Text style={styles.attemptText}>
                    Call #{(currentLead.attempts_count || 0) + 1}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* School & FRS Profile Ribbon */}
          <View style={styles.frsRibbon}>
            <View style={styles.ribbonItem}>
              {currentLead.is_frs !== false ? (
                <School size={14} color={Colors.heavenlyGold} />
              ) : (
                <Building size={14} color={Colors.heavenlyGold} />
              )}
              <Text style={styles.ribbonText}>
                {currentLead.school || (currentLead.is_frs !== false ? 'School District' : 'General Client')}
                {currentLead.room_number ? ` • Room ${currentLead.room_number}` : ''}
              </Text>
            </View>
            <View style={styles.ribbonRow}>
              {currentLead.planning_period ? (() => {
                const pInfo = isTeacherInPlanningNow(currentLead.planning_period, currentLead.school);
                return (
                  <View
                    style={[
                      styles.tagBadge,
                      pInfo.inPlanning
                        ? { backgroundColor: 'rgba(34, 197, 94, 0.22)', borderColor: '#22C55E' }
                        : { backgroundColor: Colors.heavenlyGoldMuted, borderColor: Colors.borderGold },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagText,
                        {
                          color: pInfo.inPlanning ? '#4ADE80' : Colors.heavenlyGold,
                          fontWeight: pInfo.inPlanning ? '700' : '500',
                        },
                      ]}
                    >
                      {pInfo.inPlanning
                        ? `🟢 IN PLANNING NOW (${pInfo.displayTime})`
                        : `⏰ ${currentLead.planning_period}${pInfo.displayTime ? ` (${pInfo.displayTime})` : ''}`}
                    </Text>
                  </View>
                );
              })() : null}
              {currentLead.is_frs !== false && currentLead.years_in_frs ? (
                <View style={styles.tagBadge}>
                  <Text style={styles.tagText}>🎓 {currentLead.years_in_frs} Yrs in FRS</Text>
                </View>
              ) : currentLead.is_frs === false ? (
                <View style={[styles.tagBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3B82F6' }]}>
                  <Text style={[styles.tagText, { color: '#60A5FA' }]}>💼 Non-FRS Client</Text>
                </View>
              ) : null}
              {currentLead.age ? (
                <View style={styles.tagBadge}>
                  <Text style={styles.tagText}>Age: {currentLead.age}</Text>
                </View>
              ) : null}
              {currentLead.frs_knowledge ? (
                <View style={[styles.tagBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]}>
                  <Text style={[styles.tagText, { color: '#F59E0B' }]}>
                    FRS: "{currentLead.frs_knowledge}"
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Custom Written Questions */}
          {currentLead.custom_questions ? (
            <View style={styles.customQuestionBox}>
              <HelpCircle size={14} color={Colors.heavenlyGold} />
              <Text style={styles.customQuestionText}>
                Q: "{currentLead.custom_questions}"
              </Text>
            </View>
          ) : null}

          {/* FRS Report Card Checkboxes / Hot-Buttons */}
          {currentLead.frs_interests && currentLead.frs_interests.length > 0 && (
            <View style={styles.interestsBox}>
              <Text style={styles.interestsHeader}>REPORT CARD NEEDS & INQUIRIES:</Text>
              <View style={styles.interestsList}>
                {currentLead.frs_interests.map((interest, idx) => (
                  <View key={idx} style={styles.interestRow}>
                    <Check size={13} color={Colors.statusSitDownText} style={{ marginTop: 2 }} />
                    <Text style={styles.interestText}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Preferred Meeting Availability Callout */}
          {currentLead.meeting_preferences && currentLead.meeting_preferences.length > 0 && (
            <View style={styles.meetingPrefsBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Calendar size={13} color={Colors.heavenlyGold} />
                <Text style={styles.meetingPrefsTitle}>REQUESTED AVAILABILITY:</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {currentLead.meeting_preferences.map((pref, idx) => (
                  <View key={idx} style={styles.prefChip}>
                    <Text style={styles.prefChipText}>{pref}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Educator Notes Interactive Pill */}
          <TouchableOpacity
            style={styles.notesPreviewPill}
            onPress={() => {
              HapticsService.tick();
              openNotesModal();
            }}
            activeOpacity={0.7}
          >
            <View style={styles.notesPreviewHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FileText size={14} color={Colors.heavenlyGold} />
                <Text style={styles.notesPreviewTitle}>
                  {NotesService.parseNotes(currentLead.notes).length > 0
                    ? `Educator Notes (${NotesService.parseNotes(currentLead.notes).length})`
                    : 'Educator Notes'}
                </Text>
              </View>
              <View style={styles.notesAddChip}>
                <Plus size={12} color="#FFFFFF" />
                <Text style={styles.notesAddChipText}>Add Note</Text>
              </View>
            </View>
            {NotesService.parseNotes(currentLead.notes).length > 0 ? (
              <Text style={styles.notesPreviewSnippet} numberOfLines={2} ellipsizeMode="tail">
                "{NotesService.parseNotes(currentLead.notes)[0].text}"
              </Text>
            ) : (
              <Text style={styles.notesEmptyPrompt}>Tap to record classroom notes, FRS details, or callback preferences...</Text>
            )}
          </TouchableOpacity>

          {/* Proof of Contact / View Scanned Sheet Button */}
          <TouchableOpacity
            style={styles.proofButton}
            onPress={() => {
              cancelAutoAdvanceTimer();
              HapticsService.tick();
              if (currentLead?.source_image_uri) {
                setImageModalVisible(true);
              } else {
                showToast('No original report card photo attached to this lead.');
              }
            }}
            activeOpacity={0.7}
          >
            <FileCheck size={15} color={Colors.heavenlyGold} />
            <Text style={styles.proofButtonText}>View Original Report Card (Zoomable)</Text>
            <Eye size={15} color={Colors.heavenlyGold} />
          </TouchableOpacity>

          {/* Gesture Hint */}
          <Text style={styles.gestureHint}>👉 Swipe right for Previous • Swipe left for Next 👈</Text>
        </Animated.View>
      </ScrollView>

      {/* Fixed Bottom Thumb Zone Calling & Disposition Dock */}
      <View style={styles.fixedBottomDock}>
        {/* Live Call Duration Meter */}
        {isOnCall && (
          <View style={styles.callDurationBox}>
            <Clock size={16} color={Colors.badgeSuccessText} />
            <Text style={styles.callDurationText}>
              Call in progress: {Math.floor(callDuration / 60)}:
              {(callDuration % 60).toString().padStart(2, '0')}
            </Text>
          </View>
        )}

        {/* Big Dial Trigger Button */}
        <TouchableOpacity
          style={[
            styles.mainDialButton,
            isOnCall && { backgroundColor: Colors.callHangup, borderColor: Colors.callHangup },
          ]}
          onPress={handleDial}
          activeOpacity={0.8}
        >
          <PhoneCall size={20} color="#FFFFFF" />
          <Text style={styles.mainDialButtonText}>
            {isOnCall ? `Active Call: ${currentLead.phone}` : `Dial ${currentLead.phone}`}
          </Text>
        </TouchableOpacity>

        {/* 1-Tap Disposition Controls Dock */}
        <View style={styles.dispositionContainer}>
          <Text style={styles.dispositionHeading}>LOG CALL OUTCOME (1-TAP)</Text>

          <View style={styles.buttonGrid}>
            {/* APPOINTMENT SET (Hero Full-Width Action) */}
            <TouchableOpacity
              style={styles.apptSetHeroButton}
              onPress={() => {
                HapticsService.tick();
                setApptSchedulerVisible(true);
              }}
              activeOpacity={0.75}
            >
              <CheckCircle2 size={20} color={Colors.badgeSuccessText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.apptSetHeroTitle}>🎯 APPOINTMENT SET</Text>
                <Text style={styles.apptSetHeroSubtitle}>Pick day, period & classroom for sit-down</Text>
              </View>
            </TouchableOpacity>

            {/* Connected / Spoke without final date */}
            <TouchableOpacity
              style={[styles.dispositionButton, { backgroundColor: Colors.callActive }]}
              onPress={() => {
                setIsSettingAppt(false);
                setCallNote('');
                setNoteModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <CheckCircle2 size={16} color="#FFFFFF" />
              <Text style={styles.dispositionButtonText}>💬 Spoke</Text>
              <Text style={styles.dispositionSubtext}>Connected on call</Text>
            </TouchableOpacity>

            {/* No Answer / VM Drop */}
            <TouchableOpacity
              style={[styles.dispositionButton, { backgroundColor: Colors.badgeNeutralBg, borderWidth: 1, borderColor: Colors.borderStrong }]}
              onPress={() => handleDisposition('no_answer')}
              activeOpacity={0.7}
            >
              <PhoneOff size={16} color={Colors.badgeNeutralText} />
              <Text style={[styles.dispositionButtonText, { color: Colors.badgeNeutralText }]}>📞 No Answer</Text>
              <Text style={[styles.dispositionSubtext, { color: Colors.textMuted }]}>Log & follow-up</Text>
            </TouchableOpacity>

            {/* Quick SMS */}
            <TouchableOpacity
              style={[styles.dispositionButton, { backgroundColor: Colors.brandAccent }]}
              onPress={openSmsModal}
              activeOpacity={0.7}
            >
              <MessageSquare size={16} color="#FFFFFF" />
              <Text style={styles.dispositionButtonText}>✉️ AI SMS</Text>
              <Text style={styles.dispositionSubtext}>Personalized text</Text>
            </TouchableOpacity>

            {/* Schedule Follow-up */}
            <TouchableOpacity
              style={[styles.dispositionButton, { backgroundColor: Colors.badgeWarningBg, borderWidth: 1, borderColor: Colors.badgeWarningText }]}
              onPress={() => {
                cancelAutoAdvanceTimer();
                setFollowUpModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Calendar size={16} color={Colors.badgeWarningText} />
              <Text style={[styles.dispositionButtonText, { color: Colors.badgeWarningText }]}>📅 Callback</Text>
              <Text style={[styles.dispositionSubtext, { color: Colors.badgeWarningText }]}>Set reminder</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Actions Row */}
          <View style={styles.bottomActionsRow}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TouchableOpacity style={styles.dncLinkButton} onPress={handleMarkDNC}>
                <ShieldAlert size={14} color={Colors.badgeDangerText} />
                <Text style={styles.dncLinkText}>DNC</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dncLinkButton}
                onPress={async () => {
                  cancelAutoAdvanceTimer();
                  await handleDisposition('bad_number', 'Bad / Disconnected number', true);
                }}
              >
                <AlertTriangle size={14} color={Colors.badgeWarningText} />
                <Text style={[styles.dncLinkText, { color: Colors.badgeWarningText }]}>Bad #</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dncLinkButton}
                onPress={() => {
                  cancelAutoAdvanceTimer();
                  setIsSettingAppt(false);
                  setIsOtherDisposition(true);
                  setCallNote('');
                  setNoteModalVisible(true);
                }}
              >
                <ClipboardList size={14} color="#8B5CF6" />
                <Text style={[styles.dncLinkText, { color: '#8B5CF6' }]}>Other...</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {currentIndex > 0 && (
                <TouchableOpacity style={styles.skipButton} onPress={goToPreviousLead}>
                  <SkipBack size={14} color={Colors.textMuted} />
                  <Text style={styles.skipButtonText}>Previous</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.skipButton} onPress={advanceNextLead}>
                <SkipForward size={14} color={Colors.textMuted} />
                <Text style={styles.skipButtonText}>Skip Educator</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Interactive Zoomable Report Card Photo Modal */}
      <ZoomableImageModal
        visible={imageModalVisible}
        imageUri={currentLead?.source_image_uri || null}
        title="Proof of Contact Request"
        subtitle={`${currentLead?.name || 'Client'} • ${currentLead?.school || 'Review Card'}`}
        onClose={() => setImageModalVisible(false)}
      />

      {/* World-Class Interactive Appointment Scheduler Modal */}
      <AppointmentSchedulerModal
        visible={apptSchedulerVisible}
        lead={currentLead}
        initialNotes={currentLead?.notes || ''}
        onClose={() => setApptSchedulerVisible(false)}
        onSave={async ({ scheduledDate, scheduledISO, roomNumber, notes }) => {
          let noteText = notes
            ? `[Confirmed Sit-Down] ${notes}`
            : `[Confirmed Sit-Down] Scheduled for ${scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
          if (roomNumber) {
            noteText += ` in Room ${roomNumber}`;
            currentLead.room_number = roomNumber;
          }
          setCallNote(noteText);
          await handleDisposition('appointment_set', noteText, true, scheduledDate);
        }}
      />

      {/* Connected / Appointment Notes Modal */}
      <Modal
        visible={noteModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setNoteModalVisible(false)}
          />
          <View style={styles.modalContent} pointerEvents="auto">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>
                  {isSettingAppt
                    ? `🎯 Appointment Set: ${currentLead.name}`
                    : isOtherDisposition
                    ? `📋 Other Outcome: ${currentLead.name}`
                    : `Call Notes: ${currentLead.name}`}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalHeaderCloseBtn}
                onPress={() => setNoteModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 8 }}>
              {isSettingAppt
                ? 'Record the confirmed date, time, and classroom room number for your sit-down:'
                : isOtherDisposition
                ? 'Select quick reason chips or enter custom outcome notes:'
                : 'Record key conversation takeaways and follow-up points:'}
            </Text>

            {isOtherDisposition && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
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
                  const isIncluded = callNote.includes(chip);
                  return (
                    <TouchableOpacity
                      key={chip}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 16,
                        backgroundColor: isIncluded ? 'rgba(139, 92, 246, 0.2)' : Colors.surfaceSubtle,
                        borderWidth: 1,
                        borderColor: isIncluded ? '#8B5CF6' : Colors.borderSubtle,
                      }}
                      onPress={() => {
                        HapticsService.tick().catch(() => {});
                        if (isIncluded) {
                          setCallNote((prev) => prev.replace(chip, '').replace(/^;\s*|;\s*$/g, '').trim());
                        } else {
                          setCallNote((prev) => (prev.trim() ? `${prev.trim()}; ${chip}` : chip));
                        }
                      }}
                    >
                      <Text style={{ fontSize: 11, color: isIncluded ? '#8B5CF6' : Colors.textSecondary, fontWeight: '600' }}>
                        {isIncluded ? '✓ ' : '+ '}{chip}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TextInput
              style={styles.modalInput}
              placeholder={
                isSettingAppt
                  ? 'e.g. Confirmed sit-down for Thursday at 1:15 PM (Period 5) in Room 204...'
                  : isOtherDisposition
                  ? 'Enter custom notes (e.g. educator out on leave, call back in spring)...'
                  : 'Enter conversation notes, retirement goals, or follow-up details...'
              }
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
              value={callNote}
              onChangeText={setCallNote}
              autoFocus
            />

            {/* 1-Tap Calendar Sync Buttons for Confirmed Appointments */}
            {isSettingAppt && (() => {
              const schedule = getScheduleForSchool(currentLead.school);
              const periodId = matchPeriodId(currentLead.planning_period);
              const period = schedule.find((p) => p.id === periodId) || schedule[2];
              const [startH, startM] = (period.startTime || '09:00').split(':').map(Number);
              const now = new Date();

              const availableDays: { label: string; subLabel: string; date: Date }[] = [];
              const dayOfWeek = now.getDay();
              if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                const todaySlot = new Date(now);
                todaySlot.setHours(startH || 9, startM || 0, 0, 0);
                if (todaySlot.getTime() > now.getTime()) {
                  availableDays.push({
                    label: 'Today',
                    subLabel: todaySlot.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
                    date: todaySlot,
                  });
                }
              }

              let checkD = new Date(now);
              checkD.setDate(checkD.getDate() + 1);
              while (availableDays.length < 5) {
                const dow = checkD.getDay();
                if (dow >= 1 && dow <= 5) {
                  const d = new Date(checkD);
                  d.setHours(startH || 9, startM || 0, 0, 0);
                  const isTom = availableDays.length === 0 || (availableDays.length === 1 && availableDays[0].label === 'Today');
                  availableDays.push({
                    label: isTom ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' }),
                    subLabel: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
                    date: d,
                  });
                }
                checkD.setDate(checkD.getDate() + 1);
              }

              const scheduledDate = selectedApptDate || availableDays[0]?.date || CalendarService.calculateNextPlanningDate(
                currentLead.planning_period,
                currentLead.school
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
                <View style={{ marginTop: 10, marginBottom: 6 }}>
                  <Text style={{ color: Colors.heavenlyGold, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
                    SELECT SIT-DOWN DAY:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {availableDays.map((d, idx) => {
                        const isSelected = scheduledDate.toDateString() === d.date.toDateString();
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[
                              styles.dayPill,
                              isSelected && styles.dayPillSelected,
                            ]}
                            onPress={() => {
                              HapticsService.tick();
                              setSelectedApptDate(d.date);
                            }}
                          >
                            <Text style={[styles.dayPillLabel, isSelected && styles.dayPillLabelSelected]}>
                              {d.label}
                            </Text>
                            <Text style={[styles.dayPillSub, isSelected && styles.dayPillSubSelected]}>
                              {d.subLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <Text style={{ color: Colors.heavenlyGold, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                    📅 1-TAP CALENDAR SYNC ({dateStr} @ {timeStr})
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 8 }}>
                    Pre-fills Room {currentLead.room_number || 'Classroom'}, phone, FRS topics & 15-min sound alarm:
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      style={styles.calSyncBtn}
                      onPress={async () => {
                        HapticsService.medium();
                        const event = CalendarService.buildEducatorEvent(currentLead, scheduledDate, 25, callNote);
                        await CalendarService.downloadIcsFile(event);
                      }}
                    >
                      <Text style={styles.calSyncBtnText}>🍏 Apple / iCal (.ics)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.calSyncBtn, { borderColor: '#38BDF8' }]}
                      onPress={() => {
                        HapticsService.medium();
                        const event = CalendarService.buildEducatorEvent(currentLead, scheduledDate, 25, callNote);
                        CalendarService.openGoogleCalendar(event);
                      }}
                    >
                      <Text style={[styles.calSyncBtnText, { color: '#38BDF8' }]}>🌐 Google Calendar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.calSyncBtn, { borderColor: '#A78BFA' }]}
                      onPress={() => {
                        HapticsService.medium();
                        const event = CalendarService.buildEducatorEvent(currentLead, scheduledDate, 25, callNote);
                        CalendarService.openOutlookCalendar(event);
                      }}
                    >
                      <Text style={[styles.calSyncBtnText, { color: '#A78BFA' }]}>📧 Outlook Web</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setNoteModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSaveNote}
              >
                <Text style={styles.modalSaveText}>
                  {isSettingAppt ? 'Save Appt & Next' : isOtherDisposition ? 'Save Other & Next' : 'Save & Next'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Live Objection Battlecards & Scripts Modal */}
      <Modal
        visible={objectionsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setObjectionsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              HapticsService.tick();
              setObjectionsModalVisible(false);
            }}
          />
          <View style={[styles.modalContent, { maxHeight: '88%', paddingBottom: 16 }]} pointerEvents="auto">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 }}>
                <ShieldCheck size={20} color={Colors.heavenlyGold} />
                <Text style={styles.modalTitle} numberOfLines={1}>FRS Scripts & Battlecards</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  HapticsService.tick();
                  setObjectionsModalVisible(false);
                }}
                style={styles.modalHeaderCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
              Tap any objection to view verbatim, word-for-word Florida educator talk-tracks:
            </Text>

            <ScrollView style={{ maxHeight: 390 }} showsVerticalScrollIndicator={false}>
              {FRS_OBJECTIONS.map((item) => {
                const isExpanded = selectedObjection?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.objectionCardItem, isExpanded && styles.objectionCardItemActive]}
                    onPress={() => {
                      HapticsService.tick();
                      setSelectedObjection(isExpanded ? null : item);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.objectionCategoryText}>{item.category.toUpperCase()}</Text>
                      <Text style={{ color: Colors.heavenlyGold, fontSize: 11, fontWeight: '700' }}>
                        {isExpanded ? '▲ Hide Script' : '▼ Read Script'}
                      </Text>
                    </View>
                    <Text style={styles.objectionTitleText}>{item.objection}</Text>
                    <Text style={styles.objectionRebuttalSummary}>💡 Key: {item.quickRebuttal}</Text>

                    {isExpanded && (
                      <View style={styles.objectionExpandedBox}>
                        <Text style={styles.objectionScriptLabel}>🗣️ WORD-FOR-WORD SCRIPT:</Text>
                        <Text style={styles.objectionScriptText}>{item.verbatimScript}</Text>
                        <Text style={styles.objectionPsychologyText}>🧠 Psychology: {item.psychologyNote}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalDoneFooterBtn}
              onPress={() => {
                HapticsService.tick();
                setObjectionsModalVisible(false);
              }}
            >
              <CheckCircle2 size={16} color="#FFFFFF" />
              <Text style={styles.modalDoneFooterBtnText}>Done / Return to Calling</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Schedule Follow-up Modal */}
      <Modal
        visible={followUpModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFollowUpModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setFollowUpModalVisible(false)}
          />
          <View style={styles.modalContent} pointerEvents="auto">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>Schedule Callback: {currentLead.name}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalHeaderCloseBtn}
                onPress={() => setFollowUpModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12 }}>
              Choose a quick callback window based on educator availability:
            </Text>

            <View style={styles.presetButtonsGrid}>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => handleScheduleFollowUp(2)}
              >
                <Text style={styles.presetBtnText}>⏱️ In 2 Hours</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => handleScheduleFollowUp(24)}
              >
                <Text style={styles.presetBtnText}>🌅 Tomorrow 10 AM</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => handleScheduleFollowUp(48)}
              >
                <Text style={styles.presetBtnText}>📅 In 2 Days</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => handleScheduleFollowUp(168)}
              >
                <Text style={styles.presetBtnText}>📆 Next Week</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, { height: 60, marginTop: 12 }]}
              placeholder="Add reminder note (e.g. Call back during 4th period planning)..."
              placeholderTextColor="#64748B"
              value={followUpNote}
              onChangeText={setFollowUpNote}
            />

            <View style={[styles.modalButtons, { gap: 10, marginTop: 14 }]}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setFollowUpModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, { flex: 1 }]}
                onPress={() => handleScheduleFollowUp(24)}
              >
                <Text style={styles.modalSaveText}>Schedule Callback</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI-Powered Multi-template SMS Modal */}
      <Modal
        visible={smsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (isNoAnswerSmsPrompt) {
            handleSkipNoAnswerSms();
          } else {
            setSmsModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              if (isNoAnswerSmsPrompt) {
                handleSkipNoAnswerSms();
              } else {
                setSmsModalVisible(false);
              }
            }}
          />
          <View style={styles.modalContent} pointerEvents="auto">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.modalTitle}>
                {isNoAnswerSmsPrompt ? 'Draft Follow-Up Text' : 'Draft Text Message'}
              </Text>
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
                  onPress={() => {
                    if (isNoAnswerSmsPrompt) {
                      handleSkipNoAnswerSms();
                    } else {
                      setSmsModalVisible(false);
                    }
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <X size={18} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>
              {isNoAnswerSmsPrompt
                ? 'Cadence follow-up template. Tap Send to launch your native messaging app, or Skip to move to the next lead:'
                : 'Preview & edit before sending. Gemini crafts personalized copy based on call notes and FRS needs:'}
            </Text>

            {/* Quick Focus Chips */}
            <View style={styles.focusChipRow}>
              {(currentLead?.custom_questions || currentLead?.notes) && (
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
                  (Boolean(currentLead?.appointment_scheduled_at) || currentLead?.last_disposition === 'appointment_set') && {
                    borderColor: '#38BDF8',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  },
                ]}
                onPress={() => handleGenerateAiSms('meeting_confirmation')}
              >
                <Text
                  style={[
                    styles.focusChipText,
                    (Boolean(currentLead?.appointment_scheduled_at) || currentLead?.last_disposition === 'appointment_set') && {
                      color: '#38BDF8',
                      fontWeight: '800',
                    },
                  ]}
                >
                  {Boolean(currentLead?.appointment_scheduled_at) || currentLead?.last_disposition === 'appointment_set'
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
              value={customSmsBody}
              onChangeText={setCustomSmsBody}
              multiline
              placeholder="Drafting persuasive SMS..."
              placeholderTextColor={Colors.textMuted}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: Colors.textMuted, fontSize: 11 }}>
                {customSmsBody.length} characters • Tap above to re-generate or edit directly
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={isNoAnswerSmsPrompt ? handleSkipNoAnswerSms : () => setSmsModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>
                  {isNoAnswerSmsPrompt ? 'Skip SMS & Advance ⏭️' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSendCustomSms}
              >
                <Text style={styles.modalSaveText}>
                  {isNoAnswerSmsPrompt ? 'Send SMS & Advance 💬' : 'Send SMS 💬'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Structured Notes Manager Modal */}
      <Modal
        visible={notesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setNotesModalVisible(false)}
          />
          <View style={[styles.modalContent, { maxHeight: '85%', width: '92%' }]} pointerEvents="auto">
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <FileText size={18} color={Colors.heavenlyGold} />
                <Text style={styles.modalTitle} numberOfLines={1}>
                  Notes: {currentLead?.name || 'Educator'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setNotesModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Notes List Scroll Area */}
            <ScrollView
              style={{ maxHeight: 220, marginVertical: 8 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {currentLead && NotesService.parseNotes(currentLead.notes).length > 0 ? (
                NotesService.parseNotes(currentLead.notes).map((entry) => (
                  <View key={entry.id} style={styles.noteItemCard}>
                    <View style={styles.noteItemTopRow}>
                      <View style={styles.noteTimestampBadge}>
                        <Clock size={11} color={Colors.heavenlyGold} />
                        <Text style={styles.noteTimestampText}>{entry.timestamp}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.noteActionBtn}
                          onPress={() => handleStartEditNote(entry)}
                        >
                          <Edit3 size={13} color={Colors.deepSkyBlueLight} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.noteActionBtn}
                          onPress={() => handleDeleteNote(entry.id)}
                        >
                          <Trash2 size={13} color={Colors.statusDangerText} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.noteItemBodyText}>{entry.text}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.noNotesEmptyBox}>
                  <Text style={styles.noNotesEmptyText}>No notes recorded for this educator yet.</Text>
                </View>
              )}
            </ScrollView>

            {/* Quick-Tag Chips */}
            <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
              QUICK PRE-FILLS:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36, marginBottom: 8 }}>
              {EDUCATOR_QUICK_TAGS.map((tag, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.quickTagPill}
                  onPress={() => handleAddNote(tag)}
                >
                  <Text style={styles.quickTagText}>+ {tag}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Add / Edit Input */}
            <TextInput
              style={[styles.modalInput, { height: 75, marginTop: 4 }]}
              value={noteDraftText}
              onChangeText={setNoteDraftText}
              placeholder={editingNoteId ? "Editing note content..." : "Type custom educator note..."}
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            {/* Modal Buttons */}
            <View style={styles.modalButtons}>
              {editingNoteId ? (
                <>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => {
                      setEditingNoteId(null);
                      setNoteDraftText('');
                    }}
                  >
                    <Text style={styles.modalCancelText}>Cancel Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSaveButton}
                    onPress={handleSaveEditNote}
                  >
                    <Text style={styles.modalSaveText}>Save Changes</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setNotesModalVisible(false)}
                  >
                    <Text style={styles.modalCancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveButton, !noteDraftText.trim() && { opacity: 0.5 }]}
                    onPress={() => handleAddNote()}
                    disabled={!noteDraftText.trim()}
                  >
                    <Text style={styles.modalSaveText}>Add Note</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Educator Details Modal */}
      <Modal
        visible={editLeadModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditLeadModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setEditLeadModalVisible(false)}
          />
          <View style={[styles.modalContent, { maxHeight: '90%', width: '92%' }]} pointerEvents="auto">
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Edit3 size={18} color={Colors.heavenlyGold} />
                <Text style={styles.modalTitle} numberOfLines={1}>Edit Educator Profile</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setEditLeadModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380, marginVertical: 8 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.editFieldLabel}>Educator Name</Text>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Full Name"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.editFieldLabel, { marginTop: 10 }]}>Client Type / Retirement System</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.hudTierEditBtn,
                    editIsFrs && {
                      backgroundColor: 'rgba(139, 92, 246, 0.18)',
                      borderColor: '#8B5CF6',
                    },
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    setEditIsFrs(true);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Set as FRS Member"
                >
                  <Landmark size={14} color={editIsFrs ? '#C084FC' : Colors.brandAccent} />
                  <Text style={[styles.hudTierEditBtnText, editIsFrs && { color: '#C084FC', fontWeight: '800' }]}>
                    🏛️ FRS Member
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.hudTierEditBtn,
                    !editIsFrs && {
                      backgroundColor: 'rgba(59, 130, 246, 0.18)',
                      borderColor: '#3B82F6',
                    },
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    setEditIsFrs(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Set as Non-FRS Client"
                >
                  <Briefcase size={14} color={!editIsFrs ? '#60A5FA' : Colors.textMuted} />
                  <Text style={[styles.hudTierEditBtnText, !editIsFrs && { color: '#60A5FA', fontWeight: '800' }]}>
                    💼 Non-FRS Client
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.editFieldLabel, { marginTop: 10 }]}>Phone Number (Tap to correct OCR)</Text>
              <TextInput
                style={styles.editInput}
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
                placeholder="(386) 555-1234"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.editFieldLabel, { marginTop: 10 }]}>School / District</Text>
              <TextInput
                style={styles.editInput}
                value={editSchool}
                onChangeText={setEditSchool}
                placeholder="e.g. Deltona High"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.editFieldLabel, { marginTop: 10 }]}>Room Number</Text>
              <TextInput
                style={styles.editInput}
                value={editRoomNumber}
                onChangeText={setEditRoomNumber}
                placeholder="e.g. 4-102"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.editFieldLabel, { marginTop: 10 }]}>Planning Period</Text>
              <TextInput
                style={styles.editInput}
                value={editPlanningPeriod}
                onChangeText={setEditPlanningPeriod}
                placeholder="e.g. 3rd Period (10:15 - 11:05 AM)"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.editFieldLabel, { marginTop: 10 }]}>Email Address</Text>
              <TextInput
                style={styles.editInput}
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="e.g. teacher@volusia.k12.fl.us"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.editFieldLabel, { marginTop: 10 }]}>Years in FRS</Text>
              <TextInput
                style={styles.editInput}
                value={editYearsInFrs}
                onChangeText={setEditYearsInFrs}
                placeholder="e.g. 12"
                placeholderTextColor={Colors.textMuted}
              />
            </ScrollView>

            <View style={[styles.modalButtons, { marginTop: 8 }]}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setEditLeadModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, (!editName.trim() || !editPhone.trim()) && { opacity: 0.5 }]}
                onPress={handleSaveEditedLead}
                disabled={!editName.trim() || !editPhone.trim()}
              >
                <Text style={styles.modalSaveText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create<any>({
  container: {
    flex: 1,
    backgroundColor: Colors.bgApp,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.brandPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.brandPrimary,
  },
  backButton: {
    padding: 8,
  },
  queueCounter: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listSubheading: {
    fontSize: 12,
    color: Colors.focusRing,
  },
  pauseButton: {
    padding: 8,
  },
  countdownBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  countdownText: {
    color: Colors.brandAccent,
    fontSize: 13,
    fontWeight: '600',
  },
  countdownCancel: {
    color: Colors.callHangup,
    fontWeight: '700',
    fontSize: 13,
  },
  scrollViewport: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 14,
  },
  contactCard: {
    backgroundColor: Colors.surfaceCard,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    touchAction: 'pan-y' as any,
    userSelect: 'none' as any,
    cursor: 'grab' as any,
  },
  swipeIndicator: {
    backgroundColor: Colors.brandAccent,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 8,
  },
  swipeIndicatorText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  contactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  contactPhone: {
    fontSize: 14,
    color: Colors.brandAccent,
    fontWeight: '700',
    marginTop: 1,
  },
  contactEmail: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  attemptBadge: {
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  attemptText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  hudLegacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeNeutralBg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  hudLegacyBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.badgeNeutralText,
  },
  hudFreshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeWarningBg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  hudFreshBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.badgeWarningText,
  },
  frsRibbon: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 6,
  },
  ribbonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ribbonText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  ribbonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  tagBadge: {
    backgroundColor: Colors.surfaceCard,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tagText: {
    color: Colors.brandAccent,
    fontSize: 11,
    fontWeight: '600',
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
  interestsList: {
    gap: 6,
    marginTop: 2,
    width: '100%',
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
  },
  prefChip: {
    backgroundColor: Colors.surfaceCard,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  prefChipText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  proofButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  proofButtonText: {
    color: Colors.brandAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  fixedBottomDock: {
    backgroundColor: Colors.bgApp,
    borderTopWidth: 1.5,
    borderTopColor: Colors.borderSubtle,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },
  callDurationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.badgeSuccessBg,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 6,
    gap: 6,
  },
  callDurationText: {
    color: Colors.badgeSuccessText,
    fontWeight: '700',
    fontSize: 12,
  },
  mainDialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.callActive,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 6,
    gap: 8,
  },
  mainDialButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  gestureHint: {
    color: Colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
  },
  dispositionContainer: {
    paddingHorizontal: 0,
    marginTop: 0,
    paddingBottom: 0,
  },
  dispositionHeading: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
    textAlign: 'center',
  },
  apptSetHeroButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeSuccessBg,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: Colors.badgeSuccessText,
  },
  apptSetHeroTitle: {
    color: Colors.badgeSuccessText,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  apptSetHeroSubtitle: {
    color: Colors.badgeSuccessText,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  dispositionButton: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dispositionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  dispositionSubtext: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9,
    fontWeight: '600',
  },
  bottomActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  dncLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
  },
  dncLinkText: {
    color: Colors.badgeDangerText,
    fontSize: 12,
    fontWeight: '600',
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
  },
  skipButtonText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 15,
  },
  finishedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  finishedTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.brandPrimary,
    marginTop: 18,
  },
  finishedSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  sessionSummaryBox: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 36,
    marginTop: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryVal: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: 30,
  },
  returnButton: {
    backgroundColor: Colors.brandPrimary,
    borderWidth: 1,
    borderColor: Colors.brandPrimary,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 36,
  },
  returnButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.bgModal,
    justifyContent: 'center',
    padding: 20,
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
  presetButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetBtn: {
    width: '48%',
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
  },
  presetBtnText: {
    color: Colors.textPrimary,
    fontSize: 13,
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
  battlecardsHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.focusRing,
    gap: 4,
  },
  battlecardsHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  calSyncBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  calSyncBtnText: {
    color: Colors.brandAccent,
    fontSize: 11,
    fontWeight: '700',
  },
  objectionCardItem: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  objectionCardItemActive: {
    borderColor: Colors.brandAccent,
    backgroundColor: Colors.badgeWarningBg,
  },
  objectionCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.brandAccent,
    letterSpacing: 0.8,
  },
  objectionTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 4,
  },
  objectionRebuttalSummary: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  objectionExpandedBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  objectionScriptLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.badgeSuccessText,
    marginBottom: 4,
  },
  objectionScriptText: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 19,
    fontStyle: 'italic',
    backgroundColor: Colors.surfaceCard,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  objectionPsychologyText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
  },
  notesPreviewPill: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  notesPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notesPreviewTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.brandAccent,
    letterSpacing: 0.5,
  },
  notesAddChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.brandAccent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  notesAddChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  notesPreviewSnippet: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  notesEmptyPrompt: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  modalCloseButton: {
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
  modalDoneFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 14,
    gap: 8,
  },
  modalDoneFooterBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  noteItemCard: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: 10,
    marginBottom: 8,
  },
  noteItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  noteTimestampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.badgeNeutralBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  noteTimestampText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  noteActionBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: Colors.surfaceCard,
  },
  noteItemBodyText: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  noNotesEmptyBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noNotesEmptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  quickTagPill: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  quickTagText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  hudEditHeaderBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: Colors.focusRing,
  },
  hudEditLeadBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSubtle,
  },
  toastBanner: {
    backgroundColor: Colors.badgeSuccessBg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.badgeSuccessText,
  },
  toastBannerText: {
    color: Colors.badgeSuccessText,
    fontSize: 12,
    fontWeight: '700',
  },
  editFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  editInput: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  dayPill: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 70,
  },
  dayPillSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: '#10B981',
  },
  dayPillLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  dayPillLabelSelected: {
    color: '#10B981',
  },
  dayPillSub: {
    color: '#94A3B8',
    fontSize: 9,
    marginTop: 1,
  },
  dayPillSubSelected: {
    color: '#34D399',
  },
  hudTierEditBtn: {
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
    gap: 6,
  },
  hudTierEditBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
