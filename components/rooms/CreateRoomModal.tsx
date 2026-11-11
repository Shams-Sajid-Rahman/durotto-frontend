"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock } from "lucide-react";
import { rooms, ApiError } from "@/lib/api";
import { Modal } from "@/components/shared/Modal";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/auth/PrimaryButton";

const schema = z.object({
  name: z.string().min(1, "Room name is required").max(100, "Max 100 characters"),
  password: z.string().max(64, "Max 64 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

interface CreateRoomModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRoomModal({ open, onOpenChange }: CreateRoomModalProps) {
  const router = useRouter();
  const [addPassword, setAddPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Fresh form each time the modal opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAddPassword(false);
      setServerError(null);
    }
  }

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const room = await rooms.create({
        name: values.name,
        password: addPassword ? values.password : undefined,
      });
      onOpenChange(false);
      router.push(`/room/${room.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Failed to create room.");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create a Room"
      description="Give your room a name. Share the invite code to let others join."
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && (
          <p className="text-sm text-danger" role="alert">{serverError}</p>
        )}

        <FormField
          id="room-name"
          label="Room name"
          type="text"
          placeholder="e.g. Team standup"
          error={errors.name?.message}
          autoFocus
          {...register("name")}
        />

        {/* Password toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <div
            role="checkbox"
            aria-checked={addPassword}
            tabIndex={0}
            onClick={() => setAddPassword((v) => !v)}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setAddPassword((v) => !v); }}
            className="w-4 h-4 rounded border border-border-subtle bg-surface-elevated flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
            style={addPassword ? { background: "linear-gradient(135deg,#7C5CFF,#3D8BFF)", borderColor: "transparent" } : {}}
          >
            {addPassword && (
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-sm text-text-secondary">
            <Lock className="w-3.5 h-3.5" /> Password protect this room
          </span>
        </label>

        {addPassword && (
          <FormField
            id="room-password"
            label="Room password"
            type="password"
            placeholder="Min 4 characters"
            error={errors.password?.message}
            {...register("password")}
          />
        )}

        <PrimaryButton type="submit" loading={isSubmitting}>
          Create Room
        </PrimaryButton>
      </form>
    </Modal>
  );
}
