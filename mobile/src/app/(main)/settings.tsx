import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Contact as SystemContact } from 'expo-contacts';
import { BookUser, LogOut, Plus, Shield, Trash2, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import { getSupabaseClient } from '../../backend/supabase';
import { useAppPreferences, type PreferenceKey } from '../../appPreferences';
import { Panel, ScreenTitle } from '../../components';
import { colors, font } from '../../theme';

type EmergencyContact = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  relationship: string;
};

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { preferences, loading: preferencesLoading, updatePreference } = useAppPreferences();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRelationship, setContactRelationship] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetchEmergencyContacts(user.id).then((loadedContacts) => {
      if (active) setContacts(loadedContacts);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Contacts could not be loaded.');
    }).finally(() => {
      if (active) setContactsLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  async function saveContact() {
    if (!user) return;
    if (contactName.trim().length < 2 || contactPhone.trim().length < 3) {
      setError('Enter a contact name and phone number.');
      return;
    }
    setSavingContact(true);
    setError('');
    const { data: savedContact, error: saveError } = await getSupabaseClient()
      .from('emergency_contacts')
      .insert({
        user_id: user.id,
        name: contactName.trim(),
        phone: contactPhone.trim(),
        relationship: contactRelationship.trim(),
      })
      .select('id,user_id,name,phone,relationship')
      .single();
    setSavingContact(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setContactName('');
    setContactPhone('');
    setContactRelationship('');
    setContactModalVisible(false);
    setContacts((current) => [...current, savedContact as EmergencyContact]);
  }

  async function importContact() {
    setError('');
    try {
      const selectedContact = await SystemContact.presentPicker();
      if (!selectedContact) return;
      const [name, phones] = await Promise.all([selectedContact.getFullName(), selectedContact.getPhones()]);
      const phone = phones.find((item) => item.number)?.number;
      if (!phone) {
        setError(`${name || 'This contact'} has no phone number.`);
        return;
      }
      setContactName(name || 'Emergency contact');
      setContactPhone(phone);
      setContactRelationship('Imported contact');
      setContactModalVisible(true);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Contact picker unavailable.');
    }
  }

  async function removeContact(id: string) {
    if (!user) return;
    const { error: deleteError } = await getSupabaseClient()
      .from('emergency_contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (deleteError) setError(deleteError.message);
    else setContacts((current) => current.filter((contact) => contact.id !== id));
  }

  async function callContact(phone: string) {
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      setError('Calling is not available on this device.');
    }
  }

  async function togglePreference(key: PreferenceKey, value: boolean) {
    setError('');
    try {
      await updatePreference(key, value);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Preference could not be saved.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle title="Settings" />
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>Emergency contacts</Text>
          <View style={styles.contactActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Import a phone contact" onPress={() => { void importContact(); }} style={styles.iconButton}><BookUser color={colors.muted} size={15} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Add emergency contact" onPress={() => setContactModalVisible(true)} style={styles.addButton}><Plus color="#ff7770" size={14} /><Text style={styles.addText}>Add</Text></Pressable>
          </View>
        </View>
        <Panel style={styles.contactList}>
          {contactsLoading ? <ActivityIndicator style={styles.loading} color={colors.red} /> : null}
          {!contactsLoading && contacts.length === 0 ? <Text style={styles.emptyContacts}>No emergency contacts added.</Text> : null}
          {contacts.map((contact, index) => (
            <ContactRow key={contact.id} contact={contact} last={index === contacts.length - 1} onCall={() => { void callContact(contact.phone); }} onRemove={() => { void removeContact(contact.id); }} />
          ))}
        </Panel>

        <SettingGroup title="SOS RESPONSE" icon={<Shield color={colors.green} size={14} />}>
          <SettingRow label="Open SMS for emergency contacts" value={preferences.smsOnSos} onToggle={(value) => { void togglePreference('smsOnSos', value); }} />
          <SettingRow label="Share SOS with nearby RESQ users" value={preferences.communitySharing} onToggle={(value) => { void togglePreference('communitySharing', value); }} last />
        </SettingGroup>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        {preferencesLoading ? <ActivityIndicator style={styles.loading} color={colors.red} /> : null}
        <Pressable accessibilityRole="button" onPress={() => { void signOut().then(() => router.replace('/')).catch((signOutError: unknown) => setError(signOutError instanceof Error ? signOutError.message : 'Sign out failed.')); }} style={styles.signOutButton}>
          <LogOut color="#ff7770" size={16} /><Text style={styles.signOutText}>Sign out {user?.email ? `· ${user.email}` : ''}</Text>
        </Pressable>
      </ScrollView>

      <Modal animationType="fade" transparent visible={contactModalVisible} onRequestClose={() => setContactModalVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Emergency contact</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setContactModalVisible(false)}><X color={colors.muted} size={18} /></Pressable></View>
            <TextInput autoCapitalize="words" onChangeText={setContactName} placeholder="Full name" placeholderTextColor={colors.dim} style={styles.input} value={contactName} />
            <TextInput autoComplete="tel" keyboardType="phone-pad" onChangeText={setContactPhone} placeholder="Phone number" placeholderTextColor={colors.dim} style={styles.input} value={contactPhone} />
            <TextInput onChangeText={setContactRelationship} placeholder="Relationship (optional)" placeholderTextColor={colors.dim} style={styles.input} value={contactRelationship} />
            <Pressable accessibilityRole="button" disabled={savingContact} onPress={() => { void saveContact(); }} style={[styles.saveButton, savingContact && styles.disabled]}>
              {savingContact ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save contact</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

async function fetchEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
  const { data, error } = await getSupabaseClient()
    .from('emergency_contacts')
    .select('id,user_id,name,phone,relationship')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EmergencyContact[];
}

function ContactRow({ contact, last, onCall, onRemove }: { contact: EmergencyContact; last: boolean; onCall: () => void; onRemove: () => void }) {
  const initials = contact.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return (
    <View style={[styles.contactRow, last && styles.lastRow]}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials || '?'}</Text></View>
      <Pressable accessibilityRole="button" onPress={onCall} style={styles.contactInfo}>
        <Text style={styles.contactName}>{contact.name}</Text>
        <Text style={styles.contactDetails}>{contact.relationship ? `${contact.relationship} · ` : ''}{contact.phone}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${contact.name}`} onPress={onRemove} hitSlop={8} style={styles.removeButton}><Trash2 color={colors.muted} size={15} /></Pressable>
    </View>
  );
}

function SettingGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <View style={styles.group}><View style={styles.groupTitle}>{icon}<Text style={styles.groupHeading}>{title}</Text></View><Panel style={styles.settingList}>{children}</Panel></View>;
}

function SettingRow({ label, value, onToggle, last = false }: { label: string; value: boolean; onToggle: (value: boolean) => void; last?: boolean }) {
  return (
    <View style={[styles.settingRow, last && styles.lastRow]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onToggle}
        thumbColor="#fff"
        trackColor={{ false: '#4a4a4e', true: colors.green }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  scrollView: { flex: 1, width: '100%' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 21, paddingTop: 21, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  sectionHeading: { color: colors.text, fontFamily: font.display, fontSize: 15 },
  contactActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconButton: { width: 30, height: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  addButton: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#542a28', borderRadius: 8, backgroundColor: '#241514', paddingHorizontal: 8 },
  addText: { color: '#ff7770', fontFamily: font.medium, fontSize: 10 },
  contactList: { overflow: 'hidden' },
  loading: { margin: 18 },
  emptyContacts: { padding: 18, color: colors.muted, fontFamily: font.regular, fontSize: 11, textAlign: 'center' },
  contactRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: '#242426' },
  avatar: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#31516b', borderRadius: 17, backgroundColor: '#152532' },
  avatarText: { color: '#61bbff', fontFamily: font.bold, fontSize: 9 },
  contactInfo: { flex: 1, gap: 3 },
  contactName: { color: colors.text, fontFamily: font.medium, fontSize: 11 },
  contactDetails: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  removeButton: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  lastRow: { borderBottomWidth: 0 },
  error: { marginVertical: 8, color: '#ff7770', fontFamily: font.medium, fontSize: 10, lineHeight: 15 },
  group: { marginTop: 14, marginBottom: 17 },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  groupHeading: { color: colors.text, fontFamily: font.display, fontSize: 14 },
  settingList: { overflow: 'hidden' },
  settingRow: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 11, paddingRight: 5, borderBottomWidth: 1, borderBottomColor: '#242426' },
  settingLabel: { flex: 1, color: '#d9d9db', fontFamily: font.regular, fontSize: 10 },
  signOutButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 3, borderWidth: 1, borderColor: '#5b2c2a', borderRadius: 10, backgroundColor: '#211414' },
  signOutText: { color: '#ff7770', fontFamily: font.medium, fontSize: 11 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000000d9' },
  modalCard: { width: '100%', maxWidth: 390, gap: 10, borderWidth: 1, borderColor: '#353537', borderRadius: 18, backgroundColor: '#111112', padding: 19 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { color: colors.text, fontFamily: font.displayBold, fontSize: 18 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#303033', borderRadius: 10, backgroundColor: '#0d0d0e', color: colors.text, fontFamily: font.regular, fontSize: 12, paddingHorizontal: 12 },
  saveButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 3, borderRadius: 10, backgroundColor: colors.red },
  disabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontFamily: font.bold, fontSize: 11 },
});