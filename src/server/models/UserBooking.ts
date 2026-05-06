import { ObjectId } from "mongodb";
import { getDB } from "../config/mongodb";

export interface IUserBooking {
  _id?: ObjectId;
  orderId?: string;
  userId: ObjectId;
  staffId: ObjectId;
  formBriefId?: ObjectId | null;
  date: Date;
  sessionDuration: number;
  amount: number;
  type: "videocall" | "chat-only" | "offline";
  videoCallUrl?: string | null;
  isPaid: boolean;
  isDone: boolean;
  googleCalendarEventId?: string;
  googleCalendarEventLink?: string;
  googleCalendarSyncStatus?: "pending" | "success" | "failed";
  googleCalendarSyncError?: string;
  reminderSent: boolean;
  createdAt: Date;
}

export type BookingWithRelations = IUserBooking & {
  user?: {
    _id: ObjectId;
    name?: string;
    email?: string;
  };
  staff?: {
    _id: ObjectId;
    name?: string;
    email?: string;
  };
};

const toObjectId = (id: string) => {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }

  return new ObjectId(id);
};

export default class UserBooking {
  static async getCollection() {
    const db = await getDB();
    return db.collection<IUserBooking>("UserBookings");
  }

  static async createBooking(payload: Omit<IUserBooking, "_id">) {
    const collection = await this.getCollection();
    const result = await collection.insertOne({
      ...payload,
      createdAt: payload.createdAt ?? new Date(),
    });

    return result;
  }

  

  static async getBookingsByUserId(userId: string): Promise<BookingWithRelations[]> {
    const collection = await this.getCollection();

    return collection
      .aggregate<BookingWithRelations>([
        { $match: { userId: toObjectId(userId) } },
        {
          $lookup: {
            from: "Users",
            localField: "staffId",
            foreignField: "_id",
            as: "staff",
          },
        },
        {
          $addFields: {
            staff: { $arrayElemAt: ["$staff", 0] },
          },
        },
        { $sort: { date: -1 } },
      ])
      .toArray();
  }

  static async getBookingById(
  bookingId: string
): Promise<BookingWithRelations | null> {
  const collection = await this.getCollection();

  const result = await collection
    .aggregate<BookingWithRelations>([
      { $match: { _id: toObjectId(bookingId) } },
      {
        $lookup: {
          from: "Users",
          localField: "staffId",
          foreignField: "_id",
          as: "staff",
        },
      },
      {
        $addFields: {
          staff: { $arrayElemAt: ["$staff", 0] },
        },
      },
    ])
    .toArray();

  return result[0] || null; 
}

  static async getBookingsByStaffId(staffId: string): Promise<BookingWithRelations[]> {
    const collection = await this.getCollection();

    return collection
      .aggregate<BookingWithRelations>([
        { $match: { staffId: toObjectId(staffId) } },
        {
          $lookup: {
            from: "Users",
            localField: "userId",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $addFields: {
            user: { $arrayElemAt: ["$user", 0] },
          },
        },
        { $sort: { date: -1 } },
      ])
      .toArray();
  }

  static async updateBookingPaymentStatus(
    bookingId: string,
    isPaid: boolean,
  ) {
    const collection = await this.getCollection();

    const result = await collection.updateOne(
      { _id: toObjectId(bookingId) },
      {
        $set: {
          isPaid,
        },
      },
    );

    return result;
  }

  static async updateBookingCalendarSync(
    bookingId: string,
    payload: {
      eventId?: string;
      eventLink?: string;
      status: "pending" | "success" | "failed";
      error?: string;
    },
  ) {
    const collection = await this.getCollection();

    const setPayload: Partial<IUserBooking> = {
      googleCalendarSyncStatus: payload.status,
      googleCalendarSyncError: payload.error,
    };

    if (payload.eventId) {
      setPayload.googleCalendarEventId = payload.eventId;
    }

    if (payload.eventLink) {
      setPayload.googleCalendarEventLink = payload.eventLink;
    }

    const result = await collection.updateOne(
      { _id: toObjectId(bookingId) },
      {
        $set: setPayload,
      },
    );

    return result;
  }
}
