const { Router } = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const transactionController = require("../controllers/transactionController")

const transactionRoutes = Router();


transactionRoutes.post("/", authMiddleware.authMiddleware, transactionController.createTransaction)

transactionRoutes.post("/system/initial-funds", authMiddleware.authSystemUserMiddleware, transactionController.createInitialFundsTransaction)

module.exports = transactionRoutes;