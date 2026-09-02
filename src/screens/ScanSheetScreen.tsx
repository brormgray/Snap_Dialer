import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Image as ImageIcon,
  Check,
  Trash2,
  Sparkles,
  ArrowLeft,
  Clipboard,
  PhoneCall,
  X,
  Flame,
  Archive,
  Layers,
  FolderPlus,
} from 'lucide-react-native';
import { VisionService } from '../services/visionService';
import { DocumentScannerService } from '../services/documentScannerService';
import { LeadsRepository } from '../db/leadsRepository';
import { SettingsRepository } from '../db/settingsRepository';
import { HapticsService } from '../services/hapticsService';
import { ExtractedLeadItem, LeadList } from '../types';
import { Colors } from '../theme/colors';

export default function ScanSheetScreen({ navigation }: any) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatusText, setProcessingStatusText] = useState<string>('Analyzing Report Card with Gemini AI...');
  const [extractedLeads, setExtractedLeads] = useState<ExtractedLeadItem[]>([]);
  const [apiKey, setApiKey] = useState<string>('');
  const [hasScanned, setHasScanned] = useState<boolean>(false);

  // List Assignment & Priority Tier State
  const [priorityTier, setPriorityTier] = useState<number>(1); // 1 = Fresh (Default), 3 = Legacy / Archive
  const [availableLists, setAvailableLists] = useState<LeadList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('master_queue');
  const [isCreatingNewList, setIsCreatingNewList] = useState<boolean>(false);
  const [newListName, setNewListName] = useState<string>('');

  useEffect(() => {
    SettingsRepository.getSettings().then((s) => {
      if (s.gemini_api_key) {
        setApiKey(s.gemini_api_key);
      }
    });
    LeadsRepository.getAllLists().then((lists) => {
      setAvailableLists(lists);
    });
  }, []);

  // Offline text paste modal state
  const [pasteModalVisible, setPasteModalVisible] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState<string>('');

  const takePhoto = async () => {
    await HapticsService.tick();
    try {
      const scannedUri = await DocumentScannerService.scanDocument();
      if (scannedUri) {
        setImageUri(scannedUri);
        setIsProcessing(true);
        setProcessingStatusText('Analyzing Report Card with Gemini AI...');
        handleImageCaptured(scannedUri);
      }
    } catch (e: any) {
      setIsProcessing(false);
      Alert.alert('Scanner Error', e?.message || 'Failed to scan document.');
    }
  };

  const pickImage = async () => {
    await HapticsService.tick();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Media library permission is required to import photos of lead sheets.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (result.assets.length === 1) {
          setImageUri(result.assets[0].uri);
          setIsProcessing(true);
          setProcessingStatusText('Analyzing Report Card with Gemini AI...');
          const optimizedUri = await DocumentScannerService.downsampleAndCompress(result.assets[0].uri);
          handleImageCaptured(optimizedUri);
        } else {
          await handleBatchImagesCaptured(result.assets.map((a) => a.uri));
        }
      }
    } catch (e: any) {
      setIsProcessing(false);
      Alert.alert('Image Error', e?.message || 'Failed to select image.');
    }
  };

  const handleBatchImagesCaptured = async (rawUris: string[]) => {
    setIsProcessing(true);
    setHasScanned(false);
    const aggregatedLeads: ExtractedLeadItem[] = [];
    let firstOptimizedUri: string | null = null;

    try {
      for (let i = 0; i < rawUris.length; i++) {
        setProcessingStatusText(`Analyzing card ${i + 1} of ${rawUris.length} with Gemini AI...`);
        try {
          const optUri = await DocumentScannerService.downsampleAndCompress(rawUris[i]);
          if (!firstOptimizedUri) {
            firstOptimizedUri = optUri;
            setImageUri(optUri);
          }
          const cardLeads = await VisionService.extractLeadsFromImage(optUri, apiKey);
          for (const lead of cardLeads) {
            aggregatedLeads.push({
              ...lead,
              source_image_uri: optUri,
            });
          }
        } catch (cardErr: any) {
          console.warn(`Card ${i + 1} extraction skipped:`, cardErr);
        }
      }

      if (aggregatedLeads.length > 0) {
        await HapticsService.success();
        setExtractedLeads(aggregatedLeads);
        setHasScanned(true);
      } else {
        // Fallback: create manual placeholder entries for each card photo
        const manualBatch = rawUris.map((u, idx) => ({
          id: `manual_batch_${Date.now()}_${idx}`,
          name: '',
          phone: '',
          school: 'VOL',
          email: '',
          planning_period: '',
          years_in_frs: '',
          frs_interests: [],
          meeting_preferences: [],
          source_image_uri: u,
          isValid: true,
        }));
        setExtractedLeads(manualBatch);
        setHasScanned(true);
        Alert.alert(
          'AI Quota Notice',
          'AI scanning could not complete due to credit or rate limits. All card photos have been loaded below for direct manual review.',
          [
            { text: 'Review Cards', style: 'default' },
            { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') },
          ]
        );
      }
    } catch (e: any) {
      Alert.alert('Batch Ingestion Notice', e?.message || 'Could not parse batch images.');
    } finally {
      setIsProcessing(false);
      setProcessingStatusText('Analyzing Report Card with Gemini AI...');
    }
  };

  const handleImageCaptured = async (uri: string) => {
    setImageUri(uri);
    setIsProcessing(true);
    try {
      const leads = await VisionService.extractLeadsFromImage(uri, apiKey);
      await HapticsService.success();
      setExtractedLeads(leads);
      setHasScanned(true);
    } catch (e: any) {
      const rawMsg = e?.message || 'Could not parse leads from image.';
      const isQuota =
        rawMsg.includes('QUOTA_EXHAUSTED') ||
        rawMsg.includes('RESOURCE_EXHAUSTED') ||
        rawMsg.includes('quota');
      const isTimeout = rawMsg.includes('TIMEOUT') || rawMsg.includes('timed out');

      let title = 'Scan Notice';
      let displayMsg = rawMsg.replace(/^(QUOTA_EXHAUSTED|TIMEOUT):\s*/, '');

      if (isQuota) {
        title = 'AI Quota Exhausted';
        displayMsg =
          'Google Gemini free credits or rate limit reached. You can review the captured photo and enter details manually below, or update your free Gemini API key in Settings.';
      } else if (isTimeout) {
        title = 'Card Analysis Timed Out';
        displayMsg =
          'Card analysis timed out after 15 seconds. You can review the captured photo and enter details manually below.';
      }

      Alert.alert(title, displayMsg, [
        { text: 'Enter Manually', style: 'default' },
        { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') },
      ]);

      // Initialize an empty editable educator entry linked to the photo so user can manually verify
      setExtractedLeads([
        {
          id: `manual_${Date.now()}`,
          name: '',
          phone: '',
          school: 'VOL',
          email: '',
          planning_period: '',
          years_in_frs: '',
          frs_interests: [],
          meeting_preferences: [],
          isValid: true,
        },
      ]);
      setHasScanned(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleParsePastedText = async () => {
    if (!pastedText.trim()) return;
    await HapticsService.success();
    setPasteModalVisible(false);
    setIsProcessing(true);

    setTimeout(() => {
      const leads = VisionService.parseUnstructuredText(pastedText);
      setExtractedLeads(leads);
      setHasScanned(true);
      setIsProcessing(false);
    }, 300);
  };

  const handleUpdateLead = (index: number, field: keyof ExtractedLeadItem, value: string) => {
    const updated = [...extractedLeads];
    updated[index] = { ...updated[index], [field]: value };
    setExtractedLeads(updated);
  };

  const handleSaveLead = async (andDial: boolean = false) => {
    const validLeads = extractedLeads.filter((l) => l.name.trim() && l.phone.trim());
    if (validLeads.length === 0) {
      Alert.alert('Incomplete Lead', 'Please provide at least a Teacher Name and Phone Number.');
      return;
    }

    try {
      await HapticsService.success();

      let targetListId = selectedListId;
      if (isCreatingNewList && newListName.trim()) {
        const createdList = await LeadsRepository.createNewNamedList(newListName.trim());
        targetListId = createdList.id;
      }

      const primaryLead = {
        ...validLeads[0],
        priority_tier: priorityTier,
        list_id: targetListId,
      };
      const savedLead = await LeadsRepository.addSingleLead(
        primaryLead,
        primaryLead.source_image_uri || imageUri
      );

      // If multiple leads were on the sheet or from batch intake, save the rest too
      for (let i = 1; i < validLeads.length; i++) {
        await LeadsRepository.addSingleLead(
          {
            ...validLeads[i],
            priority_tier: priorityTier,
            list_id: targetListId,
          },
          validLeads[i].source_image_uri || imageUri
        );
      }

      if (andDial) {
        navigation.replace('LeadDetail', { leadId: savedLead.id });
      } else {
        navigation.navigate('Lists');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save lead to local database.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.sacredGreenDeep} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.livingWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isProcessing
            ? 'Processing Card...'
            : !hasScanned
            ? 'Snap ValuTeachers Card'
            : 'Verify Educator Details'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {isProcessing ? (
          <View style={styles.loadingContainer}>
            {imageUri && (
              <View style={styles.loadingThumbFrame}>
                <Image source={{ uri: imageUri }} style={styles.loadingThumbImage} resizeMode="cover" />
              </View>
            )}
            <ActivityIndicator size="large" color={Colors.heavenlyGold} style={{ marginTop: 18 }} />
            <Text style={styles.loadingTitle}>{processingStatusText}</Text>
            <Text style={styles.loadingSubtitle}>
              Extracting educator contact info, planning period, and written notes.
            </Text>

            <View style={styles.loadingStepsBox}>
              <View style={styles.loadingStepItem}>
                <Sparkles size={14} color={Colors.heavenlyGold} />
                <Text style={styles.loadingStepText}>Scanning handwriting & contact info</Text>
              </View>
              <View style={styles.loadingStepItem}>
                <Sparkles size={14} color={Colors.heavenlyGold} />
                <Text style={styles.loadingStepText}>Extracting planning period & room number</Text>
              </View>
              <View style={styles.loadingStepItem}>
                <Sparkles size={14} color={Colors.heavenlyGold} />
                <Text style={styles.loadingStepText}>Capturing FRS needs & written questions</Text>
              </View>
            </View>
          </View>
        ) : !hasScanned ? (
          <View style={styles.captureSection}>
            <View style={styles.instructionsBox}>
              <Sparkles size={20} color={Colors.heavenlyGold} />
              <Text style={styles.instructionText}>
                Snap a photo of an educator's handwritten ValuTeachers Report Card. Gemini AI extracts their contact info, planning period, and retirement questions instantly.
              </Text>
            </View>

            {/* Camera & Ingestion Options */}
            <View style={styles.buttonGroup}>
              <TouchableOpacity style={styles.captureButton} onPress={takePhoto} activeOpacity={0.8}>
                <Camera size={26} color={Colors.sacredGreenDeep} />
                <Text style={styles.captureButtonText}>
                  Take Photo of Card
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryCaptureButton} onPress={pickImage}>
                <ImageIcon size={20} color={Colors.heavenlyGold} />
                <Text style={styles.secondaryCaptureButtonText}>Import Card Photos (Single or Batch)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryCaptureButton}
                onPress={() => setPasteModalVisible(true)}
              >
                <Clipboard size={20} color={Colors.deepSkyBlueLight} />
                <Text style={styles.secondaryCaptureButtonText}>Paste Text (100% Offline)</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.reviewSection}>
            {/* Scanned Photo Preview Strip */}
            {imageUri && (
              <View style={styles.photoPreviewCard}>
                <Image source={{ uri: imageUri }} style={styles.thumbnailImage} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.photoPreviewTitle}>Proof of Request Photo Attached</Text>
                  <Text style={styles.photoPreviewDesc}>Saved permanently in device sandbox for 1-tap handwriting verification during calls.</Text>
                </View>
              </View>
            )}

            {/* Priority Tier & List Destination Card */}
            <View style={styles.tierSelectorCard}>
              <Text style={styles.cardSectionTitle}>LEAD PRIORITY & LIST DESTINATION</Text>

              {/* Priority Tier Switcher */}
              <View style={styles.tierPillRow}>
                <TouchableOpacity
                  style={[
                    styles.tierPillBtn,
                    priorityTier === 1 && styles.tierPillActiveFresh,
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    setPriorityTier(1);
                  }}
                  activeOpacity={0.8}
                >
                  <Flame size={18} color={priorityTier === 1 ? Colors.sacredGreenDeep : Colors.heavenlyGold} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierPillTitle, priorityTier === 1 && { color: Colors.sacredGreenDeep }]}>
                      Fresh / Hot Lead
                    </Text>
                    <Text style={[styles.tierPillDesc, priorityTier === 1 && { color: Colors.sacredGreen }]}>
                      Priority #1 in calling queue
                    </Text>
                  </View>
                  {priorityTier === 1 && <Check size={16} color={Colors.sacredGreenDeep} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.tierPillBtn,
                    priorityTier === 3 && styles.tierPillActiveLegacy,
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    setPriorityTier(3);
                  }}
                  activeOpacity={0.8}
                >
                  <Archive size={18} color={priorityTier === 3 ? '#FFFFFF' : Colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierPillTitle, priorityTier === 3 && { color: '#FFFFFF' }]}>
                      Legacy / Archive
                    </Text>
                    <Text style={[styles.tierPillDesc, priorityTier === 3 && { color: 'rgba(255,255,255,0.85)' }]}>
                      Called at end of queue
                    </Text>
                  </View>
                  {priorityTier === 3 && <Check size={16} color="#FFFFFF" />}
                </TouchableOpacity>
              </View>

              {/* Destination List Selector */}
              <Text style={[styles.smallLabel, { marginTop: 12, marginBottom: 4 }]}>Destination Campaign List</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.listChipRow}>
                  <TouchableOpacity
                    style={[
                      styles.listSelectChip,
                      selectedListId === 'master_queue' && !isCreatingNewList && styles.listSelectChipActive,
                    ]}
                    onPress={() => {
                      HapticsService.tick();
                      setSelectedListId('master_queue');
                      setIsCreatingNewList(false);
                    }}
                  >
                    <Layers size={13} color={selectedListId === 'master_queue' && !isCreatingNewList ? Colors.sacredGreenDeep : Colors.heavenlyGold} />
                    <Text
                      style={[
                        styles.listSelectChipText,
                        selectedListId === 'master_queue' && !isCreatingNewList && styles.listSelectChipTextActive,
                      ]}
                    >
                      Master Pipeline
                    </Text>
                  </TouchableOpacity>

                  {availableLists.map((lst) => (
                    <TouchableOpacity
                      key={lst.id}
                      style={[
                        styles.listSelectChip,
                        selectedListId === lst.id && !isCreatingNewList && styles.listSelectChipActive,
                      ]}
                      onPress={() => {
                        HapticsService.tick();
                        setSelectedListId(lst.id);
                        setIsCreatingNewList(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.listSelectChipText,
                          selectedListId === lst.id && !isCreatingNewList && styles.listSelectChipTextActive,
                        ]}
                      >
                        {lst.title}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={[
                      styles.listSelectChip,
                      isCreatingNewList && styles.listSelectChipActive,
                    ]}
                    onPress={() => {
                      HapticsService.tick();
                      setIsCreatingNewList(true);
                    }}
                  >
                    <FolderPlus size={13} color={isCreatingNewList ? Colors.sacredGreenDeep : Colors.deepSkyBlueLight} />
                    <Text
                      style={[
                        styles.listSelectChipText,
                        isCreatingNewList && styles.listSelectChipTextActive,
                      ]}
                    >
                      + New List
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {isCreatingNewList && (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={styles.newListNameInput}
                    placeholder="e.g. 2023-2024 Legacy Vault"
                    placeholderTextColor={Colors.textMuted}
                    value={newListName}
                    onChangeText={setNewListName}
                    autoFocus
                  />
                </View>
              )}
            </View>

            {/* Editable Educator Form Fields */}
            {extractedLeads.map((item, index) => (
              <View key={item.id || index} style={styles.leadRowCard}>
                <Text style={styles.cardSectionTitle}>EDUCATOR CONTACT INFO</Text>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.smallLabel}>Teacher Full Name *</Text>
                    <TextInput
                      style={styles.rowInput}
                      value={item.name}
                      onChangeText={(val) => handleUpdateLead(index, 'name', val)}
                      placeholder="e.g. Teacher Name"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabel}>Cell Phone Number *</Text>
                    <TextInput
                      style={styles.rowInput}
                      value={item.phone}
                      onChangeText={(val) => handleUpdateLead(index, 'phone', val)}
                      placeholder="(386) 555-0123"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                <View style={[styles.inputRow, { marginTop: 12 }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.smallLabel}>School / District</Text>
                    <TextInput
                      style={styles.rowInput}
                      value={item.school || ''}
                      onChangeText={(val) => handleUpdateLead(index, 'school', val)}
                      placeholder="e.g. VOL / Mainland High"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabel}>Email Address</Text>
                    <TextInput
                      style={styles.rowInput}
                      value={item.email || ''}
                      onChangeText={(val) => handleUpdateLead(index, 'email', val)}
                      placeholder="teacher@district.k12.fl.us"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="email-address"
                    />
                  </View>
                </View>

                <Text style={[styles.cardSectionTitle, { marginTop: 16 }]}>PLANNING SESSION & FRS DETAILS</Text>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.smallLabel}>Planning Period</Text>
                    <TextInput
                      style={styles.rowInput}
                      value={item.planning_period || ''}
                      onChangeText={(val) => handleUpdateLead(index, 'planning_period', val)}
                      placeholder="e.g. 3rd Period (1:00 - 1:45 PM)"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabel}>Classroom / Room #</Text>
                    <TextInput
                      style={styles.rowInput}
                      value={item.room_number || ''}
                      onChangeText={(val) => handleUpdateLead(index, 'room_number', val)}
                      placeholder="e.g. Room 204"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                </View>

                <View style={[styles.inputRow, { marginTop: 12 }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.smallLabel}>Years in FRS</Text>
                    <TextInput
                      style={styles.rowInput}
                      value={item.years_in_frs || ''}
                      onChangeText={(val) => handleUpdateLead(index, 'years_in_frs', val)}
                      placeholder="e.g. 14"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabel}>FRS Knowledge Level</Text>
                    <TextInput
                      style={styles.rowInput}
                      value={item.frs_knowledge || ''}
                      onChangeText={(val) => handleUpdateLead(index, 'frs_knowledge', val)}
                      placeholder="e.g. I know a little"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                </View>

                {item.meeting_preferences && item.meeting_preferences.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.smallLabel}>Requested Meeting Availability</Text>
                    <Text style={styles.meetingText}>{item.meeting_preferences.join(' • ')}</Text>
                  </View>
                )}

                {item.frs_interests && item.frs_interests.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.smallLabel}>Checked Interests / Needs</Text>
                    <Text style={styles.interestsText}>{item.frs_interests.join(', ')}</Text>
                  </View>
                )}

                {item.custom_questions ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.smallLabel}>Teacher's Written Question</Text>
                    <Text style={styles.questionText}>"{item.custom_questions}"</Text>
                  </View>
                ) : null}
              </View>
            ))}

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={styles.saveAndDialBtn}
                onPress={() => handleSaveLead(true)}
                activeOpacity={0.8}
              >
                <PhoneCall size={18} color={Colors.sacredGreenDeep} />
                <Text style={styles.saveAndDialBtnText}>Save & Open Call HUD</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveOnlyBtn}
                onPress={() => handleSaveLead(false)}
                activeOpacity={0.8}
              >
                <Check size={18} color={Colors.livingWhite} />
                <Text style={styles.saveOnlyBtnText}>Save Educator to Pipeline</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Paste Modal */}
      <Modal visible={pasteModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Paste Lead Text</Text>
              <TouchableOpacity onPress={() => setPasteModalVisible(false)}>
                <X size={24} color={Colors.livingWhite} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.pasteInput}
              placeholder="Paste unstructured notes or roster here..."
              placeholderTextColor={Colors.textMuted}
              value={pastedText}
              onChangeText={setPastedText}
              multiline
            />

            <TouchableOpacity style={styles.parseBtn} onPress={handleParsePastedText}>
              <Text style={styles.parseBtnText}>Parse Contacts</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.sacredGreenDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.heavenlyGold,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  captureSection: {
    gap: 16,
  },
  instructionsBox: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 12,
    alignItems: 'center',
  },
  instructionText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  buttonGroup: {
    gap: 12,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.heavenlyGold,
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
    shadowColor: Colors.heavenlyGold,
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  captureButtonText: {
    color: Colors.sacredGreenDeep,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryCaptureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  secondaryCaptureButtonText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loadingThumbFrame: {
    width: 140,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.heavenlyGold,
    backgroundColor: Colors.bgCard,
    shadowColor: Colors.heavenlyGold,
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  loadingThumbImage: {
    width: '100%',
    height: '100%',
  },
  loadingTitle: {
    color: Colors.heavenlyGold,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  loadingStepsBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 12,
  },
  loadingStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingStepText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  reviewSection: {
    gap: 16,
  },
  photoPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  thumbnailImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  photoPreviewTitle: {
    color: Colors.livingWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  photoPreviewDesc: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  tierSelectorCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
  },
  tierPillRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tierPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgInput,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
    gap: 10,
  },
  tierPillActiveFresh: {
    backgroundColor: Colors.heavenlyGold,
    borderColor: Colors.heavenlyGold,
  },
  tierPillActiveLegacy: {
    backgroundColor: '#64748B',
    borderColor: '#94A3B8',
  },
  tierPillTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  tierPillDesc: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
  },
  listChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  listSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgInput,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 6,
  },
  listSelectChipActive: {
    backgroundColor: Colors.heavenlyGold,
    borderColor: Colors.heavenlyGold,
  },
  listSelectChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  listSelectChipTextActive: {
    color: Colors.sacredGreenDeep,
    fontWeight: '800',
  },
  newListNameInput: {
    backgroundColor: Colors.bgInput,
    color: Colors.livingWhite,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.heavenlyGold,
  },
  leadRowCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.heavenlyGold,
    letterSpacing: 1,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
  },
  smallLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  rowInput: {
    backgroundColor: Colors.bgInput,
    color: Colors.livingWhite,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  meetingText: {
    color: Colors.heavenlyGold,
    fontSize: 13,
    fontWeight: '600',
  },
  interestsText: {
    color: Colors.statusSitDownText,
    fontSize: 13,
    fontWeight: '500',
  },
  questionText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
  },
  actionButtonsContainer: {
    gap: 10,
    marginTop: 10,
  },
  saveAndDialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.heavenlyGold,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  saveAndDialBtnText: {
    color: Colors.sacredGreenDeep,
    fontSize: 16,
    fontWeight: '800',
  },
  saveOnlyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.sacredGreen,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveOnlyBtnText: {
    color: Colors.livingWhite,
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.bgModal,
    justifyContent: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.livingWhite,
  },
  pasteInput: {
    backgroundColor: Colors.bgInput,
    color: Colors.livingWhite,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    height: 160,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  parseBtn: {
    backgroundColor: Colors.heavenlyGold,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  parseBtnText: {
    color: Colors.sacredGreenDeep,
    fontWeight: '800',
    fontSize: 15,
  },
});
