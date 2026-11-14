import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/Button';
import ContactCard from '../../components/ContactCard';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../../context/ContactsContext';
import { moveContact } from '../../services/contactService';
import { colors, spacing, typography, radius } from '../../utils/theme';
import { MAX_CONTACTS } from '../../utils/constants';

export default function ContactsScreen({ navigation }) {
  const { user } = useAuth();
  const { contacts, loading, error } = useContacts();
  const [reordering, setReordering] = useState(false);

  const atLimit = contacts.length >= MAX_CONTACTS;

  async function move(contactId, direction) {
    setReordering(true);
    const result = await moveContact(user.uid, contacts, contactId, direction);
    setReordering(false);
    if (!result.success) Alert.alert('Could not reorder', result.error);
  }

  function openEditor(contact) {
    navigation.navigate('EditContact', contact ? { contactId: contact.id } : {});
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centre]} edges={['top']}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Emergency contacts</Text>
            <Text style={styles.subtitle}>
              Everyone here receives your alert. The first person is contacted
              first. Use the arrows to change the order.
            </Text>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {contacts.length > 0 ? (
              <Text style={styles.count}>
                {contacts.length} of {MAX_CONTACTS}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <ContactCard
            contact={item}
            isFirst={index === 0}
            isLast={index === contacts.length - 1}
            busy={reordering}
            onPress={() => openEditor(item)}
            onMoveUp={() => move(item.id, -1)}
            onMoveDown={() => move(item.id, +1)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={36} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No contacts yet</Text>
            <Text style={styles.emptyText}>
              An alert has nowhere to go until you add someone. Add at least one
              person who can respond quickly: a parent, partner or close friend.
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              title={contacts.length === 0 ? 'Add your first contact' : 'Add contact'}
              onPress={() => openEditor(null)}
              disabled={atLimit}
            />
            {atLimit ? (
              <Text style={styles.limitNote}>
                Up to {MAX_CONTACTS} contacts. Remove one to add another.
              </Text>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centre: { alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, flexGrow: 1 },

  header: { marginBottom: spacing.md },
  title: { ...typography.h1 },
  subtitle: { ...typography.bodyMuted, marginTop: spacing.xs, lineHeight: 22 },
  count: { ...typography.caption, marginTop: spacing.md },

  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.dangerDark },

  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h3, marginBottom: spacing.xs },
  emptyText: { ...typography.bodyMuted, textAlign: 'center', lineHeight: 22 },

  footer: { marginTop: spacing.md },
  limitNote: { ...typography.caption, textAlign: 'center', marginTop: spacing.sm },
});
