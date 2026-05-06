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
  orderId?: string;
};

type BookingApiResponse = {
  message: string;
  role?: "USER" | "DOCTOR";
  data?: Booking[];
};

// Helpers
const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatAmount = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatSessionType = (type?: string) => {
  if (type === "videocall") return "Video";
  if (type === "chat-only") return "Chat";
  if (type === "offline") return "Offline";
  return "Unknown";
};

export default function BookingListPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [role, setRole] = useState<"USER" | "DOCTOR" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clickedDone, setClickedDone] = useState<Record<string, boolean>>({});
  const [clickedLoading, setClickedLoading] = useState<Record<string, boolean>>(
    {}
  );

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [reviewTarget, setReviewTarget] = useState<Booking | null>(null);

  const [paymentSyncLoading, setPaymentSyncLoading] = useState(false);

  const paymentState = searchParams.get("payment");
  const paymentOrderId = searchParams.get("order_id");
  const recoveringPayment =
    paymentState === "processing" && !!paymentOrderId;

  const sessionRole = String(session?.user?.role || "").toLowerCase();
  const isPsychiatrist =
    sessionRole === "doctor" || sessionRole === "psychiatrist";

  // Fetch bookings
  const loadBookings = async () => {
    const res = await fetch("/api/getbookings", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message);
    setBookings(json.data || []);
    setRole(json.role || null);
    return json.data || [];
  };

  // Fetch reviewed
  const loadReviewedIds = async () => {
    const res = await fetch("/api/reviews/me");
    if (!res.ok) return;
    const json = await res.json();
    setReviewedIds(new Set(json.data));
  };

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([loadBookings(), loadReviewedIds()]);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Payment polling
  useEffect(() => {
    if (!recoveringPayment) return;

    setPaymentSyncLoading(true);

    const interval = setInterval(async () => {
      const data = await loadBookings();
      const found = data.find(
        (b) => b.orderId === paymentOrderId && b.isPaid
      );

      if (found) {
        clearInterval(interval);
        setPaymentSyncLoading(false);
        router.replace("/bookinglist");
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [recoveringPayment]);

  const handlePay = async (bookingId: string) => {
    const res = await fetch("/api/token-payment", {
      method: "POST",
      body: JSON.stringify({ bookingId }),
    });
    const data = await res.json();

    if (window.snap) {
      window.snap.pay(data.token);
    }
  };

  const handleMarkDone = async (id: string) => {
    try {
      setClickedLoading((s) => ({ ...s, [id]: true }));

      await fetch("/api/video/token", {
        method: "POST",
        body: JSON.stringify({ action: "end-room", channelName: id }),
      });

      await loadBookings();
    } finally {
      setClickedLoading((s) => ({ ...s, [id]: false }));
    }
  };

  const handleReviewSuccess = (id: string) => {
    setReviewedIds((prev) => new Set([...prev, id]));
    setReviewTarget(null);
  };

  const filteredBookings = useMemo(() => bookings, [bookings]);

  if (recoveringPayment && (loading || paymentSyncLoading)) {
    return <div className="p-10 text-center">Processing payment...</div>;
  }

  return (
    <>
      <Navbar />
      <main className="p-6">
        {loading && <div>Loading...</div>}
        {error && <div>{error}</div>}

        {!loading &&
          filteredBookings.map((b) => (
            <div key={b._id} className="border p-4 mb-4 rounded">
              <div>{formatDateTime(b.date)}</div>
              <div>{formatAmount(b.amount)}</div>

              {/* ACTION */}
              <div className="flex gap-2 mt-2 flex-wrap">
                {!isPsychiatrist && !b.isPaid && (
                  <button onClick={() => handlePay(b._id)}>Pay</button>
                )}

                {b.isPaid && !b.isDone && (
                  <StartSessionButton
                    bookingId={b._id}
                    type={b.type}
                  />
                )}

                {!b.isDone && (
                  <button onClick={() => handleMarkDone(b._id)}>
                    {clickedLoading[b._id] ? "Loading..." : "Done"}
                  </button>
                )}

                {!isPsychiatrist &&
                  b.isDone &&
                  !reviewedIds.has(b._id) && (
                    <button onClick={() => setReviewTarget(b)}>
                      Review
                    </button>
                  )}
              </div>
            </div>
          ))}
      </main>

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