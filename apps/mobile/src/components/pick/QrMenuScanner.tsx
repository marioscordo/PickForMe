import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { styles } from "../../theme/styles";

export function QrMenuScanner({
  onUrlScanned,
  onClose
}: {
  onUrlScanned: (url: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    return (
      <View style={styles.card}>
        <Text style={styles.h2}>QR-Code scannen</Text>
        <Text style={styles.hint}>Kamera wird vorbereitet...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.card}>
        <Text style={styles.h2}>QR-Code scannen</Text>
        <Text style={styles.hint}>
          PickForMe benötigt die Kamera, um QR-Codes von Speisekarten zu scannen.
        </Text>

        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Kamera erlauben</Text>
        </Pressable>

        <Pressable style={styles.ghostButton} onPress={onClose}>
          <Text style={styles.ghostButtonText}>Abbrechen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>QR-Code scannen</Text>
      <Text style={styles.hint}>
        Richte die Kamera auf den QR-Code der Speisekarte.
      </Text>

      <View style={styles.qrCameraBox}>
        <CameraView
          style={styles.qrCamera}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"]
          }}
          onBarcodeScanned={({ data }) => {
            if (scanned) {
              return;
            }

            setScanned(true);
            onUrlScanned(data);
          }}
        />
      </View>

      <Pressable
        style={styles.ghostButton}
        onPress={() => {
          setScanned(false);
          onClose();
        }}
      >
        <Text style={styles.ghostButtonText}>Scanner schließen</Text>
      </Pressable>
    </View>
  );
}
