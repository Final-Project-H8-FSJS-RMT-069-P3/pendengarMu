// src/app/api/reviews/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDB } from "@/server/config/mongodb";
import AppReview from "@/server/models/AppReview";
import { ObjectId } from "mongodb";
// ─── POST /api/reviews  (submit review) ───────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { bookingId, rating, comment } = (await req.json()) as {
      bookingId: string;
      rating: number;
      comment: string;
    };

    // Validasi input
    if (!bookingId || !rating || !comment?.trim()) {
      return NextResponse.json(
        { message: "bookingId, rating, dan comment wajib diisi" },
        { status: 400 }
      );
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { message: "Rating harus antara 1–5" },
        { status: 400 }
      );
    }

    const userId = session.user.id as string;
    const userName = session.user.name ?? "Anonymous";

    // Pastikan booking ini milik user yang login dan statusnya done
    const db = await getDB();
    console.log("bookingId:", bookingId);
    console.log("userId:", userId);

    const booking = await db.collection("UserBookings").findOne({
      _id: new ObjectId(bookingId),
      userId: new ObjectId(userId),
      isDone: true,
    });
    if (!booking) {
      return NextResponse.json(
        { message: "Booking tidak ditemukan atau belum selesai" },
        { status: 404 }
      );
    }

    // Cegah double review
    const alreadyReviewed = await AppReview.hasReviewed(userId, bookingId);
    if (alreadyReviewed) {
      return NextResponse.json(
        { message: "Kamu sudah memberikan review untuk sesi ini" },
        { status: 409 }
      );
    }

    const review = await AppReview.createReview({
      userId,
      userName,
      bookingId,
      rating,
      comment: comment.trim(),
    });

    return NextResponse.json(
      { message: "Review berhasil disimpan", data: review },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/reviews]", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── GET /api/reviews  (ambil semua review untuk home page) ───────────────────
export async function GET() {
  try {
    const reviews = await AppReview.getAllReviews();
    return NextResponse.json({ data: reviews });
  } catch (err) {
    console.error("[GET /api/reviews]", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
