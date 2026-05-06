import { ObjectId, WithId } from "mongodb";
import { getDB } from "../config/mongodb";
import User, { IUser } from "./User";
import UserBooking, { IUserBooking } from "./UserBooking";
import { NotFoundError } from "../helpers/CustomError";

export interface IReview {
    _id?: ObjectId;
    userId: ObjectId;
    user?: IUser;
    staffId: ObjectId;
    staff?: IUser;
    bookingId: ObjectId;
    rating: number;
    comment: string;
    createdAt: Date;
}

export default class Review {
    static async getCollection() {
        const db = await getDB();
        const collection = db.collection<IReview>("Reviews");
        return collection;
    }

    static async bookingCollection() {
        const db = await getDB();
        const collection = db.collection<IUserBooking>("UserBookings");
        return collection;
    }

    static async getReviewsByStaffId(staffId: string): Promise<IReview[]> {
        const collection = await this.getCollection();
        const reviews = await collection.aggregate([
            { $match: { staffId: new ObjectId(staffId) } },
            { $lookup: {
                from: "Users",
                localField: "userId",
                foreignField: "_id",
                as: "user"
            }},
            { $lookup: {
                from: "Users",
                localField: "staffId",
                foreignField: "_id",
                as: "staff"
            }},
            { $unwind: "$user" },
            { $unwind: "$staff" }
        ]).toArray() as IReview[];
        return reviews;
    }

    static async createReview(data: Omit<IReview, "_id" | "createdAt">): Promise<string> {
        const collection = await this.getCollection();
        const bookingCollection = await this.bookingCollection();

        const booking = await bookingCollection.findOne({ _id: new ObjectId(data.bookingId),
            userId: new ObjectId(data.userId),
            status: "completed" });

        if (!booking) {
            throw new NotFoundError("Booking not found or not completed");
        }

        await collection.insertOne({
            ...data,
            createdAt: new Date()
         });
        return "Review created successfully";
    }


}