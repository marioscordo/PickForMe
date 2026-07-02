import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useMobileContent } from "../../content/useMobileContent";
import { styles } from "../../theme/styles";

export function QrMenuScanner({
  onUrlScanned,
  onClose
}: {
  onUrlScanned: (url: string) => void;
  onClose: () => void;
}) {
  const content = useMobileContent();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    return (
      <View style={styles.card}>
        <Text style={styles.h2}>{content.qrScanner.title}</Text>
        <Text style={styles.hint}>{content.qrScanner.preparing}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.card}>
        <Text style={styles.h2}>{content.qrScanner.title}</Text>
        <Text style={styles.hint}>
          {content.qrScanner.permissionText}
        </Text>

        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>{content.qrScanner.allowCamera}</Text>
        </Pressable>

        <Pressable style={styles.ghostButton} onPress={onClose}>
          <Text style={styles.ghostButtonText}>{content.common.cancel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{content.qrScanner.title}</Text>
      <Text style={styles.hint}>
        {content.qrScanner.instruction}
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
        <Text style={styles.ghostButtonText}>{content.qrScanner.close}</Text>
      </Pressable>
    </View>
  );
}
