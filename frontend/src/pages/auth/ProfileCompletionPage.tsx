import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api, authApi, contentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useAppSelector, useAppDispatch } from "@/store";
import { setProfileComplete, setUser } from "@/store/auth";
import { Camera, GraduationCap, School, User as UserIcon } from "lucide-react";
import { Button, Input, Select, Alert } from "@/components/ui";

/**
 * Mandatory profile-completion step for a phone-OTP account with no profile
 * row yet (see ProfileGuard — this is its redirect target). Same
 * board/class requirement as email registration's RegisterRequest validator,
 * enforced here client-side for UX and server-side by user_service's
 * CreateProfileRequest regardless.
 */
export default function ProfileCompletionPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const isStudent = (user?.role ?? "student").toLowerCase() === "student";

  const [fullName, setFullName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [board, setBoard] = useState("");
  const [classNum, setClassNum] = useState("");
  const [boardsData, setBoardsData] = useState<{ id: string; name: string }[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    contentApi.boards()
      .then((r) => setBoardsData(Array.isArray(r.data) ? r.data : []))
      .catch(() => setBoardsData([{ id: "cbse", name: "CBSE" }, { id: "icse", name: "ICSE" }, { id: "state", name: "State Board" }]));
  }, []);

  function handlePickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (isStudent && (!board || !classNum)) {
      setError("Please select your Board and Class — your subjects and chapters depend on them.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // 1. Create the profile row in user_service — this is exactly what
      //    ProfileGuard/GET /auth/profile-status checks for.
      await api.post("/v1/users/profile", {
        user_id: user!.id,
        full_name: fullName.trim(),
        school_name: schoolName.trim() || undefined,
        board: isStudent ? board : undefined,
        class_number: isStudent ? Number(classNum) : undefined,
      });

      // 2. Optional avatar — same two-step upload as the Settings page.
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const fd = new FormData();
        fd.append("file", avatarFile);
        try {
          const r = await api.post("/v1/users/profile/avatar", fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          avatarUrl = r.data.avatar_url;
        } catch {
          // Non-fatal — profile is already saved; the user can add a photo later in Settings.
          toast.error("Photo upload failed, but your profile was saved.");
        }
      }

      // 3. Mirror full_name/school_name/avatar onto the auth-layer user row
      //    so /auth/me reflects it immediately everywhere (header, etc).
      await authApi.updateProfile({
        full_name: fullName.trim(),
        school_name: schoolName.trim() || undefined,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      });

      if (user) {
        dispatch(setUser({
          ...user,
          full_name: fullName.trim(),
          school_name: schoolName.trim() || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        }));
      }
      dispatch(setProfileComplete(true));
      toast.success("Profile complete — welcome to EduLearn!");
      const role = user?.role?.toLowerCase();
      const homeRoute = role === "parent" ? "/parent/dashboard" : role === "teacher" ? "/teacher/dashboard" : "/dashboard";
      navigate(homeRoute, { replace: true });
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Complete your profile</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Just a few details before you get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-primary-400 transition-colors"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-8 h-8 text-gray-400" />
              )}
              <div className="absolute bottom-0 inset-x-0 bg-black/50 py-1 flex items-center justify-center">
                <Camera className="w-3.5 h-3.5 text-white" />
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickAvatar} />
            <span className="text-xs text-gray-400">Profile photo (optional)</span>
          </div>

          <Input
            label="Full Name"
            required
            type="text"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setError(null); }}
            placeholder="Your full name"
            autoFocus
          />

          {isStudent && (
            <>
              <div>
                <label className="label flex items-center gap-1.5">
                  <School className="w-3.5 h-3.5 text-gray-400" /> School Name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Delhi Public School"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-gray-400" /> Board <span className="text-danger-600">*</span>
                  </label>
                  <select
                    className="input"
                    value={board}
                    required
                    onChange={(e) => setBoard(e.target.value)}
                  >
                    <option value="" disabled>Select board</option>
                    {boardsData.map((b) => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <Select
                  label="Class"
                  required
                  value={classNum}
                  onChange={(e) => setClassNum(e.target.value)}
                >
                  <option value="" disabled>Select class</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>Class {n}</option>
                  ))}
                </Select>
              </div>
            </>
          )}

          {error && <Alert variant="danger">{error}</Alert>}

          <Button type="submit" isLoading={loading} fullWidth>
            {loading ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
