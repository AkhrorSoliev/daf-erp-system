import { View } from 'react-native';

type Scan = { data: string };

/** The scan handler the screen handed to the camera, for a test to call. */
export const camera: { onScan?: (scan: Scan) => void } = {};

export function useCameraPermissions() {
  return [{ granted: true }, jest.fn()] as const;
}

export function CameraView({ onBarcodeScanned }: { onBarcodeScanned?: (scan: Scan) => void }) {
  camera.onScan = onBarcodeScanned;
  return <View />;
}
