import { NextResponse } from "next/server";
import Review from "@/server/models/Review";
import { ObjectId } from "mongodb";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const staffId = url.searchParams.get("staffId");
    if (!staffId) {
        return NextResponse.json({ message: "Psychiatrist not found" }, { status: 404 });
    }

    try {
        const reviews = await Review.getReviewsByStaffId(staffId);
        return NextResponse.json({ reviews });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to fetch reviews";
        return NextResponse.json({ message }, { status: 500 });
    }
}