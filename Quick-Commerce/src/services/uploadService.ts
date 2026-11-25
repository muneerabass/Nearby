import * as ImagePicker from 'expo-image-picker';
import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { api } from './apiClient';

interface SignatureResponse {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder?: string;
}

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  bytes: number;
  width: number;
  height: number;
}

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const SUPPORTED_IMAGE_TYPES = new Set(Object.values(MIME_TYPE_BY_EXTENSION));

function extensionFor(filename: string | null | undefined): string | null {
  const cleanName = filename?.split('?')[0]?.split('#')[0] ?? '';
  const extension = cleanName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension ?? null;
}

function imageUploadDetails(asset: ImagePicker.ImagePickerAsset): { fileName: string; mimeType: string } {
  const extension = extensionFor(asset.fileName) ?? extensionFor(asset.uri);
  const pickerMimeType = asset.mimeType?.toLowerCase().split(';')[0] ?? null;
  const mimeType = pickerMimeType ?? (extension ? MIME_TYPE_BY_EXTENSION[extension] : undefined);

  if (!mimeType || !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error('Unsupported photo format. Choose a JPG, PNG, WebP, or GIF image.');
  }

  const safeExtension = extension && MIME_TYPE_BY_EXTENSION[extension] ? extension : mimeType.split('/')[1];
  return {
    fileName: asset.fileName ?? `upload-${Date.now()}.${safeExtension}`,
    mimeType,
  };
}

/** Uploads one already-picked asset to Cloudinary using a signature. */
async function uploadAssetToCloudinary(
  asset: ImagePicker.ImagePickerAsset,
  signature: SignatureResponse,
): Promise<string> {
  // Cloudinary accepts a multipart POST at this URL; the file field name must be `file`.
  const uploadUrl = `https://api.cloudinary.com/v1_1/${signature.cloud_name}/image/upload`;
  const { fileName } = imageUploadDetails(asset);
  const form = new FormData();
  // SDK 57 expects an actual Blob/File in a FormData part. Passing the picker
  // URI as a plain object produces the native "unsupported data part" error.
  form.append('file', new File(asset.uri), fileName);
  form.append('api_key', signature.api_key);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  if (signature.folder) form.append('folder', signature.folder);

  const response = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Cloudinary upload failed (${response.status}): ${text.slice(0, 160)}`);
  }
  const data = (await response.json()) as CloudinaryUploadResponse;
  return data.secure_url;
}

/**
 * Multi-select image-upload flow for admins:
 *   1. Launch the gallery picker with multi-selection enabled.
 *   2. Ask the backend for ONE short-lived Cloudinary signature (reused for the
 *      whole batch — same folder/timestamp, valid ~1h).
 *   3. Upload every picked file straight to Cloudinary.
 *   4. Return the `secure_url`s in the order they were picked.
 *
 * Returns an empty array if the user cancels. Throws on any step that fails.
 */
export async function pickAndUploadProductImages(limit = 6): Promise<string[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access was denied.');
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.85,
  });
  const assets = picked.assets ?? [];
  if (picked.canceled || assets.length === 0) {
    return [];
  }

  // Validate the full selection before requesting an upload signature so the
  // admin gets one clear, actionable error and no partial batch is uploaded.
  assets.forEach(imageUploadDetails);

  // One signature covers every file in this batch.
  const signature = await api.post<SignatureResponse>('/admin/uploads/signature', undefined, { auth: true });

  // Upload with bounded concurrency (max 3) to avoid saturating the network while
  // preserving the order the user picked.
  const MAX_CONCURRENT = 3;
  const results: (string | Error)[] = new Array(assets.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < assets.length) {
      const index = nextIndex++;
      try {
        results[index] = await uploadAssetToCloudinary(assets[index], signature);
      } catch (e) {
        results[index] = e instanceof Error ? e : new Error(String(e));
      }
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, assets.length) }, runWorker);
  await Promise.all(workers);

  // Surface the first error if any upload failed; partial failures are not silently dropped.
  const firstError = results.find((r): r is Error => r instanceof Error);
  if (firstError) throw firstError;

  return results as string[];
}

/** Single-image convenience wrapper (returns null if cancelled). */
export async function pickAndUploadProductImage(): Promise<string | null> {
  const urls = await pickAndUploadProductImages(1);
  return urls[0] ?? null;
}
