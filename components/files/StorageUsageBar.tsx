"use client";

interface StorageUsageBarProps {
  usedBytes: number;
  totalBytes: number;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function StorageUsageBar({ usedBytes, totalBytes }: StorageUsageBarProps) {
  const percent = totalBytes > 0 ? Math.min(100, Math.max(0, (usedBytes / totalBytes) * 100)) : 0;
  return (
    <div className="mb-6 rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {formatBytes(usedBytes)} of {formatBytes(totalBytes)} used
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
        <div className="h-full rounded-full bg-accent-gradient transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
