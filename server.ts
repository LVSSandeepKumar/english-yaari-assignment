import express from "express";
import type { Request, Response } from "express";

const app = express();

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
  });
});

app.listen("4949", () => {
  console.log(`Server listening on port 4949`);
});
