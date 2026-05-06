import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";
import { auth } from "@/lib/auth";
import { getDB } from "../../../server/config/mongodb"; //<-- import dari src yg bener
import { ObjectId } from "mongodb"; //<-- import dari src yg bener
import User from "@/server/models/User";
import Order from "@/server/models/Order";

export async function POST(req: Request) {
  let orderId: string | null = null;

  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "USER") {
      return NextResponse.json(
        { message: "Doctors cannot book sessions" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { staffId, formBriefId, date, sessionDuration, amount, sessionType } =
      body;

    if (!staffId || !date) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 },
      );
    }

    // validate staffId is a valid ObjectId
    if (!ObjectId.isValid(staffId)) {
      return NextResponse.json({ message: "Invalid staffId" }, { status: 400 });
    }

    // validate date is a valid ISO datetime
    const dateObj = new Date(date);
    if (Number.isNaN(dateObj.getTime())) {
      return NextResponse.json({ message: "Invalid date" }, { status: 400 });
    }

    const db = await getDB();

    const mapType =
      sessionType === "video"
        ? "videocall"
        : sessionType === "chat"
          ? "chat-only"
          : "offline";
    const bookingDraft = {
      userId: session.user.id,
      staffId,
      formBriefId: formBriefId || null,
      date: dateObj,
      sessionDuration: parseInt(sessionDuration) || 30,
      amount: parseFloat(amount) || 0,
      type: mapType,
    } as const;

    // Prevent double-booking for the exact same staff and datetime
    const existingBooking = await db.collection("UserBookings").findOne({
      staffId: new ObjectId(staffId),
      date: bookingDraft.date,
    });
    const existingPendingOrder = await db.collection("Orders").findOne({
      "bookingDraft.staffId": staffId,
      "bookingDraft.date": bookingDraft.date,
      status: { $in: ["pending", "success"] },
    });
    if (existingBooking || existingPendingOrder) {
      return NextResponse.json(
        { message: "Time slot already booked" },
        { status: 409 },
      );
    }

    let userData = null;
    try {
      userData = await User.getUserById(bookingDraft.userId);
    } catch (e) {
      console.warn("Could not load user data for booking email:", e);
    }

    orderId = `ORDER-${new ObjectId().toString()}`;

    await Order.createOrder({
      userId: session.user.id,
      orderId,
      bookingDraft: {
        userId: bookingDraft.userId,
        staffId: bookingDraft.staffId,
        formBriefId: bookingDraft.formBriefId,
        date: bookingDraft.date,
        sessionDuration: bookingDraft.sessionDuration,
        amount: bookingDraft.amount,
        type: bookingDraft.type,
      },
      items: [
        {
          productId: staffId,
          name: `Consultation ${mapType}`,
          price: bookingDraft.amount,
          quantity: 1,
        },
      ],
      totalAmount: bookingDraft.amount,
      status: "pending",
      paymentToken: "",
      customerDetails: {
        first_name: userData?.name || "User",
        email: userData?.email || "",
      },
    });

    const snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY || "",
      clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
    });

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: bookingDraft.amount,
      },
      item_details: [
        {
          id: staffId,
          price: bookingDraft.amount,
          quantity: 1,
          name: `Consultation ${mapType}`,
        },
      ],
      customer_details: {
        first_name: userData?.name || "User",
        email: userData?.email || "",
      },
      credit_card: {
        secure: true,
      },
      callbacks: {
        finish: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/payment/finish`,
      },
    };

    const transaction = await snap.createTransaction(parameter);
    if (!transaction.token) {
      throw new Error("Failed to get Midtrans token");
    }

    await db.collection("Orders").updateOne(
      { orderId },
      {
        $set: {
          paymentToken: transaction.token,
        },
      },
    );

    return NextResponse.json(
      {
        message: "Booking created successfully",
        orderId,
        redirect_url: transaction.redirect_url,
        token: transaction.token,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Booking Error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (orderId) {
      try {
        await Order.updateOrderStatus(orderId, "failed");
      } catch (cleanupError) {
        console.error("Failed to mark draft order as failed:", cleanupError);
      }
    }
    return NextResponse.json(
      { message },
      { status: 500 },
    );
  }
}
