import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import FormBrief from "@/server/models/FormBrief";
import User from "@/server/models/User";
import { ObjectId } from "mongodb";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
    const formBriefId = url.searchParams.get("formBriefId");
    if (!formBriefId) {
        return NextResponse.json({ message: "formBrief not found" }, { status: 404 });
    }

    const staff = await User.getUserById(session.user.id);
    if (!staff) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const note = await req.json();
  const { content } = note;
  if (!content) {
    return NextResponse.json({ message: "Note content is required" }, { status: 400 });
  }
  try {
    const collection = await FormBrief.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(formBriefId) },
      { $push: { notes: { staffId: new ObjectId(session.user.id), staff, content, createdAt: new Date() } } }
    );
    return NextResponse.json({ message: "Note added successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add note";
    return NextResponse.json({ message }, { status: 500 });
  }
}
