import dotenv from "dotenv"; 
import express from "express";
import type { Request, Response } from "express";

dotenv.config(); 

import { connectDB } from "./config/db.js";

const app = express();

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

start(); 