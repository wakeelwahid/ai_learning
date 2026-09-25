import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import SEOHead from "@/components/seo/SEOHead";
import { authApi, contentApi, BASE_URL } from "@/lib/api";
import { useAppDispatch } from "@/store";
import { setTokens, setUser, setProfileComplete } from "@/store/auth";
import { parseApiError } from "@/lib/errors";
import { Phone, RefreshCw, Sparkles, BookOpen, TrendingUp, ArrowRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button, Alert } from "@/components/ui";

// NOTE: Google Sign-In is intentionally hidden from the UI only, per product
// decision to move to Mobile Number + OTP as the primary login method.
// The backend OAuth routes (authApi.googleAuthUrl, /auth/google/*) are left
// completely untouched — this is a frontend-only change. To restore the
// button, uncomment the "Google sign-in" block below.
// function GoogleIcon() {
//   return (
//     <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
//       <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
//       <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
//       <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
//       <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
//     </svg>
//   );
// }

// NOTE: Email + password login is intentionally removed from THIS app's UI —
// students and parents now sign in with Mobile Number + OTP only. The
// backend route (POST /auth/login) is still reachable and still used by the
// separate admin app; auth_service.login() now rejects any non-admin
// account with a message pointing them back to OTP, so this isn't just a
// UI change; the old form is kept here, commented out, only as a reference
// for what previously lived on this page.
// function isValidEmailOrPhone(raw: string): boolean { ... }
// const [identifier, setIdentifier] = useState(""); ... (password-mode state)
// const doLogin = async () => { ... }

const FEATURE_BADGES = [
  { icon: Sparkles, label: "AI Tutor", sub: "Get instant help, anytime" },
  { icon: BookOpen, label: "Class 6–12", sub: "Complete syllabus coverage" },
  { icon: TrendingUp, label: "Track Progress", sub: "Stay on top of your goals" },
];

// Fallback used until the active-background fetch resolves, and permanently
// if no admin has uploaded one yet — see the login-background effect below.
const DEFAULT_HERO_BG = "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/Ecoliers_en_uniforme_dans_le_d%C3%A9sert_du_Thar_%28Rajasthan%29_%281%29.jpg";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return digits;
}

function isValidPhone(raw: string): boolean {
  return /^\+\d{10,15}$/.test(normalizePhone(raw));
}

// Indian mobile numbers start 6-9; this field only accepts a bare 10-digit
// national number (normalizePhone prepends +91) so we can validate and cap
// length as the user types, not just reject on submit.
function sanitizePhoneInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

function phoneFieldError(digitsOnly: string): string | null {
  if (!digitsOnly) return null;
  if (digitsOnly.length < 10) return "Enter a 10-digit mobile number.";
  if (!/^[6-9]/.test(digitsOnly)) return "Enter a valid Indian mobile number.";
  return null;
}

export default function LoginPage() {
  const [phone,           setPhone]           = useState("");
  const [otpStep,         setOtpStep]         = useState<"phone" | "otp">("phone");
  const [otpDigits,       setOtpDigits]       = useState<string[]>(Array(6).fill(""));
  const [sendLoading,     setSendLoading]     = useState(false);
  const [verifyLoading,   setVerifyLoading]   = useState(false);
  const [resendCooldown,  setResendCooldown]  = useState(0);
  const [phoneError,      setPhoneError]      = useState<string | null>(null);
  // null until the active-background fetch settles — this avoids ever
  // rendering (and the browser firing a request for) DEFAULT_HERO_BG only
  // to immediately replace it once the real admin image resolves, which
  // wasted a network request on every page load.
  const [heroBg,          setHeroBg]          = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  useEffect(() => {
    let cancelled = false;
    contentApi.getActiveLoginBackground()
      .then((res) => {
        const path = res.data?.image_path;
        if (cancelled) return;
        // path already looks like "/api/v1/content/...", and BASE_URL itself
        // ends in "/api" — strip that leading segment before concatenating,
        // or the two "/api"s double up into a 404.
        setHeroBg(path ? `${BASE_URL}${path.replace(/^\/api/, "")}` : DEFAULT_HERO_BG);
      })
      .catch(() => { if (!cancelled) setHeroBg(DEFAULT_HERO_BG); });
    return () => { cancelled = true; };
  }, []);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { t }    = useLanguage();

  const successMessage = (location.state as any)?.message as string | undefined;

  const afterLogin = (userData: any) => {
    const role = (userData.role as string).toLowerCase();
    dispatch(setUser({ ...userData, role }));
    if (role === "parent") return "/parent/dashboard";
    if (role === "teacher") return "/teacher/dashboard";
    return "/dashboard";
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErr = phoneFieldError(phone);
    if (fieldErr || !isValidPhone(phone)) {
      setPhoneError(fieldErr ?? "Please enter a valid 10-digit mobile number.");
      return;
    }
    setPhoneError(null);
    setSendLoading(true);
    try {
      await authApi.sendPhoneOtp(normalizePhone(phone));
      setOtpDigits(Array(6).fill(""));
      setResendCooldown(60);
      setOtpStep("otp");
    } catch (err) {
      setPhoneError(parseApiError(err));
    } finally {
      setSendLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      await authApi.sendPhoneOtp(normalizePhone(phone));
      setResendCooldown(60);
      setOtpDigits(Array(6).fill(""));
      otpRefs.current[0]?.focus();
    } catch (err) {
      setPhoneError(parseApiError(err));
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    if (digits.length === 6) {
      setOtpDigits(digits);
      otpRefs.current[5]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length < 6) { setPhoneError("Please enter all 6 digits"); return; }
    setPhoneError(null);
    setVerifyLoading(true);
    try {
      const { data: tokens } = await authApi.verifyPhoneOtp(normalizePhone(phone), code);
      dispatch(setTokens({ access: tokens.access_token, refresh: tokens.refresh_token }));
      dispatch(setProfileComplete(!!tokens.profile_complete));
      const meRes = await authApi.me();
      if (tokens.is_new_user) {
        // Brand-new account — role is "pending" until /role-select runs.
        dispatch(setUser({ ...meRes.data, role: (meRes.data.role as string).toLowerCase() }));
        navigate("/role-select");
        return;
      }
      const dest = afterLogin(meRes.data);
      navigate(tokens.profile_complete ? dest : "/profile-complete");
    } catch (err) {
      setPhoneError(parseApiError(err));
      setOtpDigits(Array(6).fill(""));
      otpRefs.current[0]?.focus();
    } finally {
      setVerifyLoading(false);
    }
  };

  // const handleGoogleLogin = async () => {
  //   setGoogleLoading(true);
  //   setError(null);
  //   try {
  //     const { data } = await authApi.googleAuthUrl();
  //     window.location.href = data.redirect_url;
  //   } catch {
  //     setError("Google login is not available right now. Please try again later.");
  //     setGoogleLoading(false);
  //   }
  // };

  return (
    <>
    <SEOHead
      title="Login — Sign in to EduLearn"
      description="Sign in to EduLearn and continue your AI-powered learning journey for Class 1–12 NCERT curriculum."
      canonical="/login"
      noIndex={true}
    />
    <div className="relative w-full h-screen overflow-hidden bg-white dark:bg-gray-950">
      <div className="mx-auto flex h-screen w-full max-w-[1440px]">

        {/* ── Left / hero panel — desktop only ─────────────────────────── */}
        <section className="relative hidden h-screen overflow-hidden bg-primary-950 lg:flex lg:w-[56%]">
          {/* object-contain, not object-cover — an admin can upload ANY
              image, any aspect ratio, any subject. cover crops to fill the
              box and randomly cuts off whatever matters in the photo (a
              face, a head); contain always shows the whole image,
              letterboxed on the section's own bg-primary-950 rather than
              gambling on a crop. */}
          {heroBg && (
            <img
              src={heroBg}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-primary-950/95 via-primary-900/85 to-primary-700/65" />

          <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-bold text-primary-700 shadow-lg">
                E
              </div>
              <span className="text-xl font-bold tracking-tight text-white">EduAI</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                ✨ AI-Powered
              </span>
            </div>

            <div className="max-w-[560px]">
              <p className="mb-4 text-sm font-medium text-primary-100">AI-powered learning platform</p>
              <h1 className="max-w-[520px] text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-white xl:text-6xl text-balance">
                Learn Smarter<br />with AI
              </h1>
              <p className="mt-5 max-w-[440px] text-base leading-7 text-primary-100">
                Personalized learning, better results.<br />A brighter future.
              </p>

              <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 backdrop-blur-md">
                <span className="text-xs font-semibold text-white">Classes 6–12</span>
              </div>

              <div className="mt-9 space-y-5">
                {FEATURE_BADGES.map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 backdrop-blur">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{label}</p>
                      <p className="mt-0.5 text-xs text-primary-100">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-primary-200">Learn smarter. Achieve more.</div>
          </div>
        </section>

        {/* ── Right / login panel ──────────────────────────────────────── */}
        <section className="flex h-screen w-full flex-col overflow-y-auto bg-white dark:bg-gray-950 lg:w-[44%] lg:overflow-hidden">

          <div className="hidden justify-end px-8 py-7 lg:flex xl:px-12">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-primary-600 hover:underline">Sign In</Link>
            </p>
          </div>

          {/* Mobile hero strip. object-contain (see the desktop panel's
              comment above) — the box's own bg-primary-900 fills any
              letterboxed space. */}
          <div className="relative flex h-[260px] shrink-0 flex-col overflow-hidden bg-primary-900 px-6 pt-8 lg:hidden">
            {heroBg && (
              <img
                src={heroBg}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
            {/* Bottom-anchored fade instead of a tint across the whole
                photo — the image itself should be fully visible; darkening
                only needs to exist where the white text actually sits. */}
            <div className="absolute inset-0 bg-gradient-to-t from-primary-950/90 via-primary-950/10 to-transparent" />
            <div className="relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base font-bold text-primary-700">E</div>
                <span className="text-lg font-bold text-white">EduAI</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[9px] font-semibold text-white">✨ AI-Powered</span>
              </div>
              <div className="mt-7">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary-100">AI-powered learning</p>
                <h1 className="mt-2 text-[28px] font-bold leading-[1.1] text-white text-balance">Your AI learning<br />companion</h1>
                <p className="mt-2 text-sm text-primary-100">Smarter learning. Better results.</p>
                <div className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">
                  <span className="text-[10px] font-semibold text-white">Classes 6–12</span>
                </div>
              </div>
            </div>
          </div>

          {/* Login content */}
          <div className="relative z-20 flex flex-1 items-start justify-center px-5 pb-8 lg:items-center lg:px-8">
            <div className="w-full max-w-[430px]">

              <div className="mb-8 hidden items-center gap-3 lg:flex">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-lg font-bold text-white">E</div>
                <span className="text-xl font-bold text-gray-900 dark:text-white">EduAI</span>
                <span className="rounded-full bg-primary-50 dark:bg-primary-900/40 px-2.5 py-1 text-[10px] font-semibold text-primary-600 dark:text-primary-300">AI-Powered</span>
              </div>

              {/* No negative margin / floating-card overlap on small
                  screens — a flat hero-then-form stack, same as the mobile
                  app's layout, instead of the card visually cutting into
                  the hero image. */}
              <div className="rounded-[22px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 pt-12 shadow-[0_15px_45px_rgba(15,23,42,0.12)] sm:p-7 sm:pt-12 lg:rounded-none lg:border-0 lg:p-0 lg:pt-0 lg:shadow-none">
                <h2 className="text-[26px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">{t("welcomeBack")}</h2>
                <p className="mt-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">{t("loginSub")}</p>

                <div className="mt-10">
                  <LoginFormBody
                    t={t} successMessage={successMessage} otpStep={otpStep} phoneError={phoneError}
                    phone={phone} setPhone={setPhone} setPhoneError={setPhoneError} handleSendOtp={handleSendOtp}
                    sendLoading={sendLoading} otpDigits={otpDigits} otpRefs={otpRefs} handleOtpChange={handleOtpChange}
                    handleOtpKeyDown={handleOtpKeyDown} handleOtpPaste={handleOtpPaste} handleVerifyOtp={handleVerifyOtp}
                    verifyLoading={verifyLoading} resendCooldown={resendCooldown} handleResendOtp={handleResendOtp}
                    setOtpStep={setOtpStep} normalizePhone={normalizePhone} phoneFieldError={phoneFieldError} isValidPhone={isValidPhone}
                    skipHeader
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}

// Shared phone/OTP form body — rendered once inside the mobile hero card and
// once inside the desktop card, so the two layouts never drift out of sync.
function LoginFormBody(props: {
  t: (k: any) => string;
  successMessage?: string;
  otpStep: "phone" | "otp";
  phoneError: string | null;
  phone: string;
  setPhone: (v: string) => void;
  setPhoneError: (v: string | null) => void;
  handleSendOtp: (e: React.FormEvent) => void;
  sendLoading: boolean;
  otpDigits: string[];
  otpRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  handleOtpChange: (i: number, v: string) => void;
  handleOtpKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleOtpPaste: (e: React.ClipboardEvent) => void;
  handleVerifyOtp: () => void;
  verifyLoading: boolean;
  resendCooldown: number;
  handleResendOtp: () => void;
  setOtpStep: (v: "phone" | "otp") => void;
  normalizePhone: (v: string) => string;
  phoneFieldError: (v: string) => string | null;
  isValidPhone: (v: string) => boolean;
  skipHeader?: boolean;
}) {
  const {
    t, successMessage, otpStep, phoneError, phone, setPhone, setPhoneError, handleSendOtp,
    sendLoading, otpDigits, otpRefs, handleOtpChange, handleOtpKeyDown, handleOtpPaste,
    handleVerifyOtp, verifyLoading, resendCooldown, handleResendOtp, setOtpStep,
    normalizePhone, phoneFieldError, isValidPhone,
  } = props;

  return (
    <>
      {!props.skipHeader && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("welcomeBack")}</h1>
          <p className="text-gray-500 text-sm mb-6">{t("loginSub")}</p>
        </>
      )}

          {/* Google sign-in — hidden per product decision, backend untouched
          <div className="mb-6">
            <button type="button" onClick={handleGoogleLogin} disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 shadow-sm transition-all text-sm font-medium text-gray-700 disabled:opacity-60">
              {googleLoading ? <Loader className="w-5 h-5 animate-spin" /> : <GoogleIcon />}
              {t("orContinueWith")} Google
            </button>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
          */}

          {successMessage && (
            <Alert variant="success" className="mb-5">
              {successMessage}
            </Alert>
          )}

          {otpStep === "phone" ? (
            <>
              {phoneError && (
                <Alert variant="danger" className="mb-5">
                  {phoneError}
                </Alert>
              )}
              {/* One unified mobile-number + OTP login for both students and
                  parents — role is decided AFTER verification (see
                  RoleSelectPage) for a brand-new account; a recognized phone
                  just logs into its existing account and role. */}
              <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
                <div>
                  {/* This form body is shared between the mobile hero card
                      (which IS dark-mode aware, dark:bg-gray-900) and the
                      desktop card — so it must follow dark: variants, not
                      force a light surface. The "+91" prefix and icon sit
                      in the same flex row as the input (not absolutely
                      positioned over it) so they can never drift to a
                      different line than the typed digits. */}
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Mobile Number</label>
                  <div className={`flex items-center gap-2 rounded-xl border px-3 transition ${
                    phoneFieldError(phone)
                      ? "border-danger-500 focus-within:ring-2 focus-within:ring-danger-500"
                      : "border-gray-200 dark:border-gray-600 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent"
                  } bg-white dark:bg-gray-800`}>
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-500 dark:text-gray-400 select-none shrink-0">+91</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="flex-1 min-w-0 bg-transparent border-0 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-0"
                      value={phone}
                      onChange={(e) => { setPhone(sanitizePhoneInput(e.target.value)); setPhoneError(null); }}
                      placeholder="98765 43210"
                      autoComplete="tel-national"
                      maxLength={10}
                      autoFocus
                      required
                      aria-invalid={!!phoneFieldError(phone)}
                    />
                  </div>
                  {phoneFieldError(phone) && (
                    <p className="error-text">{phoneFieldError(phone)}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  isLoading={sendLoading}
                  disabled={sendLoading || !!phoneFieldError(phone) || !isValidPhone(phone)}
                >
                  {sendLoading ? "Sending code…" : (
                    <span className="inline-flex items-center justify-center gap-2">
                      Send OTP <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
            </>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-5">
                We sent a 6-digit code to <span className="font-semibold text-gray-700">{normalizePhone(phone)}</span>
              </p>
              {phoneError && (
                <Alert variant="danger" className="mb-5">
                  {phoneError}
                </Alert>
              )}
              <div className="flex gap-1.5 sm:gap-2 justify-center mb-6 px-2" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className={`w-9 h-11 sm:w-11 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-xl border-2 bg-gray-50 text-gray-900 focus:outline-none transition-colors ${
                      digit ? "border-primary-500 bg-primary-50" : "border-gray-200 focus:border-primary-400"
                    }`}
                  />
                ))}
              </div>
              <Button
                onClick={handleVerifyOtp}
                disabled={verifyLoading || otpDigits.join("").length < 6}
                isLoading={verifyLoading}
                fullWidth
                size="lg"
                className="mb-4"
              >
                {verifyLoading ? "Verifying…" : "Verify & Continue"}
              </Button>
              <div className="text-center">
                <span className="text-sm text-gray-500">Didn't receive it? </span>
                {resendCooldown > 0 ? (
                  <span className="text-sm text-gray-400">Resend in {resendCooldown}s</span>
                ) : (
                  <button onClick={handleResendOtp} className="text-sm text-primary-600 font-semibold hover:underline inline-flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" /> Resend code
                  </button>
                )}
              </div>
              <button onClick={() => setOtpStep("phone")} className="w-full mt-4 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                ← Change mobile number
              </button>
            </div>
          )}

          <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
            {t("agreeToTerms")}{" "}
            <Link to="/terms" className="text-primary-600 hover:underline">{t("termsOfService")}</Link>
            {" "}{t("and")}{" "}
            <Link to="/privacy" className="text-primary-600 hover:underline">{t("privacyPolicy")}</Link>
          </p>
    </>
  );
}
