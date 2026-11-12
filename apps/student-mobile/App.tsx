import { useMemo } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createClient } from './src/api';
import { DashboardScreen } from './src/screens/DashboardScreen';

/**
 * OBS öğrenci uygulaması kök bileşeni (İSKELET, Faz 10).
 * Gerçek auth/login akışı + navigasyon (React Navigation) sonraki iterasyon;
 * burada dashboard doğrudan gösterilir. Yapılandırma env/expo constants'tan gelir.
 */
export default function App(): JSX.Element {
  // Üretimde: giriş sonrası token + öğrenci kimliği. İskelet: örnek yapılandırma.
  const config = {
    baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    tenantId: process.env.EXPO_PUBLIC_TENANT_ID ?? '',
    studentUserId: process.env.EXPO_PUBLIC_STUDENT_USER_ID ?? '',
    studentId: process.env.EXPO_PUBLIC_STUDENT_ID ?? '',
  };
  const client = useMemo(() => createClient(config), [config.baseUrl, config.tenantId]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.header} accessibilityRole="header">
        <Text style={styles.title}>OBS Öğrenci</Text>
      </View>
      <DashboardScreen client={client} studentId={config.studentId} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f5f7' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e4e8' },
  title: { fontSize: 20, fontWeight: '700', color: '#111' },
});
