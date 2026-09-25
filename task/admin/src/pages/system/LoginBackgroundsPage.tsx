import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Image as ImageIcon, Star, Trash2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { loginBackgroundsApi } from "@/lib/api";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";

const MAX_SLOTS = 4;

interface LoginBackground {
  id: string;
  is_active: boolean;
  uploaded_by: string;
  created_at: string;
  image_path: string;
}

export default function LoginBackgroundsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: backgrounds = [], isLoading } = useQuery<LoginBackground[]>({
    queryKey: ["admin-login-backgrounds"],
    queryFn: () => loginBackgroundsApi.list().then(r => r.data),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return loginBackgroundsApi.upload(formData);
    },
    onSuccess: () => {
      toast.success("Background uploaded");
      qc.invalidateQueries({ queryKey: ["admin-login-backgrounds"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Upload failed"),
    onSettled: () => setUploading(false),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => loginBackgroundsApi.activate(id),
    onSuccess: () => {
      toast.success("Login screen updated");
      qc.invalidateQueries({ queryKey: ["admin-login-backgrounds"] });
    },
    onError: () => toast.error("Could not set as active"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => loginBackgroundsApi.remove(id),
    onSuccess: () => {
      toast.success("Background deleted");
      qc.invalidateQueries({ queryKey: ["admin-login-backgrounds"] });
    },
    onError: () => toast.error("Could not delete"),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    uploadMutation.mutate(file);
  }

  const slotsLeft = MAX_SLOTS - backgrounds.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Login Screen</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload up to {MAX_SLOTS} background images for the login screen (mobile app + web).
          The first image you upload is used automatically — pick a different one anytime by
          clicking "Set as active" on it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backgrounds ({backgrounds.length}/{MAX_SLOTS})</CardTitle>
          {slotsLeft > 0 && (
            <Button
              variant="primary"
              size="sm"
              isLoading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1.5" /> Upload image
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </CardHeader>

        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : backgrounds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No login backgrounds uploaded yet. The login screen falls back to its default
              illustration until you upload one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {backgrounds.map((bg) => (
              <div
                key={bg.id}
                className={clsx(
                  "relative rounded-xl border-2 overflow-hidden group",
                  bg.is_active
                    ? "border-primary-500 ring-2 ring-primary-100 dark:ring-primary-900/40"
                    : "border-gray-200 dark:border-gray-700"
                )}
              >
                <img
                  src={loginBackgroundsApi.imageUrl(bg.id)}
                  alt="Login background"
                  className="w-full h-40 object-cover"
                />

                {bg.is_active && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary-600 text-white text-xs font-semibold shadow">
                    <Star className="w-3 h-3 fill-current" /> Active
                  </div>
                )}

                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3">
                  {!bg.is_active && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => activateMutation.mutate(bg.id)}
                      isLoading={activateMutation.isPending && activateMutation.variables === bg.id}
                    >
                      <CheckCircle className="w-4 h-4 mr-1.5" /> Set as active
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (window.confirm("Delete this login background?")) {
                        deleteMutation.mutate(bg.id);
                      }
                    }}
                    isLoading={deleteMutation.isPending && deleteMutation.variables === bg.id}
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                  </Button>
                </div>
              </div>
            ))}

            {Array.from({ length: slotsLeft }).map((_, i) => (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-40 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:border-primary-400 hover:text-primary-500 transition-colors"
              >
                <Upload className="w-6 h-6" />
                <span className="text-xs font-medium">Upload</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
