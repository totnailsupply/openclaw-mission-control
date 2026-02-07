import React from "react";

type AgentAvatarProps = {
  avatarUrl?: string | null;
  avatarEmoji?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeMap = {
  sm: "w-5 h-5 text-xs",
  md: "w-10 h-10 text-xl",
  lg: "w-14 h-14 text-2xl",
};

const AgentAvatar: React.FC<AgentAvatarProps> = ({
  avatarUrl,
  avatarEmoji,
  size = "md",
  className = "",
}) => {
  const sizeClasses = sizeMap[size];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="avatar"
        className={`${sizeClasses} rounded-full object-cover border border-border ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} bg-muted rounded-full flex items-center justify-center border border-border ${className}`}
    >
      {avatarEmoji || "🤖"}
    </div>
  );
};

export default AgentAvatar;
