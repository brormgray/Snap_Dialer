import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export interface ScannedDocumentResult {
  uri: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export class DocumentScannerService {
  /**
   * Scans a paper document with native edge-detection, perspective correction, and shadow removal.
   * - In Native Dev Builds: Uses Apple VisionKit / Google MLKit Document Scanner.
   * - In Expo Go / Web: Uses Camera with interactive boundary cropping (allowsEditing).
   */
  static async scanDocument(): Promise<string | null> {
    // 1. Try Native Document Scanner plugin (VisionKit on iOS / MLKit on Android)
    if (Platform.OS !== 'web') {
      try {
        // @ts-ignore
        const DocumentScanner = await import('react-native-document-scanner-plugin');
        if (DocumentScanner && DocumentScanner.default && DocumentScanner.default.scanDocument) {
          const { scannedImages } = await DocumentScanner.default.scanDocument({
            maxNumDocuments: 1,
            letUserAdjustCrop: true,
          });
          if (scannedImages && scannedImages.length > 0) {
            return await this.downsampleAndCompress(scannedImages[0]);
          }
        }
      } catch (e) {
        // Fall through to interactive camera cropper
      }
    }

    // 2. Interactive Camera Cropper Fallback (Works in Expo Go & Standard Mobile)
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to scan lead sheets.');
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      return await this.downsampleAndCompress(result.assets[0].uri);
    }

    return null;
  }

  /**
   * Universal On-Device Downsampling & Compression Pipeline:
   * Resizes raw 48MP iPhone photos (8MB–12MB) down to 1600px width JPEG (quality 0.75, <250KB)
   * on-device before any API or OCR processing.
   */
  static async downsampleAndCompress(imageUri: string): Promise<string> {
    if (Platform.OS === 'web') {
      return await this.downsampleWebImage(imageUri, 1600, 0.75);
    }

    try {
      // @ts-ignore
      const ImageManipulator = await import('expo-image-manipulator');
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1600 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );
      return manipulated.uri;
    } catch (e) {
      console.warn('Native downsampling fallback to raw URI:', e);
      return imageUri;
    }
  }

  /**
   * HTML5 Canvas based downsampling and compression for Web browser preview (<250KB)
   */
  private static async downsampleWebImage(
    dataUri: string,
    maxWidth: number = 1600,
    quality: number = 0.75
  ): Promise<string> {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed);
          } else {
            resolve(dataUri);
          }
        };
        img.onerror = () => resolve(dataUri);
        img.src = dataUri;
      } catch {
        resolve(dataUri);
      }
    });
  }
}
