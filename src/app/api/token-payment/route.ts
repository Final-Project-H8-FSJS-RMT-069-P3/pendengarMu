import { getDB } from "@/server/config/mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { bookingId } = await req.json();
  const db = await getDB();

  const order = await db.collection("Orders").findOne({
    bookingId: new ObjectId(bookingId),
    status: "pending",
  });

  if (!order) {
    return NextResponse.json(
      { message: "Order not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    token: order.paymentToken,
  });
}