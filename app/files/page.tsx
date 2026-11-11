"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, UploadCloud, Inbox } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { files, uploadFile, type RoomFile } from "@/lib/api";
import { StorageUsageBar } from "@/components/files/StorageUsageBar";
import { FilesMiniSidebar, type FilesTab } from "@/components/files/FilesMiniSidebar";
import { FilesToolbar } from "@/components/files/FilesToolbar";
import { FileCard } from "@/components/files/FileCard";

const DEFAULT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FilesPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filesList, setFilesList] = useState<RoomFile[]>([]);
  const [usage, setUsage] = useState({ usedBytes: 0, totalBytes: DEFAULT_LIMIT_BYTES });
  const [activeTab, setActiveTab] = useState<FilesTab>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("date");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshUsage = useCallback(() => {
    files
      .usage()
      .then((u) => setUsage({ usedBytes: u.totalBytes ?? 0, totalBytes: u.limitBytes ?? u.limitGb * 1024 ** 3 }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    files
      .list()
      .then((list) => {
        if (active) setFilesList(list);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load files.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    refreshUsage();
    return () => {
      active = false;
    };
  }, [refreshUsage]);

  /** Run a file action, surfacing failures instead of leaving an unhandled rejection. */
  const run = useCallback(async (action: () => Promise<void>, fallback: string) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    }
  }, []);

  const handleUpload = useCallback(
    (file: File) =>
      run(async () => {
        setUploading(file.name);
        try {
          const confirmed = await uploadFile(file, null);
          setFilesList((current) => [confirmed, ...current]);
          refreshUsage();
        } finally {
          setUploading(null);
        }
      }, "Upload failed."),
    [run, refreshUsage],
  );

  const patchFile = (id: string, patch: Partial<RoomFile>) =>
    setFilesList((current) => current.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const filteredFiles = useMemo(() => {
    const safeFiles = [...filesList];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let next = safeFiles.filter((file) => !file.deletedAt);
    if (activeTab === "shared") next = next.filter((file) => file.uploaderId !== user?.id);
    if (activeTab === "recent") next = next.filter((file) => new Date(file.uploadedAt) >= thirtyDaysAgo);
    if (activeTab === "favorites") next = next.filter((file) => file.isFavorite);
    if (activeTab === "trash") next = safeFiles.filter((file) => file.deletedAt);

    const sorted = [...next].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "size") return b.size - a.size;
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    });

    return sorted;
  }, [activeTab, filesList, sortBy, user?.id]);

  const emptyStateCopy = useMemo(() => {
    if (activeTab === "all") return { title: "No files yet", body: "Upload your first file to get started.", icon: <UploadCloud className="h-8 w-8" /> };
    if (activeTab === "shared") return { title: "Nothing shared with you yet", body: "Files shared in rooms you join will appear here.", icon: <Inbox className="h-8 w-8" /> };
    if (activeTab === "recent") return { title: "No recent files", body: "Files uploaded in the last 30 days will appear here.", icon: <FileText className="h-8 w-8" /> };
    if (activeTab === "favorites") return { title: "No favorites yet", body: "Star files to keep them handy.", icon: <FileText className="h-8 w-8" /> };
    return { title: "Trash is empty", body: "Deleted files will appear here until you remove them permanently.", icon: <FileText className="h-8 w-8" /> };
  }, [activeTab]);

  const handleUploadInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleUpload(file);
    }
    event.target.value = "";
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await handleUpload(file);
    }
  };

  return (
    <div className="min-h-screen bg-base px-4 py-6 md:px-6" onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadInput} />
      {dragActive ? <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/50"><div className="rounded-[var(--radius-xl)] border border-accent-start bg-surface px-8 py-6 text-center text-text-primary">Drop your file to upload</div></div> : null}
      <StorageUsageBar usedBytes={usage.usedBytes} totalBytes={usage.totalBytes} />
      <div className="flex flex-col gap-6 lg:flex-row">
        <FilesMiniSidebar activeTab={activeTab} onSelectTab={setActiveTab} onUploadClick={() => fileInputRef.current?.click()} compact={false} />
        <div className="flex-1">
          <FilesToolbar title={activeTab === "all" ? "All Files" : activeTab === "shared" ? "Shared with me" : activeTab === "recent" ? "Recent" : activeTab === "favorites" ? "Favorites" : "Trash"} viewMode={viewMode} onViewModeChange={setViewMode} sortBy={sortBy} onSortChange={setSortBy} />
          {uploading ? <div className="mb-3 rounded-[var(--radius-lg)] border border-border-subtle bg-surface p-4 text-sm text-text-secondary">Uploading {uploading}…</div> : null}
          {error ? <div className="mb-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger/10 p-4 text-sm text-text-primary">{error}</div> : null}
          {loading ? <div className="rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-8 text-center text-text-secondary">Loading files…</div> : filteredFiles.length === 0 ? <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated text-accent-start">{emptyStateCopy.icon}</div>
            <h3 className="text-lg font-semibold text-text-primary">{emptyStateCopy.title}</h3>
            <p className="mt-2 max-w-md text-sm text-text-secondary">{emptyStateCopy.body}</p>
            {activeTab === "all" ? <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 rounded-[var(--radius-md)] bg-accent-gradient px-4 py-2 text-sm font-semibold text-white">Upload file</button> : null}
          </div> : <div className={viewMode === "grid" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
            {filteredFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                viewMode={viewMode}
                currentUserId={user?.id}
                onDownload={(item) => run(async () => saveBlob(await files.download(item.id), item.name), "Download failed.")}
                onFavoriteToggle={(item) => run(async () => {
                  const next = !item.isFavorite;
                  patchFile(item.id, { isFavorite: next });
                  try {
                    if (next) await files.favorite(item.id);
                    else await files.unfavorite(item.id);
                  } catch (err) {
                    patchFile(item.id, { isFavorite: !next });
                    throw err;
                  }
                }, "Could not update favorites.")}
                onRename={(item) => run(async () => {
                  const name = window.prompt("Rename file", item.name)?.trim();
                  if (!name || name === item.name) return;
                  const updated = await files.rename(item.id, name);
                  patchFile(item.id, { name: updated.name });
                }, "Rename failed.")}
                onDelete={(item) => run(async () => {
                  if (!window.confirm(`Move "${item.name}" to Trash?`)) return;
                  await files.softDelete(item.id);
                  patchFile(item.id, { deletedAt: new Date().toISOString() });
                }, "Could not move the file to Trash.")}
                onRestore={(item) => run(async () => {
                  await files.restore(item.id);
                  patchFile(item.id, { deletedAt: null });
                }, "Restore failed.")}
                onDeleteForever={(item) => run(async () => {
                  if (!window.confirm(`Delete "${item.name}" permanently? This cannot be undone.`)) return;
                  await files.deleteForever(item.id);
                  setFilesList((current) => current.filter((f) => f.id !== item.id));
                  refreshUsage();
                }, "Delete failed.")}
                activeTab={activeTab}
              />
            ))}
          </div>}
        </div>
      </div>
    </div>
  );
}
