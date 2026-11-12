import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ObsClient, GraduationStatus } from '@obs/api-client';

interface Props {
  client: ObsClient;
  studentId: string;
}

/**
 * Öğrenci ana ekranı: mezuniyet durumu (GNO/eksik), borç. Tek bakışta özet
 * (master prompt §7). Erişilebilirlik: her kart accessibilityLabel taşır (WCAG 2.1 AA).
 *
 * İSKELET: RN toolchain (Expo) ile çalışır; bu ortamda runtime doğrulanmadı.
 */
export function DashboardScreen({ client, studentId }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [grad, setGrad] = useState<GraduationStatus | null>(null);
  const [debt, setDebt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [g, d] = await Promise.all([
          client.graduationStatus(studentId),
          client.studentDebt(studentId),
        ]);
        if (active) {
          setGrad(g);
          setDebt(d.outstanding);
        }
      } catch {
        if (active) setError('Bilgiler yüklenemedi. Lütfen tekrar deneyin.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, studentId]);

  if (loading) {
    return <ActivityIndicator accessibilityLabel="Yükleniyor" style={styles.center} />;
  }
  if (error) {
    return (
      <View style={styles.center} accessibilityRole="alert">
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card} accessibilityLabel={`Genel not ortalaması ${grad?.gpa ?? 0}`}>
        <Text style={styles.label}>GNO</Text>
        <Text style={styles.value}>{grad?.gpa.toFixed(2) ?? '-'}</Text>
        {grad?.honor && grad.honor !== 'yok' ? (
          <Text style={styles.badge}>{grad.honor === 'yuksek_onur' ? 'Yüksek Onur' : 'Onur'}</Text>
        ) : null}
      </View>

      <View style={styles.card} accessibilityLabel="Mezuniyet durumu">
        <Text style={styles.label}>Mezuniyete Kalan</Text>
        <Text style={styles.value}>
          {grad?.completion.isComplete
            ? 'Koşullar sağlandı'
            : `${grad?.completion.missingMandatory.length ?? 0} zorunlu ders`}
        </Text>
      </View>

      <View style={styles.card} accessibilityLabel={`Borç ${debt ?? 0} kuruş`}>
        <Text style={styles.label}>Borç Durumu</Text>
        <Text style={styles.value}>
          {debt === 0 ? 'Borç yok' : `${((debt ?? 0) / 100).toFixed(2)} TL`}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 },
  label: { fontSize: 13, color: '#666' },
  value: { fontSize: 22, fontWeight: '700', color: '#111', marginTop: 4 },
  badge: { marginTop: 6, color: '#0a7', fontWeight: '600' },
  error: { color: '#c00', fontSize: 15, textAlign: 'center' },
});
