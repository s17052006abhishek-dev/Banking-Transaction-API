const express = require("express")
const authMiddleware = require("../middleware/authMiddleware")
const accountController = require("../controllers/accountController")


const router = express.Router()

router.post("/", authMiddleware.authMiddleware, accountController.createAccountController)

router.get("/", authMiddleware.authMiddleware, accountController.getUserAccountsController)

router.get("/balance/:accountId", authMiddleware.authMiddleware, accountController.getAccountBalanceController)



module.exports = router