import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";
import { getDB } from "@/server/config/mongodb";
import { ObjectId } from "mongodb";

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ message: "Missing orderId" }, { status: 400 });
    }

    const db = await getDB();
    const order = await db.collection("Orders").findOne({ orderId });
    if (!order) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }

    // Use CoreApi to check transaction status
    const core = new midtransClient.CoreApi({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY || "",
      clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
    });

    let statusResp = null;
    try {
      statusResp = await core.transaction.status(orderId);
    } catch (e) {
      // If Midtrans status check fails, fallback to order.status
      console.warn("Midtrans status check failed", e);
    }

    const txStatus = statusResp?.transaction_status || order.status;

    // Consider success states
    const successStates = ["settlement", "capture", "success"];

    if (successStates.includes(txStatus)) {
      // If booking already created, just return success
      if (order.bookingId) {
        return NextResponse.json({ success: true, bookingId: order.bookingId.toString() });
      }

      // Create booking from bookingPayload
      const bookingPayload = order.bookingPayload;
      if (!bookingPayload) {
        return NextResponse.json({ message: "No booking payload on order" }, { status: 400 });
      }

      // Mark booked as paid
      bookingPayload.isPaid = true;
      bookingPayload.createdAt = new Date(bookingPayload.createdAt || Date.now());

      const insertRes = await db.collection("UserBookings").insertOne(bookingPayload);
      const newBookingId = insertRes.insertedId;

      const roomName = `room-${newBookingId.toString()}`;
      await db.collection("Rooms").insertOne({
        userId: bookingPayload.userId,
        staffId: bookingPayload.staffId,
        roomName,
        createdAt: new Date(),
      });

      // Update order
      await db.collection("Orders").updateOne({ orderId }, { $set: { bookingId: newBookingId, status: "success", updatedAt: new Date() } });

      return NextResponse.json({ success: true, bookingId: newBookingId.toString() });
    }

    // Not successful yet - mark failed and return status
    await db.collection("Orders").updateOne({ orderId }, { $set: { status: "failed", updatedAt: new Date() } });
    return NextResponse.json({ success: false, status: txStatus });
  } catch (error) {
    console.error("Payment confirm error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
