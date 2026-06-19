import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountsRouter from "./accounts";
import credentialsRouter from "./credentials";
import jobsRouter from "./jobs";
import dashboardRouter from "./dashboard";
import aiRouter from "./ai";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountsRouter);
router.use(credentialsRouter);
router.use(jobsRouter);
router.use(dashboardRouter);
router.use(aiRouter);
router.use(settingsRouter);

export default router;
