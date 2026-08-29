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
import { ArrowLeft, MessageSquare, Save, Zap, Info } from 'lucide-react-native';
import { CadenceRepository } from '../db/cadenceRepository';
import { CadenceRule, SMSTemplate } from '../types';
import { Colors } from '../theme/colors';

export default function CadenceSettingsScreen({ navigation }: any) {
  const [rules, setRules] = useState<CadenceRule[]>([]);
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<SMSTemplate | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (preserveId?: string) => {
    const loadedRules = await CadenceRepository.getAllRules();
    const loadedTemplates = await CadenceRepository.getAllTemplates();
    setRules(loadedRules);
    setTemplates(loadedTemplates);
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.sacredGreenDeep} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.livingWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cadence & Automation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoBox}>
          <Zap size={20} color={Colors.heavenlyGold} />
          <Text style={styles.infoText}>
            Multi-touch outreach engine. When you mark a call as No Answer, the next step triggers automatically.
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

        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>SMS TEMPLATES</Text>
        <View style={styles.templateTabs}>
          {templates.map((tpl) => (
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
        </View>

        {activeTemplate && (
          <View style={styles.templateForm}>
            <Text style={styles.fieldLabel}>Template Title</Text>
            <TextInput
              style={styles.input}
              value={activeTemplate.title}
              onChangeText={(text) =>
                setActiveTemplate({ ...activeTemplate, title: text })
              }
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>SMS Message Body</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={activeTemplate.body}
              multiline
              onChangeText={(text) =>
                setActiveTemplate({ ...activeTemplate, body: text })
              }
            />

            <View style={styles.tokenGuide}>
              <Info size={14} color={Colors.heavenlyGold} />
              <Text style={styles.tokenGuideText}>
                Supported tokens: <Text style={styles.tokenTag}>{'{{name}}'}</Text>, <Text style={styles.tokenTag}>{'{{school}}'}</Text>, <Text style={styles.tokenTag}>{'{{planning_period}}'}</Text>
              </Text>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveTemplate}>
              <Save size={18} color={Colors.sacredGreenDeep} />
              <Text style={styles.saveButtonText}>Save Template</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.heavenlyGold,
    gap: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  ruleCard: {
    backgroundColor: Colors.bgCard,
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
    backgroundColor: Colors.bgDark,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  stepBadgeText: {
    color: Colors.heavenlyGold,
    fontSize: 12,
    fontWeight: '700',
  },
  ruleActionText: {
    color: Colors.livingWhite,
    fontSize: 14,
    fontWeight: '600',
  },
  ruleConditionText: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  templateTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  activeTabButton: {
    backgroundColor: Colors.heavenlyGold,
    borderColor: Colors.heavenlyGold,
  },
  tabButtonText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  activeTabButtonText: {
    color: Colors.sacredGreenDeep,
    fontWeight: '800',
  },
  templateForm: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.bgInput,
    color: Colors.livingWhite,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    fontSize: 14,
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  tokenGuide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  tokenGuideText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  tokenTag: {
    color: Colors.heavenlyGold,
    fontWeight: '600',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.heavenlyGold,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 18,
    gap: 8,
  },
  saveButtonText: {
    color: Colors.sacredGreenDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
