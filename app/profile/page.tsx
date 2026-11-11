"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User,
  Shield,
  Monitor,
  Sliders,
  Camera,
  LogOut,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { users, auth as authApi, ApiError, type UserStats } from "@/lib/api";
import { PresenceAvatar } from "@/components/shared/PresenceAvatar";
import { StatCard, StatCardSkeleton } from "@/components/shared/StatCard";
import {
  SettingsGroup,
  SettingsListRow,
} from "@/components/shared/SettingsListRow";
import { Modal } from "@/components/shared/Modal";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/auth/PrimaryButton";

// ── Schemas ───────────────────────────────────────────────────────────────────

const editProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  bio: z.string().max(200, "Bio must be under 200 characters").optional(),
});

const personalInfoSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type EditProfileValues = z.infer<typeof editProfileSchema>;
type PersonalInfoValues = z.infer<typeof personalInfoSchema>;
type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, updateUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditProfileValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: { name: user?.name ?? "", bio: user?.bio ?? "" },
  });

  // Reset local state each time the modal opens (adjusting state on a prop
  // change during render, rather than in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAvatarPreview(user?.avatarUrl ?? null);
      setSaveError(null);
    }
  }

  useEffect(() => {
    if (open) reset({ name: user?.name ?? "", bio: user?.bio ?? "" });
  }, [open, user, reset]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) {
      setSaveError("Choose a PNG, JPEG, GIF or WebP image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setSaveError("Image must be under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
    // Stored as a data URL on the profile (the server caps its size).
  }

  async function onSubmit(values: EditProfileValues) {
    setSaveError(null);
    try {
      const updated = await users.updateMe({
        name: values.name,
        bio: values.bio,
        ...(avatarPreview ? { avatarUrl: avatarPreview } : {}),
      });
      updateUser({ name: updated.name, bio: updated.bio, avatarUrl: updated.avatarUrl });
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save profile.");
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit Profile">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {saveError && (
          <p className="text-sm text-danger" role="alert">{saveError}</p>
        )}

        {/* Avatar picker */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <PresenceAvatar
              name={user?.name ?? "U"}
              status="online"
              src={avatarPreview ?? user?.avatarUrl}
              customSize={64}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-accent-gradient flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
              aria-label="Change avatar"
            >
              <Camera className="w-3 h-3 text-white" />
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">Profile photo</p>
            <p className="text-[12px] text-text-tertiary mt-0.5">JPG, PNG or GIF · max 5 MB</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <FormField
          id="edit-name"
          label="Display name"
          type="text"
          error={errors.name?.message}
          {...register("name")}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-bio" className="text-[13px] font-medium text-text-secondary">
            Bio <span className="text-text-tertiary">(optional)</span>
          </label>
          <textarea
            id="edit-bio"
            rows={3}
            placeholder="Tell people a little about yourself…"
            className="w-full bg-surface-elevated border border-border-subtle text-sm text-text-primary placeholder:text-text-tertiary px-3 py-2.5 resize-none focus:outline-none focus:border-accent-start focus:ring-1 focus:ring-accent-start/30 transition-colors"
            style={{ borderRadius: "var(--radius-md)" }}
            {...register("bio")}
          />
          {errors.bio && (
            <p className="text-[12px] text-danger" role="alert">{errors.bio.message}</p>
          )}
        </div>

        <PrimaryButton type="submit" loading={isSubmitting}>Save changes</PrimaryButton>
      </form>
    </Modal>
  );
}

// ── Personal Info Modal ───────────────────────────────────────────────────────

function PersonalInfoModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, updateUser } = useAuth();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PersonalInfoValues>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: { name: user?.name ?? "" },
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSaveError(null);
      setSuccess(false);
    }
  }

  useEffect(() => {
    if (open) reset({ name: user?.name ?? "" });
  }, [open, user, reset]);

  async function onSubmit(values: PersonalInfoValues) {
    setSaveError(null);
    try {
      const updated = await users.updateMe({ name: values.name });
      updateUser({ name: updated.name });
      setSuccess(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save.");
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Personal Info">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {saveError && <p className="text-sm text-danger" role="alert">{saveError}</p>}
        {success && <p className="text-sm text-success">Changes saved.</p>}

        <FormField
          id="pi-name"
          label="Full name"
          type="text"
          error={errors.name?.message}
          {...register("name")}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-text-secondary">Email address</label>
          <input
            type="email"
            value={user?.email ?? ""}
            readOnly
            className="w-full bg-surface-elevated/50 border border-border-subtle text-sm text-text-tertiary px-3 py-2.5 cursor-not-allowed"
            style={{ borderRadius: "var(--radius-md)" }}
          />
          <p className="text-[12px] text-text-tertiary">
            Contact support to change your email address.
          </p>
        </div>

        <PrimaryButton type="submit" loading={isSubmitting}>Save</PrimaryButton>
      </form>
    </Modal>
  );
}

// ── Security Modal ────────────────────────────────────────────────────────────

function SecurityModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [serverMessage, setServerMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setServerMessage(null);
  }

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  async function onSubmit(values: ChangePasswordValues) {
    setServerMessage(null);
    try {
      await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setServerMessage({ type: "success", text: "Password updated successfully." });
      reset();
    } catch (err) {
      setServerMessage({
        type: "error",
        text: err instanceof ApiError ? err.message : "Failed to update password.",
      });
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Change Password">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverMessage && (
          <p
            className={`text-sm ${serverMessage.type === "error" ? "text-danger" : "text-success"}`}
            role="alert"
          >
            {serverMessage.text}
          </p>
        )}

        <FormField
          id="cur-pwd"
          label="Current password"
          type="password"
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />
        <FormField
          id="new-pwd"
          label="New password"
          type="password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <FormField
          id="conf-pwd"
          label="Confirm new password"
          type="password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <PrimaryButton type="submit" loading={isSubmitting}>Update password</PrimaryButton>
      </form>
    </Modal>
  );
}

// ── Profile Page ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [piOpen, setPiOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  useEffect(() => {
    users
      .stats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setStatsLoading(false));
  }, []);

  const navRows: {
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    onClick?: () => void;
    href?: string;
  }[] = [
    { label: "Personal Info", sublabel: "Name and email", icon: <User className="w-4 h-4" />, onClick: () => setPiOpen(true) },
    { label: "Security", sublabel: "Password and 2FA", icon: <Shield className="w-4 h-4" />, onClick: () => setSecurityOpen(true) },
    { label: "Devices", sublabel: "Manage active sessions", icon: <Monitor className="w-4 h-4" />, href: "/settings?tab=devices" },
    { label: "Preferences", sublabel: "Notifications and appearance", icon: <Sliders className="w-4 h-4" />, href: "/settings?tab=notifications" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <PresenceAvatar
          name={user?.name ?? "U"}
          status="online"
          src={user?.avatarUrl}
          customSize={80}
        />
        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-[22px] font-semibold text-text-primary leading-tight truncate">
            {user?.name ?? "—"}
          </h1>
          <p className="text-sm text-success mt-0.5">● Online</p>
          {user?.bio && (
            <p className="text-sm text-text-secondary mt-1.5 line-clamp-2">{user.bio}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="shrink-0 px-3 py-2 text-sm font-medium text-text-primary bg-surface-elevated border border-border-subtle hover:border-text-tertiary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          style={{ borderRadius: "var(--radius-md)" }}
        >
          Edit Profile
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard value={stats?.meetingsAttended ?? 0} label="Meetings" />
            <StatCard value={stats?.hoursOnline ?? 0} label="Hours Online" />
            <StatCard value={stats?.filesShared ?? 0} label="Files Shared" />
            <StatCard value={stats?.roomsCreated ?? 0} label="Rooms Created" />
          </>
        )}
      </div>

      {/* Nav rows */}
      <SettingsGroup>
        {navRows.map((row) => (
          <SettingsListRow
            key={row.label}
            variant="nav"
            icon={row.icon}
            label={row.label}
            sublabel={row.sublabel}
            onClick={row.onClick}
            href={row.href}
          />
        ))}
      </SettingsGroup>

      {/* Sign out */}
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Sign out of Durotto?")) logout();
        }}
        className="flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold text-danger bg-surface border border-danger/30 hover:bg-danger/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        style={{ borderRadius: "var(--radius-lg)" }}
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>

      {/* Modals */}
      <EditProfileModal open={editOpen} onOpenChange={setEditOpen} />
      <PersonalInfoModal open={piOpen} onOpenChange={setPiOpen} />
      <SecurityModal open={securityOpen} onOpenChange={setSecurityOpen} />
    </div>
  );
}
