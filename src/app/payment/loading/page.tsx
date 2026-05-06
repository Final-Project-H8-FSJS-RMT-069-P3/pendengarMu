"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function PaymentLoadingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("orderId");
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    if (!orderId) {
      setStatus("missing");
      setTimeout(() => router.push("/bookinglist"), 2000);
      return;
    }

    let cancelled = false;

    async function checkOnce() {
      try {
        const res = await fetch("/api/payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json();
        if (data.success) {
          if (!cancelled) router.replace("/bookinglist");
        } else {
          // failed or pending
          setStatus("failed");
          setTimeout(() => router.replace("/bookinglist"), 2200);
        }
      } catch (err) {
        console.error(err);
        setStatus("error");
        setTimeout(() => router.replace("/bookinglist"), 2200);
      }
    }

    void checkOnce();

    return () => {
      cancelled = true;
    };
  }, [orderId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        {status === "checking" && <h2 className="text-xl font-bold">Checking payment status...</h2>}
        {status === "failed" && <h2 className="text-xl font-bold text-red-600">Payment failed. Redirecting...</h2>}
        {status === "error" && <h2 className="text-xl font-bold text-red-600">Error checking payment. Redirecting...</h2>}
        {status === "missing" && <h2 className="text-xl font-bold text-yellow-600">No order specified. Redirecting...</h2>}
      </div>
    </div>
  );
}
