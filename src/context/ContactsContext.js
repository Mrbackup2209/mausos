import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { subscribeToContacts } from '../services/contactService';

// ---------------------------------------------------------------------------
// The signed-in user's emergency contacts, kept live for the whole app.
//
// One subscription, opened when the user signs in and closed when they sign
// out, rather than each screen fetching its own copy. The home screen needs the
// contacts to know whether an alert can be armed; the alert pipeline needs them
// the instant it fires. Having them already in memory means triggering an alert
// never waits on a network read.
// ---------------------------------------------------------------------------

const ContactsContext = createContext({
  contacts: [],
  loading: true,
  error: null,
});

export function ContactsProvider({ children }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setContacts([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = subscribeToContacts(
      user.uid,
      (list) => {
        setContacts(list);
        setLoading(false);
        setError(null);
      },
      (message) => {
        setLoading(false);
        setError(message);
      }
    );
    return unsubscribe;
  }, [user]);

  return (
    <ContactsContext.Provider value={{ contacts, loading, error }}>
      {children}
    </ContactsContext.Provider>
  );
}

export function useContacts() {
  return useContext(ContactsContext);
}
