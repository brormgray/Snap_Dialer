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
} from 'react-native';
import { ArrowLeft, Save, Zap, Info, Sparkles } from 'lucide-react-native';
import { CadenceRepository } from '../db/cadenceRepository';
import { SettingsRepository } from '../db/settingsRepository';
import { TelephonyService } from '../services/telephonyService';
import { CadenceRule, SMSTemplate, Lead } from '../types';
import { Colors } from '../theme/colors';

type TemplateCategory = 'all' | 'sprint' | 'bridge' | 'monthly' | 'client_review' | 'dialer';

export default function CadenceSettingsScreen({ navigation }: any) {
  const [rules, setRules] = useState<CadenceRule[]>([]);
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [category, setCategory] = useState<TemplateCategory>('all');
  const [activeTemplate, setActiveTemplate] = useState<SMSTemplate | null>(null);
  const [userName, setUserName] = useState<string>('Alex');
  const [agencyName, setAgencyName] = useState<string>('ValuTeachers');

  useEffect(() => {
    loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadData();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [navigation]);

  const loadData = async (preserveId?: string) => {
    await CadenceRepository.seedDripTemplatesIfMissing();
    const [loadedRules, loadedTemplates, settings] = await Promise.all([
      CadenceRepository.getAllRules(),
      CadenceRepository.getAllTemplates(),
      SettingsRepository.getSettings(),
    ]);
    setRules(loadedRules);
    setTemplates(loadedTemplates);
    if (settings) {
      setUserName(settings.user_name || 'Alex');
      setAgencyName(settings.agency_name !== undefined ? settings.agency_name : 'ValuTeachers');
    }
    if (loadedTemplates.length > 0) {
      const match = loadedTemplates.find((t) => t.id === (preserveId || activeTemplate?.id));
      setActiveTemplate(match || loadedTemplates[0]);
    }
  };

  const handleSaveTemplate = async () => {
    if (!activeTemplate) return;
    await CadenceRepository.saveTemplate(activeTemplate);
    Alert.alert('Success', 'SMS template saved successfully.');
    loadData(activeTemplate.id);
  };

  const filteredTemplates = templates.filter((tpl) => {
    if (category === 'all') return true;
    if (category === 'sprint') {
      return tpl.stage === 'sprint' || tpl.id.includes('sprint');
    }
    if (category === 'bridge') {
      return (
        tpl.stage === 'bridge' ||
        tpl.id.includes('bridge') ||
        (tpl.id.startsWith('tpl_nurture_day') && !tpl.id.includes('day90'))
      );
    }
    if (category === 'monthly') {
      return (
        tpl.stage === 'monthly' ||
        tpl.id.includes('month') ||
        tpl.id.includes('day90')
      );
    }
    if (category === 'client_review') {
      return tpl.stage === 'client' || tpl.id.startsWith('tpl_client_');
    }
    if (category === 'dialer') {
      return !tpl.id.startsWith('tpl_nurture_') && !tpl.id.startsWith('tpl_client_');
    }
    return true;
  });

  useEffect(() => {
    if (filteredTemplates.length > 0 && !filteredTemplates.some((t) => t.id === activeTemplate?.id)) {
      setActiveTemplate(filteredTemplates[0]);
    }
  }, [category, templates]);

  // Sample lead for live preview
  const sampleLead: Lead = {
    id: 'sample_lead',
    list_id: 'master_queue',
    name: 'Sarah Jenkins',
    phone: '3865551234',
    school: 'Deltona High',
    room_number: '4-102',
    planning_period: '3rd Period (10:15 - 11:05 AM)',
    years_in_frs: '14',
    priority_tier: 1,
    cadence_step: 1,
    attempts_count: 1,
    is_client: true,
    products: ['flow_annuity'],
    annualized_premium: 3600,
    policy_effective_date: '2024-10-14',
    annual_review_due_date: '2025-10-14',
    meeting_preferences: ['Planning Period in classroom'],
    created_at: '2024-10-14T08:00:00.000Z',
    updated_at: '2024-10-14T08:00:00.000Z',
  };

  const previewText = activeTemplate
    ? TelephonyService.interpolateTemplate(activeTemplate, sampleLead, userName, new Date(), agencyName)
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Lists'))}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cadence & SMS Drip Engine</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoBox}>
          <Zap size={20} color={Colors.brandAccent} />
          <Text style={styles.infoText}>
            Multi-Stage Touch Engine: Sprint (24-48h friction reduction) → Bridge (Wks 2-6 overcoming inertia) → Indefinite Monthly Value (pension insights + subtle P.S. pivot), plus Client Servicing & reviews.
          </Text>
        </View>

        <Text style={styles.sectionHeader}>CADENCE RULES</Text>
        {rules.map((rule) => (
          <View key={rule.id} style={styles.ruleCard}>
            <View style={styles.ruleTop}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step {rule.step_number}</Text>
              </View>
              <Text style={styles.ruleActionText}>
                {rule.action_type === 'sms_only'
                  ? 'Send SMS Message'
                  : rule.action_type === 'call_and_sms'
                  ? 'Call & Follow-Up SMS'
                  : 'Scheduled Call'}
              </Text>
            </View>
            <Text style={styles.ruleConditionText}>
              Trigger: After {rule.condition_disposition.replace('_', ' ')} (Wait {rule.delay_hours}h)
            </Text>
          </View>
        ))}

        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>SMS TEMPLATE LIBRARY</Text>

        {/* Category Filter Pills (Horizontal Scrolling) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={styles.categoryBar}>
            <TouchableOpacity
              style={[styles.catBtn, category === 'all' && styles.catBtnActive]}
              onPress={() => setCategory('all')}
            >
              <Text style={[styles.catBtnText, category === 'all' && styles.catBtnTextActive]}>
                All ({templates.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.catBtn, category === 'sprint' && styles.catBtnActive]}
              onPress={() => setCategory('sprint')}
            >
              <Text style={[styles.catBtnText, category === 'sprint' && styles.catBtnTextActive]}>
                ⚡ Sprint (24-48h)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.catBtn, category === 'bridge' && styles.catBtnActive]}
              onPress={() => setCategory('bridge')}
            >
              <Text style={[styles.catBtnText, category === 'bridge' && styles.catBtnTextActive]}>
                🌉 Bridge (Wks 2-6)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.catBtn, category === 'monthly' && styles.catBtnActive]}
              onPress={() => setCategory('monthly')}
            >
              <Text style={[styles.catBtnText, category === 'monthly' && styles.catBtnTextActive]}>
                📚 Monthly Value
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.catBtn, category === 'client_review' && styles.catBtnActive]}
              onPress={() => setCategory('client_review')}
            >
              <Text style={[styles.catBtnText, category === 'client_review' && styles.catBtnTextActive]}>
                💎 Clients
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.catBtn, category === 'dialer' && styles.catBtnActive]}
              onPress={() => setCategory('dialer')}
            >
              <Text style={[styles.catBtnText, category === 'dialer' && styles.catBtnTextActive]}>
                📞 Dialer
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Template List Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateTabs}>
          {filteredTemplates.map((tpl) => (
            <TouchableOpacity
              key={tpl.id}
              style={[
                styles.tabButton,
                activeTemplate?.id === tpl.id && styles.activeTabButton,
              ]}
              onPress={() => setActiveTemplate(tpl)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTemplate?.id === tpl.id && styles.activeTabButtonText,
                ]}
              >
                {tpl.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {activeTemplate && (
          <View style={styles.templateForm}>
            <Text style={styles.fieldLabel}>Template Title</Text>
            <TextInput
              style={styles.input}
              value={activeTemplate.title}
              onChangeText={(text) =>
                setActiveTemplate({ ...activeTemplate, title: text })
              }
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
              Message Body (Teacher Variables Supported)
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={activeTemplate.body}
              onChangeText={(text) =>
                setActiveTemplate({ ...activeTemplate, body: text })
              }
              multiline
              placeholderTextColor={Colors.textMuted}
            />

            {/* Live Preview Box */}
            <View style={styles.previewBox}>
              <View style={styles.previewHeader}>
                <Sparkles size={13} color={Colors.heavenlyGold} />
                <Text style={styles.previewTitle}>LIVE PREVIEW (SAMPLE TEACHER)</Text>
              </View>
              <Text style={styles.previewText}>{previewText}</Text>
            </View>

            <View style={styles.tokenGuide}>
              <Info size={14} color={Colors.textMuted} />
              <Text style={styles.tokenGuideText}>
                Supported tags: <Text style={styles.tokenTag}>{'{{first_name}}'}</Text>,{' '}
                <Text style={styles.tokenTag}>{'{{school}}'}</Text>,{' '}
                <Text style={styles.tokenTag}>{'{{planning_period}}'}</Text>,{' '}
                <Text style={styles.tokenTag}>{'{{room_number}}'}</Text>,{' '}
                <Text style={styles.tokenTag}>{'{{product}}'}</Text>,{' '}
                <Text style={styles.tokenTag}>{'{{anniversary_date}}'}</Text>,{' '}
                <Text style={styles.tokenTag}>{'{{my_name}}'}</Text>,{' '}
                <Text style={styles.tokenTag}>{'{{company}}'}</Text>
              </Text>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveTemplate}>
              <Save size={18} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Template</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
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
  content: {
    flex: 1,
    padding: 16,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 20,
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  ruleCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  ruleTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepBadge: {
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  stepBadgeText: {
    color: Colors.brandAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  ruleActionText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  ruleConditionText: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 8,
  },
  categoryBar: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  catBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  catBtnActive: {
    backgroundColor: Colors.heavenlyGold,
  },
  catBtnText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  catBtnTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  templateTabs: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginRight: 8,
  },
  activeTabButton: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.heavenlyGold,
  },
  tabButtonText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeTabButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  templateForm: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    color: Colors.textPrimary,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  previewBox: {
    backgroundColor: '#0B132B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.3)',
    padding: 12,
    marginTop: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  previewTitle: {
    color: Colors.heavenlyGold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  previewText: {
    color: Colors.livingWhite,
    fontSize: 13,
    lineHeight: 18,
  },
  tokenGuide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
  },
  tokenGuideText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  tokenTag: {
    color: Colors.brandAccent,
    fontWeight: '600',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 18,
    gap: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
