import { Router, type IRouter } from "express";
import healthRouter from "./health";
import launcherRouter from "./launcher";

const router: IRouter = Router();

router.use(healthRouter);
router.use(launcherRouter);

export default router;
