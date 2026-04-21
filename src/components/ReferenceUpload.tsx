"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import {
  ImagePlus,
  Film,
  Music,
  X,
  Link2,
  ArrowLeftRight,
  Plus,
  Loader2,
  UserCheck,
  AlertCircle,
  ExternalLink,
  Upload,
  FolderPlus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Library,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { ReferenceAsset } from "@/lib/types";
import {
  listAssetGroups,
  createAssetGroup,
  createAssetFromUrl,
  createAssetFromFile,
  uploadFile,
} from "@/lib/api";

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getFileType(file: File): "image" | "video" | "audio" {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "image";
}

function getRoleForType(type: "image" | "video" | "audio"): string {
  if (type === "video") return "reference_video";
  if (type === "audio") return "reference_audio";
  return "reference_image";
}

function detectUrlType(url: string): { type: "image" | "video" | "audio"; role: string } {
  if (url.startsWith("asset://")) {
    return { type: "image", role: "reference_image" };
  }
  if (/\.(mp4|mov|webm)/i.test(url) || url.includes("video")) {
    return { type: "video", role: "reference_video" };
  }
  if (/\.(mp3|wav|ogg)/i.test(url) || url.includes("audio")) {
    return { type: "audio", role: "reference_audio" };
  }
  return { type: "image", role: "reference_image" };
}

function AssetCard({
  asset,
  uploading,
}: {
  asset: ReferenceAsset;
  uploading?: boolean;
}) {
  const removeReference = useAppStore((s) => s.removeReference);
  const isAssetUri = asset.url.startsWith("asset://");

  return (
    <div className="group relative bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
      <div className="aspect-square flex items-center justify-center bg-gray-100 w-16 h-16">
        {uploading ? (
          <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
        ) : asset.type === "image" && asset.preview ? (
          <img
            src={asset.preview || asset.url}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : isAssetUri ? (
          <UserCheck className="w-5 h-5 text-green-500" />
        ) : asset.type === "video" ? (
          <Film className="w-5 h-5 text-blue-400" />
        ) : asset.type === "audio" ? (
          <Music className="w-5 h-5 text-purple-400" />
        ) : (
          <ImagePlus className="w-5 h-5 text-gray-400" />
        )}
      </div>
      {isAssetUri && (
        <div className="absolute bottom-0 left-0 right-0 bg-green-500/80 text-[7px] text-white text-center py-0.5 leading-none">
          Asset
        </div>
      )}
      <button
        onClick={() => removeReference(asset.id)}
        className="absolute -top-1 -right-1 p-0.5 bg-gray-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

function FirstLastFrameUpload() {
  const { references, addReference, removeReference } = useAppStore();
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);

  const firstFrame = references.find((r) => r.role === "first_frame");
  const lastFrame = references.find((r) => r.role === "last_frame");

  const handleUpload = useCallback(
    async (file: File, role: "first_frame" | "last_frame") => {
      const existing = references.find((r) => r.role === role);
      if (existing) removeReference(existing.id);

      try {
        const url = await fileToBase64(file);
        addReference({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: "image",
          url,
          name: file.name,
          role,
          preview: url,
        });
      } catch {
        /* skip */
      }
    },
    [addReference, removeReference, references]
  );

  const swapFrames = () => {
    if (!firstFrame && !lastFrame) return;
    const updates: { id: string; role: string }[] = [];
    if (firstFrame) updates.push({ id: firstFrame.id, role: "last_frame" });
    if (lastFrame) updates.push({ id: lastFrame.id, role: "first_frame" });

    const store = useAppStore.getState();
    const newRefs = store.references.map((r) => {
      const up = updates.find((u) => u.id === r.id);
      return up ? { ...r, role: up.role } : r;
    });
    useAppStore.setState({ references: newRefs });
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 border border-dashed border-gray-300 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all min-h-[80px]"
        onClick={() => firstRef.current?.click()}
      >
        {firstFrame?.preview ? (
          <div className="relative group">
            <img
              src={firstFrame.preview}
              alt="First frame"
              className="w-16 h-16 object-cover rounded-lg"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeReference(firstFrame.id);
              }}
              className="absolute -top-1 -right-1 p-0.5 bg-gray-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ) : (
          <Plus className="w-5 h-5 text-gray-400 mb-1" />
        )}
        <span className="text-[10px] text-gray-400 mt-1">First</span>
      </div>

      <button
        onClick={swapFrames}
        className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
        title="Swap frames"
      >
        <ArrowLeftRight className="w-4 h-4" />
      </button>

      <div
        className="flex-1 border border-dashed border-gray-300 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all min-h-[80px]"
        onClick={() => lastRef.current?.click()}
      >
        {lastFrame?.preview ? (
          <div className="relative group">
            <img
              src={lastFrame.preview}
              alt="Last frame"
              className="w-16 h-16 object-cover rounded-lg"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeReference(lastFrame.id);
              }}
              className="absolute -top-1 -right-1 p-0.5 bg-gray-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ) : (
          <Plus className="w-5 h-5 text-gray-400 mb-1" />
        )}
        <span className="text-[10px] text-gray-400 mt-1">Last</span>
      </div>

      <input
        ref={firstRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f, "first_frame");
          e.target.value = "";
        }}
      />
      <input
        ref={lastRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f, "last_frame");
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface AssetGroupItem {
  Id: string;
  Name: string;
  AssetCount?: number;
  CreateTime?: string;
  Status?: string;
  GroupType?: string;
}

function AssetManagerDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (uri: string, type: "image" | "video" | "audio") => void;
}) {
  const [tab, setTab] = useState<"upload" | "manual">("upload");
  const [uri, setUri] = useState("");
  const [assetType, setAssetType] = useState<"image" | "video" | "audio">("image");

  const [groups, setGroups] = useState<AssetGroupItem[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [newGroupName, setNewGroupName] = useState("");
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    assetId: string;
    assetUri: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const apiKey = useAppStore((s) => s.apiKey);

  const loadGroups = useCallback(async () => {
    setGroupLoading(true);
    setGroupError(null);
    try {
      const data = await listAssetGroups();
      const rawItems = data.Items || [];
      const items: AssetGroupItem[] = rawItems.map(
        (item: Record<string, unknown>) => {
          const ag = (item.AssetGroup || item) as Record<string, unknown>;
          return {
            Id: ag.Id as string,
            Name: ag.Name as string,
            CreateTime: ag.CreateTime as string,
            Status: (item.Status as string) || "",
            GroupType: (ag.GroupType as string) || "",
          };
        }
      );
      setGroups(items);
      if (items.length > 0 && !selectedGroup) {
        setSelectedGroup(items[0].Id);
      }
    } catch (e) {
      setGroupError(
        e instanceof Error ? e.message : "Failed to load asset groups"
      );
    } finally {
      setGroupLoading(false);
    }
  }, [selectedGroup]);

  useEffect(() => {
    if (open) loadGroups();
  }, [open, loadGroups]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setGroupLoading(true);
    setGroupError(null);
    try {
      const data = await createAssetGroup(newGroupName.trim());
      setNewGroupName("");
      await loadGroups();
      if (data?.Id) setSelectedGroup(data.Id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create group";
      if (msg.includes("ServiceNotOpen") || msg.includes("not activated")) {
        setGroupError(
          "Asset Service 미활성화. 콘솔에서 먼저 활성화하세요."
        );
      } else {
        setGroupError(msg);
      }
    } finally {
      setGroupLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedGroup) {
      setUploadError("Asset Group을 먼저 선택하세요.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      let result;

      if (uploadFile && apiKey) {
        result = await createAssetFromFile(apiKey, selectedGroup, uploadFile);
      } else if (uploadUrl.trim()) {
        result = await createAssetFromUrl(
          selectedGroup,
          uploadUrl.trim(),
          uploadName.trim() || "asset"
        );
      } else {
        setUploadError("파일 또는 URL을 입력하세요.");
        setUploading(false);
        return;
      }

      const assetId = result?.Id || result?.AssetId || "";
      const assetUri = assetId ? `asset://${assetId}` : "";
      setUploadResult({ assetId, assetUri });
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : "Asset 생성 실패"
      );
    } finally {
      setUploading(false);
    }
  };

  const handleUseAsset = () => {
    if (!uploadResult?.assetUri) return;
    onSubmit(uploadResult.assetUri, assetType);
    setUploadResult(null);
    setUploadFile(null);
    setUploadUrl("");
    setUploadName("");
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Library className="w-4 h-4 text-green-500" />
              Asset Library
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1 mb-4">
            <button
              onClick={() => setTab("upload")}
              className={`py-2 rounded-lg text-xs font-medium transition-all ${
                tab === "upload"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Upload className="w-3.5 h-3.5 inline mr-1" />
              업로드하여 등록
            </button>
            <button
              onClick={() => setTab("manual")}
              className={`py-2 rounded-lg text-xs font-medium transition-all ${
                tab === "manual"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Link2 className="w-3.5 h-3.5 inline mr-1" />
              Asset URI 직접 입력
            </button>
          </div>

          {tab === "upload" ? (
            <div className="space-y-4">
              {/* Asset Group */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    Asset Group
                  </label>
                  <button
                    onClick={loadGroups}
                    disabled={groupLoading}
                    className="text-[10px] text-blue-500 hover:underline inline-flex items-center gap-0.5"
                  >
                    <RefreshCw
                      className={`w-2.5 h-2.5 ${groupLoading ? "animate-spin" : ""}`}
                    />
                    새로고침
                  </button>
                </div>

                {groups.length > 0 ? (
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {groups.map((g) => (
                      <option key={g.Id} value={g.Id}>
                        {g.Name}
                        {g.GroupType ? ` [${g.GroupType}]` : ""}
                        {g.Status ? ` (${g.Status})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400 py-2">
                    {groupLoading
                      ? "로딩중..."
                      : "Asset Group이 없습니다. 콘솔에서 QR 코드 플로우를 통해 실사 인물 그룹을 생성하거나, Asset Service 활성화 후 새 그룹을 만드세요."}
                  </p>
                )}

                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="새 그룹 이름"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                  />
                  <button
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim() || groupLoading}
                    className="px-3 py-2 text-xs font-medium bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex items-center gap-1"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    생성
                  </button>
                </div>

                {groupError && (
                  <div className="mt-2 flex items-start gap-1.5 p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-600">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      {groupError}
                      {groupError.includes("미활성화") && (
                        <a
                          href="https://console.byteplus.com/ark/region:ark+ap-southeast-1/openManagement?LLM=%7B%7D&advancedActiveKey=model"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block mt-1 text-blue-500 hover:underline"
                        >
                          콘솔에서 활성화 →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <hr className="border-gray-100" />

              {/* Upload source */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">
                  이미지 소스
                </label>
                <div className="space-y-2">
                  <div
                    className="border border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-all"
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploadFile ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-xs text-gray-700">
                          {uploadFile.name}{" "}
                          <span className="text-gray-400">
                            ({(uploadFile.size / 1024).toFixed(0)}KB)
                          </span>
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadFile(null);
                          }}
                          className="p-0.5 hover:bg-gray-200 rounded"
                        >
                          <X className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-gray-400 mb-1" />
                        <span className="text-[10px] text-gray-400">
                          로컬 파일 선택 (이미지/비디오)
                        </span>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setUploadFile(f);
                        setUploadUrl("");
                        if (!uploadName) setUploadName(f.name);
                      }
                      e.target.value = "";
                    }}
                  />

                  <div className="text-center text-[10px] text-gray-300">또는</div>

                  <input
                    type="text"
                    value={uploadUrl}
                    onChange={(e) => {
                      setUploadUrl(e.target.value);
                      if (e.target.value) setUploadFile(null);
                    }}
                    placeholder="공개 이미지 URL (https://...)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
              </div>

              {/* Asset type */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">에셋 타입</label>
                <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
                  {(["image", "video", "audio"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAssetType(t)}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                        assetType === t
                          ? "bg-white text-gray-800 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {t === "image" ? "Image" : t === "video" ? "Video" : "Audio"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload button */}
              <button
                onClick={handleUpload}
                disabled={
                  uploading ||
                  !selectedGroup ||
                  (!uploadFile && !uploadUrl.trim())
                }
                className="w-full py-2.5 text-sm font-medium bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Asset 생성중...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Asset Library에 등록
                  </>
                )}
              </button>

              {uploadError && (
                <div className="flex items-start gap-1.5 p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p className="flex-1">{uploadError}</p>
                </div>
              )}

              {uploadResult && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Asset 등록 완료!
                  </div>
                  <div className="text-[10px] text-green-600 font-mono bg-green-100/50 px-2 py-1.5 rounded-lg break-all">
                    {uploadResult.assetUri}
                  </div>
                  <button
                    onClick={handleUseAsset}
                    className="w-full py-2 text-xs font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    이 Asset을 레퍼런스로 사용
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Manual URI tab */
            <div className="space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                BytePlus 콘솔에서 등록한 실사 인물 또는 디지털 캐릭터의 Asset ID를 입력하세요.
                <br />
                형식:{" "}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">
                  asset://asset-20260222234430-xxxxx
                </code>
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Asset URI
                </label>
                <input
                  type="text"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  placeholder="asset://asset-20260410114236-8cdfz"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">에셋 타입</label>
                <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
                  {(["image", "video", "audio"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAssetType(t)}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                        assetType === t
                          ? "bg-white text-gray-800 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {t === "image" ? "Image" : t === "video" ? "Video" : "Audio"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <a
                  href="https://console.byteplus.com/ark/region:ark+ap-southeast-1/experience/vision?modelId=seedance-2-0-260128&tab=GenVideo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-500 hover:underline inline-flex items-center gap-0.5"
                >
                  콘솔에서 Asset 관리
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    const trimmed = uri.trim();
                    if (!trimmed) return;
                    const finalUri = trimmed.startsWith("asset://")
                      ? trimmed
                      : `asset://${trimmed}`;
                    onSubmit(finalUri, assetType);
                    setUri("");
                    onClose();
                  }}
                  disabled={!uri.trim()}
                  className="px-4 py-2 text-xs font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                >
                  추가
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ReferenceMode() {
  const { references, addReference, removeReference } = useAppStore();
  const apiKey = useAppStore((s) => s.apiKey);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingNames, setUploadingNames] = useState<Set<string>>(new Set());
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      setUploadError(null);

      for (const file of Array.from(files)) {
        const type = getFileType(file);
        const role = getRoleForType(type);

        if (type === "image") {
          if (file.size > MAX_IMAGE_BYTES) {
            setUploadError(`이미지는 30MB 이하여야 합니다: ${file.name}`);
            continue;
          }
          try {
            const dataUri = await fileToBase64(file);
            addReference({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type,
              url: dataUri,
              name: file.name,
              role,
              preview: dataUri,
            });
          } catch {
            setUploadError(`이미지 로드 실패: ${file.name}`);
          }
        } else if (type === "audio") {
          if (file.size > MAX_AUDIO_BYTES) {
            setUploadError(`오디오는 15MB 이하여야 합니다: ${file.name}`);
            continue;
          }
          try {
            const dataUri = await fileToBase64(file);
            addReference({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type,
              url: dataUri,
              name: file.name,
              role,
            });
          } catch {
            setUploadError(`오디오 로드 실패: ${file.name}`);
          }
        } else if (type === "video") {
          if (file.size > MAX_VIDEO_BYTES) {
            setUploadError(`비디오는 50MB 이하여야 합니다: ${file.name}`);
            continue;
          }
          if (!apiKey) {
            setUploadError("비디오 업로드를 위한 API 키가 없습니다.");
            continue;
          }

          const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          setUploadingNames((prev) => new Set(prev).add(tempId));
          addReference({
            id: tempId,
            type,
            url: "",
            name: file.name,
            role,
          });

          try {
            const result = await uploadFile(apiKey, file);
            removeReference(tempId);
            setUploadingNames((prev) => {
              const next = new Set(prev);
              next.delete(tempId);
              return next;
            });
            addReference({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type,
              url: result.url,
              name: file.name,
              role,
            });
          } catch (e) {
            removeReference(tempId);
            setUploadingNames((prev) => {
              const next = new Set(prev);
              next.delete(tempId);
              return next;
            });
            const msg = e instanceof Error ? e.message : "업로드 실패";
            setUploadError(`비디오 업로드 실패 (${file.name}): ${msg}`);
          }
        }
      }
    },
    [addReference, removeReference, apiKey]
  );

  const handleUrlAdd = useCallback(() => {
    const url = window.prompt(
      "이미지/비디오/오디오의 공개 URL을 입력하세요:\n\n예시:\n• 이미지: https://example.com/photo.jpg\n• 비디오: https://example.com/clip.mp4\n• 오디오: https://example.com/sound.mp3\n• Asset: asset://asset-20260410114236-xxxxx"
    );
    if (!url) return;

    const { type, role } = detectUrlType(url.trim());

    addReference({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      url: url.trim(),
      name: url.trim().startsWith("asset://")
        ? url.trim().replace("asset://", "")
        : url.split("/").pop() || "asset",
      role,
      preview: type === "image" && !url.trim().startsWith("asset://") ? url.trim() : undefined,
    });
  }, [addReference]);

  const handleAssetUriSubmit = useCallback(
    (uri: string, type: "image" | "video" | "audio") => {
      const role = getRoleForType(type);
      addReference({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        url: uri,
        name: uri.replace("asset://", ""),
        role,
      });
    },
    [addReference]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {references.map((ref) => (
          <AssetCard
            key={ref.id}
            asset={ref}
            uploading={uploadingNames.has(ref.id)}
          />
        ))}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={references.length >= 12}
          className="w-16 h-16 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="로컬 파일 첨부 (이미지 ≤30MB / 비디오 ≤50MB / 오디오 ≤15MB)"
        >
          <Plus className="w-4 h-4 text-gray-400" />
          <span className="text-[9px] text-gray-400 mt-0.5">파일</span>
        </button>
        <button
          onClick={handleUrlAdd}
          className="w-16 h-16 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all shrink-0"
          title="공개 URL 입력 (이미지/비디오/오디오)"
        >
          <Link2 className="w-4 h-4 text-gray-400" />
          <span className="text-[9px] text-gray-400 mt-0.5">URL</span>
        </button>
        <button
          onClick={() => setAssetDialogOpen(true)}
          className="w-16 h-16 border border-dashed border-green-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-green-400 hover:bg-green-50/50 transition-all shrink-0"
          title="실사 인물 Asset URI 입력 (콘솔에서 등록한 asset://)"
        >
          <UserCheck className="w-4 h-4 text-green-500" />
          <span className="text-[8px] text-green-500 mt-0.5 leading-tight text-center">
            asset://
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,video/mp4,video/quicktime,audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFileUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && (
        <div className="flex items-start gap-1.5 p-2 bg-orange-50 border border-orange-200 rounded-lg text-[11px] text-orange-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="flex-1">{uploadError}</p>
        </div>
      )}

      <AssetManagerDialog
        open={assetDialogOpen}
        onClose={() => setAssetDialogOpen(false)}
        onSubmit={handleAssetUriSubmit}
      />
    </div>
  );
}

export default function ReferenceUpload() {
  const { params, references } = useAppStore();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <span className="font-medium text-gray-500">
          {params.mode === "first_last_frame"
            ? "First & Last Frame"
            : "이미지 / 비디오 / 오디오"}
        </span>
        {params.mode === "reference" && (
          <span>({references.length}/12)</span>
        )}
      </div>

      {params.mode === "first_last_frame" ? (
        <FirstLastFrameUpload />
      ) : (
        <ReferenceMode />
      )}
    </div>
  );
}
