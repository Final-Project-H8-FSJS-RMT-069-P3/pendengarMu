"use client";
declare global {
  interface Window {
    snap: any;
  }
}

import Navbar from "@/components/navbar";
import { useEffect, useMemo, useState } from "react";
import { StartSessionButton } from "./StartSessionButton";
import { ReviewModal } from "./ReviewModal";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

type Booking = {
  _id: string;
  orderId?: string | null;
  userId: string;
  staffId: string;
  date: string;
  sessionDuration: number;
  type: "videocall" | "chat-only" | "offline";
  amount: number;
  isPaid: boolean;
  isDone: boolean;
  createdAt: string;
  userName: string;
  staffName: string;
};

type BookingApiResponse = {
  message: string;
  role?: "USER" | "DOCTOR";
  data?: Booking[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};
const formatAmount = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
const formatSessionType = (type?: string) => {
  switch (type) {
    case "videocall":
      return "Video";
    case "chat-only":
      return "Chat";
    case "offline":
      return "Offline";
    default:
      return "Unknown";
  }
};
const handlePay = async (bookingId: string) => {
  try {
    const res = await fetch("/api/token-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    if (window.snap) window.snap.pay(data.token);
    else alert("Midtrans Snap belum load");
  } catch (err) {
    console.error(err);
    alert("Gagal memulai pembayaran");
  }
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function BookingListPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [role, setRole] = useState<"USER" | "DOCTOR" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSyncLoading, setPaymentSyncLoading] = useState(false);

  // ID booking yang sudah pernah di-review oleh user ini
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  // Booking yang sedang dibuka modal review-nya
  const [reviewTarget, setReviewTarget] = useState<Booking | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | "PAID" | "UNPAID">(
    "ALL"
  );
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DONE" | "UPCOMING">(
    "ALL"
  );

  const paymentState = searchParams.get("payment");
  const paymentOrderId = searchParams.get("order_id");
  const recoveringPayment = paymentState === "processing" && !!paymentOrderId;

  const sessionRole = String(session?.user?.role || "").toLowerCase();
  const isPsychiatrist =
    sessionRole === "doctor" || sessionRole === "psychiatrist";
  const isDoctor = role === "DOCTOR";

  // ── Fetch bookings ────────────────────────────────────────────────────────
  const loadBookings = async () => {
    const response = await fetch("/api/getbookings", { cache: "no-store" });
    const payload = (await response.json()) as BookingApiResponse;
    if (!response.ok)
      throw new Error(payload.message || "Failed to fetch bookings");
    setBookings(payload.data || []);
    setRole(payload.role || null);
    return payload.data || [];
  };

  // ── Fetch reviewed booking IDs (hanya untuk USER) ────────────────────────
  const loadReviewedIds = async () => {
    try {
      const res = await fetch("/api/reviews/me");
      if (!res.ok) return;
      const json = (await res.json()) as { data: string[] };
      setReviewedIds(new Set(json.data));
    } catch {
      // non-critical, abaikan
    }
  };

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        if (isMounted) {
          await Promise.all([loadBookings(), loadReviewedIds()]);
        }
      } catch (err: unknown) {
        if (isMounted)
          setError(
            err instanceof Error ? err.message : "Unexpected error happened"
          );
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void init();
    return () => {
      isMounted = false;
    };
  }, []);

  // ── Polling setelah payment ───────────────────────────────────────────────
  useEffect(() => {
    if (!recoveringPayment) return;
    let isMounted = true;
    setPaymentSyncLoading(true);
    const poll = async () => {
      try {
        const latest = await loadBookings();
        const matched = latest.find(
          (b) => b.orderId === paymentOrderId && b.isPaid
        );
        if (matched && isMounted) {
          setPaymentSyncLoading(false);
          router.replace("/bookinglist");
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Unexpected error happened"
          );
          setPaymentSyncLoading(false);
        }
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 2000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [paymentOrderId, recoveringPayment, router]);

  // ── Memos ─────────────────────────────────────────────────────────────────
  const pageTitle = useMemo(
    () => (role === "DOCTOR" ? "Daftar Booking Pasien" : "Daftar Booking Saya"),
    [role]
  );
  const totalIncome = useMemo(
    () =>
      isDoctor
        ? bookings.reduce((acc, b) => acc + (b.isPaid ? b.amount : 0), 0)
        : 0,
    [bookings, isDoctor]
  );
  const totalPatientsServed = useMemo(
    () =>
      isDoctor ? bookings.reduce((acc, b) => acc + (b.isDone ? 1 : 0), 0) : 0,
    [bookings, isDoctor]
  );
  const getDisplayName = (booking: Booking) => {
    if (role === "DOCTOR") return booking.userName || "";
    if (role === "USER") return booking.staffName || "";
    return `${booking.userName || ""} ${booking.staffName || ""}`.trim();
  };
  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      const name = getDisplayName(b).toLowerCase();
      if (q && !name.includes(q)) return false;
      if (paymentFilter === "PAID" && !b.isPaid) return false;
      if (paymentFilter === "UNPAID" && b.isPaid) return false;
      if (statusFilter === "DONE" && !b.isDone) return false;
      if (statusFilter === "UPCOMING" && b.isDone) return false;
      return true;
    });
  }, [bookings, searchQuery, paymentFilter, statusFilter, role]);

  // ── Callback ketika review berhasil submit ────────────────────────────────
  const handleReviewSuccess = (bookingId: string) => {
    setReviewedIds((prev) => new Set([...prev, bookingId]));
    setReviewTarget(null);
  };

  // ── Loading state saat payment recovery ──────────────────────────────────
  if (recoveringPayment && (loading || paymentSyncLoading)) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#eff6ff_0%,#f8fafc_45%,#ffffff_100%)] px-4">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.08),rgba(15,23,42,0.03),rgba(14,165,233,0.08))]" />
        <div className="relative w-full max-w-xl rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-blue-100 bg-blue-50">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-600">
            Payment Processing
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            Menyelesaikan pembayaran Anda
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Booking Anda sedang disinkronkan. Halaman ini akan otomatis
            memperbarui begitu status paid masuk ke database.
          </p>
          <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            Mohon tunggu sebentar, kami sedang memeriksa konfirmasi pembayaran.
          </div>
        </div>
      </main>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-50 px-4 pb-12 pt-28">
        <div className="mx-auto max-w-6xl">
          {/* Header card */}
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
              Booking List
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
              {pageTitle}
            </h1>

            {isDoctor && (
              <div className="mt-4 flex gap-8">
                <div>
                  <div className="text-xs text-slate-500">Total Income</div>
                  <div className="text-xl font-bold text-green-700">
                    {formatAmount(totalIncome)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Patients Served</div>
                  <div className="text-xl font-bold text-blue-700">
                    {totalPatientsServed}
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search nama..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Payment</span>
                  <div className="flex gap-2">
                    {(["ALL", "PAID", "UNPAID"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setPaymentFilter(f)}
                        className={`text-xs px-2 py-1 rounded ${paymentFilter === f ? (f === "PAID" ? "bg-green-600 text-white" : f === "UNPAID" ? "bg-amber-600 text-white" : "bg-blue-600 text-white") : "bg-slate-100"}`}
                      >
                        {f === "ALL" ? "All" : f === "PAID" ? "Paid" : "Unpaid"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Status</span>
                  <div className="flex gap-2">
                    {(["ALL", "DONE", "UPCOMING"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={`text-xs px-2 py-1 rounded ${statusFilter === f ? (f === "DONE" ? "bg-green-600 text-white" : f === "UPCOMING" ? "bg-amber-600 text-white" : "bg-blue-600 text-white") : "bg-slate-100"}`}
                      >
                        {f === "ALL"
                          ? "All"
                          : f === "DONE"
                            ? "Done"
                            : "Upcoming"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {loading && (
            <div className="bg-white p-8 rounded-2xl shadow-sm">Loading...</div>
          )}
          {!loading && error && (
            <div className="bg-red-50 border border-red-200 p-6 rounded-2xl text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && bookings.length > 0 && (
            <>
              {/* ── DESKTOP TABLE ──────────────────────────────────── */}
              <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-left">
                    <tr>
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3">Nama</th>
                      <th className="px-4 py-3">Tipe Sesi</th>
                      <th className="px-4 py-3">Jumlah</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Sesi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-6 text-center text-slate-500"
                        >
                          No bookings found.
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map((booking) => (
                        <tr
                          key={booking._id}
                          className="hover:bg-slate-50 border-t border-slate-50"
                        >
                          <td className="px-4 py-3">
                            {formatDateTime(booking.date)}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {role === "DOCTOR"
                              ? booking.userName
                              : booking.staffName}
                          </td>
                          <td className="px-4 py-3">
                            {formatSessionType(booking.type)}
                          </td>
                          <td className="px-4 py-3">
                            {formatAmount(booking.amount)}
                          </td>
                          <td className="px-4 py-3">
                            {booking.isPaid ? (
                              <span className="text-green-600 font-semibold">
                                Paid
                              </span>
                            ) : (
                              <span className="text-amber-600 font-semibold">
                                Unpaid
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-bold px-2 py-1 rounded-full ${booking.isDone ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-700"}`}
                            >
                              {booking.isDone ? "Done" : "Upcoming"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {/* Pay Now */}
                              {!isPsychiatrist && !booking.isPaid && (
                                <button
                                  onClick={() => handlePay(booking._id)}
                                  className="text-xs px-3 py-1.5 bg-orange-50 text-orange-600 font-semibold rounded-lg hover:bg-orange-100 transition-colors whitespace-nowrap border border-orange-200"
                                >
                                  Pay Now
                                </button>
                              )}
                              {/* Brief — dokter */}
                              {isPsychiatrist && booking.userId && (
                                <button
                                  onClick={() =>
                                    router.push(`/formbrief/${booking.userId}`)
                                  }
                                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 font-semibold rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap border border-blue-100"
                                >
                                  Brief
                                </button>
                              )}
                              {/* ✅ Tombol Review — hanya user, sesi done, belum review */}
                              {!isPsychiatrist &&
                                booking.isDone &&
                                !reviewedIds.has(booking._id) && (
                                  <button
                                    onClick={() => setReviewTarget(booking)}
                                    className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 font-semibold rounded-lg hover:bg-purple-100 transition-colors whitespace-nowrap border border-purple-200"
                                  >
                                    Beri Review
                                  </button>
                                )}
                              {/* Sudah review */}
                              {!isPsychiatrist &&
                                booking.isDone &&
                                reviewedIds.has(booking._id) && (
                                  <span className="text-xs px-3 py-1.5 bg-slate-50 text-slate-400 rounded-lg border border-slate-100">
                                    ✓ Reviewed
                                  </span>
                                )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {booking.isPaid && !booking.isDone && (
                              <StartSessionButton
                                bookingId={booking._id}
                                type={booking.type}
                              />
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── MOBILE CARDS ───────────────────────────────────── */}
              <div className="md:hidden space-y-4">
                {filteredBookings.length === 0 ? (
                  <div className="bg-white p-10 rounded-2xl text-slate-400 text-center shadow-sm">
                    No data found.
                  </div>
                ) : (
                  filteredBookings.map((booking) => (
                    <div
                      key={booking._id}
                      className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-4"
                    >
                      {/* Header */}
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                            {role === "DOCTOR" ? "Patient" : "Staff"}
                          </span>
                          <span className="font-extrabold text-slate-900 text-lg leading-tight">
                            {role === "DOCTOR"
                              ? booking.userName
                              : booking.staffName}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${booking.isDone ? "bg-slate-100 text-slate-400" : "bg-green-100 text-green-700"}`}
                        >
                          {booking.isDone ? "Done" : "Upcoming"}
                        </span>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 gap-y-4 border-y border-slate-50 py-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                            Waktu Sesi
                          </span>
                          <span className="text-sm text-slate-700 font-bold">
                            {formatDateTime(booking.date)}
                          </span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                            Tipe Sesi
                          </span>
                          <span className="text-sm text-slate-700 font-bold">
                            {formatSessionType(booking.type)}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                            Total Bayar
                          </span>
                          <span className="text-sm font-black text-slate-900">
                            {formatAmount(booking.amount)}
                          </span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                            Pembayaran
                          </span>
                          {booking.isPaid ? (
                            <span className="text-sm text-green-600 font-black">
                              Lunas
                            </span>
                          ) : (
                            <span className="text-sm text-amber-600 font-black">
                              Belum Lunas
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {!isPsychiatrist && !booking.isPaid && (
                          <button
                            onClick={() => handlePay(booking._id)}
                            className="flex-1 text-center text-xs px-4 py-3 bg-orange-50 text-orange-600 font-black rounded-xl border border-orange-200 hover:bg-orange-100 transition-all active:scale-95"
                          >
                            Pay Now
                          </button>
                        )}
                        {booking.isPaid && !booking.isDone && (
                          <div className="flex-1">
                            <StartSessionButton
                              bookingId={booking._id}
                              type={booking.type}
                            />
                          </div>
                        )}
                        {isPsychiatrist && booking.userId && (
                          <button
                            onClick={() =>
                              router.push(`/formbrief/${booking.userId}`)
                            }
                            className="flex-1 text-xs px-4 py-3 bg-blue-50 text-blue-700 font-black rounded-xl border border-blue-100 hover:bg-blue-100 transition-all active:scale-95"
                          >
                            Lihat Brief
                          </button>
                        )}
                        {/* ✅ Tombol Review mobile */}
                        {!isPsychiatrist &&
                          booking.isDone &&
                          !reviewedIds.has(booking._id) && (
                            <button
                              onClick={() => setReviewTarget(booking)}
                              className="flex-1 text-xs px-4 py-3 bg-purple-50 text-purple-700 font-black rounded-xl border border-purple-200 hover:bg-purple-100 transition-all active:scale-95"
                            >
                              Beri Review
                            </button>
                          )}
                        {!isPsychiatrist &&
                          booking.isDone &&
                          reviewedIds.has(booking._id) && (
                            <span className="flex-1 text-center text-xs px-4 py-3 bg-slate-50 text-slate-400 rounded-xl border border-slate-100">
                              ✓ Reviewed
                            </span>
                          )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {!loading && !error && bookings.length === 0 && (
            <div className="bg-white p-8 rounded-2xl shadow-sm text-slate-500 text-center">
              Tidak ada booking.
            </div>
          )}
        </div>
      </main>

      {/* ── Review Modal ──────────────────────────────────────── */}
      {reviewTarget && (
        <ReviewModal
          bookingId={reviewTarget._id}
          staffName={reviewTarget.staffName}
          onClose={() => setReviewTarget(null)}
          onSuccess={handleReviewSuccess}
        />
      )}
    </>
  );
}
