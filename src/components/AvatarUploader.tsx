import React, { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { DEFAULT_TENANT_ID } from "../lib/tenant";
import AgentAvatar from "./AgentAvatar";

type AvatarUploaderProps = {
  currentAvatarUrl?: string | null;
  currentEmoji?: string;
  size?: "md" | "lg";
  onUploaded: (storageId: Id<"_storage">) => void;
};

const AvatarUploader: React.FC<AvatarUploaderProps> = ({
  currentAvatarUrl,
  currentEmoji,
  size = "lg",
  onUploaded,
}) => {
  const generateUploadUrl = useMutation(api.agents.generateAvatarUploadUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);

    try {
      const uploadUrl = await generateUploadUrl({ tenantId: DEFAULT_TENANT_ID });
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");

      const { storageId } = await result.json();
      onUploaded(storageId as Id<"_storage">);
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = previewUrl || currentAvatarUrl;

  return (
    <div className="relative cursor-pointer group" onClick={handleClick}>
      <AgentAvatar
        avatarUrl={displayUrl}
        avatarEmoji={currentEmoji}
        size={size}
      />
      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-white text-[10px] font-semibold">
          {uploading ? "..." : "Upload"}
        </span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default AvatarUploader;
