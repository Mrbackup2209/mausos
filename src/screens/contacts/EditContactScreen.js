import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../../context/ContactsContext';
import { addContact, updateContact, deleteContact } from '../../services/contactService';
import {
  validateContactName,
  validateContactPhone,
  runValidators,
  formatPhoneForDisplay,
} from '../../utils/validators';
import { RELATIONSHIPS } from '../../utils/constants';
import { colors, spacing, typography, radius } from '../../utils/theme';

// ---------------------------------------------------------------------------
// Add or edit one emergency contact. The same screen serves both: a contactId
// route parameter means edit, its absence means add.
// ---------------------------------------------------------------------------

export default function EditContactScreen({ navigation, route }) {
  const { user, profile } = useAuth();
  const { contacts } = useContacts();

  const contactId = route.params?.contactId;
  const existing = useMemo(
    () => contacts.find((c) => c.id === contactId),
    [contacts, contactId]
  );
  const isEdit = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing ? formatPhoneForDisplay(existing.phone) : '');
  const [relationship, setRelationship] = useState(existing?.relationship ?? '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Edit contact' : 'Add contact' });
  }, [navigation, isEdit]);

  function clearError(field) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  }

  async function save() {
    const { isValid, errors: fieldErrors } = runValidators({
      name: validateContactName(name),
      phone: validateContactPhone(phone, {
        ownPhone: profile?.phone,
        existing: contacts,
        excludeId: contactId,
      }),
      relationship: relationship ? null : 'Choose how you know this person',
    });
    setErrors(fieldErrors);
    if (!isValid) return;

    setSaving(true);
    const data = { name, phone, relationship };
    const result = isEdit
      ? await updateContact(user.uid, contactId, data)
      : await addContact(user.uid, data, contacts);
    setSaving(false);

    if (result.success) navigation.goBack();
    else Alert.alert('Could not save', result.error);
  }

  function confirmDelete() {
    const isOnly = contacts.length === 1;
    Alert.alert(
      `Remove ${existing.name}?`,
      isOnly
        ? 'This is your only emergency contact. Until you add another, an alert will have nobody to reach.'
        : `${existing.name} will no longer receive your alerts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const result = await deleteContact(user.uid, contactId, contacts);
            setDeleting(false);
            if (result.success) navigation.goBack();
            else Alert.alert('Could not remove', result.error);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Input
            label="Name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              clearError('name');
            }}
            placeholder="e.g. Mum"
            autoCapitalize="words"
            maxLength={40}
            error={errors.name}
          />

          <Input
            label="Phone number"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              clearError('phone');
            }}
            placeholder="5789 1234"
            keyboardType="phone-pad"
            error={errors.phone}
          />

          <Text style={styles.label}>Relationship</Text>
          <View style={styles.chips}>
            {RELATIONSHIPS.map((option) => {
              const selected = option === relationship;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setRelationship(option);
                    clearError('relationship');
                  }}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.relationship ? <Text style={styles.error}>{errors.relationship}</Text> : null}

          <View style={styles.actions}>
            <Button
              title={isEdit ? 'Save changes' : 'Add contact'}
              onPress={save}
              loading={saving}
              disabled={deleting}
            />
            {isEdit ? (
              <Button
                title="Remove contact"
                variant="ghostDanger"
                onPress={confirmDelete}
                loading={deleting}
                disabled={saving}
                style={styles.remove}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg },

  label: { ...typography.label, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    margin: spacing.xs,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { ...typography.caption, color: colors.text, fontWeight: '600' },
  chipTextSelected: { color: colors.primaryDark },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },

  actions: { marginTop: spacing.xl },
  remove: { marginTop: spacing.sm },
});
