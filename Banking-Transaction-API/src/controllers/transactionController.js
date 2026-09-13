const transactionModel = require("../models/transactionModel")
const ledgerModel = require("../models/ledgerModel")
const accountModel = require("../models/accountModel")
const userModel = require("../models/userModel")
const emailService = require("../services/emailService")
const mongoose = require("mongoose")

/**
 * Create a new transaction.
 * Transfer flow:
 * 1. Validate request payload
 * 2. Ensure source account belongs to the logged-in user
 * 3. Validate destination account
 * 4. Check idempotency key
 * 5. Verify both accounts are ACTIVE
 * 6. Start MongoDB transaction
 * 7. Debit source balance atomically
 * 8. Credit destination balance atomically
 * 9. Create transaction and ledger entries
 * 10. Mark as COMPLETED, commit session, and notify user
 */

const createTransaction = async (req, res) => {

    /**
     * 1. Validate request
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    if (typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({
            message: "Amount must be a positive number"
        })
    }

    if (fromAccount === toAccount) {
        return res.status(400).json({
            message: "Source account and destination account cannot be the same"
        })
    }

    /**
     * 2. Ensure source account belongs to logged-in user
     */
    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
        user: req.user._id
    })

    if (!fromUserAccount) {
        return res.status(403).json({
            message: "Source account not found or does not belong to you"
        })
    }

    /**
     * 3. Validate destination account
     */
    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid destination account (toAccount)"
        })
    }

    /**
     * 4. Validate idempotency key
     */
    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    })

    if (isTransactionAlreadyExists) {
        if (isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction already processed",
                transaction: isTransactionAlreadyExists
            })
        }
        if (isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction is still processing",
            })
        }
        if (isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction processing failed, please retry"
            })
        }
        if (isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction was reversed, please retry"
            })
        }
    }

    /**
     * 5. Check account status
     */
    if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Both fromAccount and toAccount must be ACTIVE to process transaction"
        })
    }

    let transaction;
    let session;
    try {
        /**
         * 6. Start MongoDB transaction
         */
        session = await mongoose.startSession();
        session.startTransaction();

        /**
         * 7. Deduct source balance atomically
         */
        const debitUpdate = await accountModel.findOneAndUpdate(
            { _id: fromAccount, user: req.user._id, status: "ACTIVE", balance: { $gte: amount } },
            { $inc: { balance: -amount } },
            { session, returnDocument: "after" }
        );

        if (!debitUpdate) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                message: "Insufficient balance or account is not eligible for transfer"
            });
        }

        /**
         * 8. Add destination balance atomically
         */
        const creditUpdate = await accountModel.findOneAndUpdate(
            { _id: toAccount, status: "ACTIVE" },
            { $inc: { balance: amount } },
            { session, returnDocument: "after" }
        );

        if (!creditUpdate) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                message: "Destination account is not active"
            });
        }

        /**
         * 9. Create transaction and ledger entries
         */
        transaction = (await transactionModel.create([{
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        }], { session }))[0]

        await ledgerModel.create([{
            account: fromAccount,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        }], { session })

        await ledgerModel.create([{
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        }], { session })

        /**
         * 10. Mark completed, commit session, and notify user
         */
        const completedTransaction = await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" },
            { session, returnDocument: "after" }
        )

        transaction = completedTransaction
        await session.commitTransaction();
        session.endSession();
    } catch (error) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }

        return res.status(500).json({
            message: "Transaction processing failed. Changes have been rolled back.",
            error: error.message
        })
    }

    const destinationUser = await userModel.findById(toUserAccount.user).select("email name")

    try {
        await Promise.all([
            emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount),
            emailService.sendReceivedTransactionEmail(
                destinationUser.email,
                destinationUser.name,
                amount,
                fromAccount
            )
        ])
    } catch (error) {
        return res.status(201).json({
            message: "Transaction completed successfully, but an email notification failed",
            transaction: transaction,
            emailError: error.message
        })
    }

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    })
}


const createInitialFundsTransaction = async (req, res) => {
    const { toAccount, amount, idempotencyKey } = req.body

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        })
    }

    if (typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({
            message: "Amount must be a positive number"
        })
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid toAccount"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    })

    if (!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        })
    }

    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        const sourceUpdate = await accountModel.findOneAndUpdate(
            { _id: fromUserAccount._id, balance: { $gte: amount } },
            { $inc: { balance: -amount } },
            { session, returnDocument: "after" }
        );

        if (!sourceUpdate) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                message: "System account does not have enough balance"
            });
        }

        const destinationUpdate = await accountModel.findOneAndUpdate(
            { _id: toAccount, status: "ACTIVE" },
            { $inc: { balance: amount } },
            { session, returnDocument: "after" }
        );

        if (!destinationUpdate) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                message: "Destination account is not active"
            });
        }

        const transaction = new transactionModel({
            fromAccount: fromUserAccount._id,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        })

        await ledgerModel.create([{
            account: fromUserAccount._id,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        }], { session })

        await ledgerModel.create([{
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        }], { session })

        transaction.status = "COMPLETED"
        await transaction.save({ session })

        await session.commitTransaction();
        session.endSession();

        const destinationUser = await userModel.findById(toUserAccount.user).select("email name")

        if (destinationUser) {
            try {
                await emailService.sendSystemFundingEmail(destinationUser.email, destinationUser.name, amount, toAccount)
            } catch (error) {
                return res.status(201).json({
                    message: "Initial funds transaction completed successfully, but email notification failed",
                    transaction: transaction,
                    emailError: error.message
                })
            }
        }

        return res.status(201).json({
            message: "Initial funds transaction completed successfully",
            transaction: transaction
        })
    } catch (error) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }

        return res.status(500).json({
            message: "Initial funds transaction failed",
            error: error.message
        })
    }
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction
}
