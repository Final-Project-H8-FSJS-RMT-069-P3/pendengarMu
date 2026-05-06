import { NextRequest, NextResponse } from "next/server";
import Order from "@/server/models/Order";
import UserBooking from "@/server/models/UserBooking";

const asSingle = (value: string | null) => value ?? undefined;

export async function GET(request: NextRequest) {
  try {
    const orderId = asSingle(request.nextUrl.searchParams.get("order_id"));
    const transactionStatus = asSingle(
      request.nextUrl.searchParams.get("transaction_status"),
    );
    const fraudStatus = asSingle(request.nextUrl.searchParams.get("fraud_status"));

    if (!orderId) {
      return NextResponse.redirect(new URL("/bookinglist", request.url));
    }

    let status: "pending" | "success" | "failed" = "pending";

    if (transactionStatus === "capture") {
      status = fraudStatus === "accept" ? "success" : "failed";
    } else if (transactionStatus === "settlement") {
      status = "success";
    } else if (
      transactionStatus === "cancel" ||
      transactionStatus === "deny" ||
      transactionStatus === "expire"
    ) {
      status = "failed";
    }

    await Order.updateOrderStatus(orderId, status);

    if (status === "success") {
      const order = await Order.getOrderById(orderId);

      if (order?.bookingId) {
        const bookingId = order.bookingId.toString();
        const booking = await UserBooking.getBookingById(bookingId);

        if (booking && !booking.isPaid) {
          await UserBooking.updateBookingPaymentStatus(bookingId, true);
        }
      }
    }

    const redirectUrl = new URL("/bookinglist", request.url);
    redirectUrl.searchParams.set("payment", "processing");
    redirectUrl.searchParams.set("order_id", orderId);

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Payment finish error:", error);
    return NextResponse.redirect(new URL("/bookinglist", request.url));
  }
}