"use client";

import { useCallback, useState } from "react";
import { useAppStore } from "./store";
import { uploadAlibabaFile, uploadFile } from "./api";
import {
  getModelOption,
  isAlibabaModel,
  type AlibabaHappyHorseMode,
  type ReferenceAsset,
} from "./types";

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
export const MAX_HAPPYHORSE_IMAGE_BYTES = 10 * 1024 * 1024;

const HAPPYHORSE_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/bmp",
  "image/webp",
]);

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

function isHappyHorseImage(file: File): boolean {
  if (HAPPYHORSE_IMAGE_MIME.has(file.type.toLowerCase())) return true;
  return /\.(jpe?g|png|bmp|webp)$/i.test(file.name);
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 크기를 읽을 수 없습니다."));
    };
    image.src = url;
  });
}

async function validateHappyHorseImage(
  file: File,
  mode: AlibabaHappyHorseMode
): Promise<string | null> {
  if (!isHappyHorseImage(file)) {
    return `HappyHorse는 JPEG/JPG/PNG/BMP/WEBP 이미지만 지원합니다: ${file.name}`;
  }
  if (file.size > MAX_HAPPYHORSE_IMAGE_BYTES) {
    return `HappyHorse 이미지는 10MB 이하여야 합니다: ${file.name}`;
  }

  const { width, height } = await getImageDimensions(file);
  if (mode === "i2v") {
    const ratio = width / height;
    if (width < 300 || height < 300) {
      return `HappyHorse I2V 이미지는 가로/세로가 각각 300px 이상이어야 합니다: ${file.name}`;
    }
    if (ratio < 0.4 || ratio > 2.5) {
      return `HappyHorse I2V 이미지는 종횡비가 1:2.5~2.5:1 범위여야 합니다: ${file.name}`;
    }
  }
  if (mode === "r2v" && Math.min(width, height) < 400) {
    return `HappyHorse R2V 레퍼런스 이미지는 짧은 변이 400px 이상이어야 합니다: ${file.name}`;
  }
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
 * - BytePlus image/audio → encoded as original base64 data URI inline.
 * - BytePlus video       → uploaded to BytePlus Files API when it can return
 *                          a provider-readable URL; otherwise use public URL
 *                          or asset://.
 * - HappyHorse image     → uploaded to ModelStudio temporary OSS and passed
 *                          to DashScope as an oss:// URL.
 */
export function useFileUpload() {
  const apiKey = useAppStore((s) => s.apiKey);
  const alibabaApiKey = useAppStore((s) => s.alibabaApiKey);
  const modelId = useAppStore((s) => s.params.modelId);
  const references = useAppStore((s) => s.references);
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

      if (isAlibabaModel(modelId)) {
        const model = getModelOption(modelId);
        const happyHorseMode = model.happyHorseMode;
        if (!happyHorseMode || happyHorseMode === "t2v") {
          setError("HappyHorse Text-to-video는 첨부 없이 프롬프트만 사용합니다. 로컬 이미지는 I2V/R2V 모델에서 첨부하세요.");
          return;
        }
        if (!alibabaApiKey) {
          setError("로컬 이미지를 임시 업로드하려면 Alibaba ModelStudio API Key가 필요합니다.");
          return;
        }
        if (happyHorseMode === "i2v" && list.length !== 1) {
          setError("HappyHorse I2V는 첫 프레임 이미지 1개만 첨부할 수 있습니다.");
          return;
        }
        const existingHappyHorseImages = references.filter((r) => r.type === "image");
        if (
          happyHorseMode === "r2v" &&
          existingHappyHorseImages.length + list.length > 9
        ) {
          setError("HappyHorse R2V는 레퍼런스 이미지 최대 9개까지 첨부할 수 있습니다.");
          return;
        }

        for (const file of list) {
          if (getFileType(file) !== "image") {
            setError(`HappyHorse는 이미지 파일만 첨부할 수 있습니다: ${file.name || file.type}`);
            continue;
          }

          try {
            const validationError = await validateHappyHorseImage(
              file,
              happyHorseMode
            );
            if (validationError) {
              setError(validationError);
              continue;
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : `이미지 검증 실패: ${file.name}`);
            continue;
          }

          if (happyHorseMode === "i2v") {
            references.forEach((ref) => removeReference(ref.id));
          }

          const tempId = newId();
          let preview = "";
          try {
            preview = await fileToBase64(file);
          } catch {
            setError(`이미지 미리보기 로드 실패: ${file.name}`);
            continue;
          }

          addReference({
            id: tempId,
            type: "image",
            url: "",
            name: file.name || `image-${Date.now()}`,
            role: happyHorseMode === "i2v" ? "first_frame" : "reference_image",
            preview,
            uploading: true,
            uploadProvider: "alibaba",
          });

          try {
            const result = await uploadAlibabaFile(alibabaApiKey, file, modelId);
            updateReference(tempId, {
              url: result.url,
              uploading: false,
            });
          } catch (e) {
            removeReference(tempId);
            const msg = e instanceof Error ? e.message : "업로드 실패";
            setError(`HappyHorse 이미지 업로드 실패 (${file.name}): ${msg}`);
          }
        }
        return;
      }

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
          } catch (e) {
            const msg = e instanceof Error ? e.message : "이미지 로드 실패";
            setError(`이미지 처리 실패 (${file.name}): ${msg}`);
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
          } catch (e) {
            const msg = e instanceof Error ? e.message : "오디오 로드 실패";
            setError(`오디오 처리 실패 (${file.name}): ${msg}`);
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
            uploadProvider: "byteplus",
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
    [
      apiKey,
      alibabaApiKey,
      modelId,
      references,
      addReference,
      updateReference,
      removeReference,
    ]
  );

  return {
    upload,
    error,
    clearError: () => setError(null),
    setError,
  };
}
