import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../../hooks/useAuth';

export default function MemberAssociation() {
  const [pinNumber, setPinNumber] = useState('');
  const [error, setError] = useState('');
  const { associateMember } = useAuth();

  const handleAssociate = async () => {
    try {
      setError('');
      await associateMember(pinNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>Associate Member</Text>
        <Text style={styles.subtitle}>
          Please enter your member PIN number to associate your account with your member profile.
        </Text>
        
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="PIN Number"
          value={pinNumber}
          onChangeText={setPinNumber}
          keyboardType="numeric"
          maxLength={6}
        />

        <TouchableOpacity style={styles.button} onPress={handleAssociate}>
          <Text style={styles.buttonText}>Associate Member</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    justifyContent: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#ff3b30',
    marginBottom: 10,
    textAlign: 'center',
  },
});