// Package imports
import dotenv from "dotenv";
import express from "express";
import type { Request, Response } from "express";

dotenv.config();

// Local imports
import { connectDB } from "./config/db.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

// Route imports
import userRoutes from "./routes/user.routes.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/user", userRoutes);

// Health API endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
  });
});

const start = async () => {
  await connectDB();

  // Listen to app server
  app.listen("4949", () => {
    console.log(`Server listening on port 4949`);
  });
};

app.use(errorMiddleware);
start();
