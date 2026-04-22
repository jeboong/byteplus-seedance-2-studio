"use client";

import { useCallback, useState } from "react";
import { useAppStore } from "./store";
import { uploadFile } from "./api";
import type { ReferenceAsset } from "./types";

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getFileType(file: File): ReferenceAsset["type"] | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

function getRoleForType(type: ReferenceAsset["type"]): string {
  if (type === "video") return "reference_video";
  if (type === "audio") return "reference_audio";
  return "reference_image";
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Shared upload handler used by ReferenceUpload (file picker) and
 * GenerateView (drag&drop / clipboard paste).
 *
 * - Image / Audio  → encoded as base64 data URI inline.
 * - Video          → uploaded to BytePlus Files API; placeholder reference
 *                    is added immediately with `uploading: true`, then
 *                    patched with the public URL once the upload completes.
 */
export function useFileUpload() {
  const apiKey = useAppStore((s) => s.apiKey);
  const addReference = useAppStore((s) => s.addReference);
  const updateReference = useAppStore((s) => s.updateReference);
  const removeReference = useAppStore((s) => s.removeReference);

  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (input: FileList | File[] | File) => {
      setError(null);
      const list: File[] =
        input instanceof File
          ? [input]
          : Array.isArray(input)
          ? input
          : Array.from(input);

      for (const file of list) {
        const type = getFileType(file);
        if (!type) {
          setError(`지원하지 않는 형식입니다: ${file.name || file.type}`);
          continue;
        }
        const role = getRoleForType(type);

        if (type === "image") {
          if (file.size > MAX_IMAGE_BYTES) {
            setError(`이미지는 30MB 이하여야 합니다: ${file.name}`);
            continue;
          }
          try {
            const dataUri = await fileToBase64(file);
            addReference({
              id: newId(),
              type,
              url: dataUri,
              name: file.name || `image-${Date.now()}`,
              role,
              preview: dataUri,
            });
          } catch {
            setError(`이미지 로드 실패: ${file.name}`);
          }
        } else if (type === "audio") {
          if (file.size > MAX_AUDIO_BYTES) {
            setError(`오디오는 15MB 이하여야 합니다: ${file.name}`);
            continue;
          }
          try {
            const dataUri = await fileToBase64(file);
            addReference({
              id: newId(),
              type,
              url: dataUri,
              name: file.name,
              role,
            });
          } catch {
            setError(`오디오 로드 실패: ${file.name}`);
          }
        } else if (type === "video") {
          if (file.size > MAX_VIDEO_BYTES) {
            setError(`비디오는 50MB 이하여야 합니다: ${file.name}`);
            continue;
          }
          if (!apiKey) {
            setError("비디오 업로드를 위한 API 키가 없습니다.");
            continue;
          }

          const tempId = newId();
          addReference({
            id: tempId,
            type,
            url: "",
            name: file.name,
            role,
            uploading: true,
          });

          try {
            const result = await uploadFile(apiKey, file);
            updateReference(tempId, {
              url: result.url,
              uploading: false,
            });
          } catch (e) {
            removeReference(tempId);
            const msg = e instanceof Error ? e.message : "업로드 실패";
            setError(`비디오 업로드 실패 (${file.name}): ${msg}`);
          }
        }
      }
    },
    [apiKey, addReference, updateReference, removeReference]
  );

  return {
    upload,
    error,
    clearError: () => setError(null),
    setError,
  };
}
