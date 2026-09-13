const userModel  = require('../models/userModel');
const jwt = require("jsonwebtoken")
const emailService = require("../services/emailService")
const tokenBlackListModel = require("../models/blackListModel")


async function userRegisterController(req, res) {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
        return res.status(422).json({
            message: "Please provide all required fields",
            status: "failed"
        })
    }

    const isExists = await userModel.findOne({
        email: email
    })

    if (isExists) {
        return res.status(422).json({
            message: "User already exists with email.",
            status: "failed"
        })
    }

    const user = await userModel.create({
        email, password, name
    })

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" })

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    }

    res.cookie("token", token, cookieOptions)

    res.status(201).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    })

    await emailService.sendRegistrationEmail(user.email, user.name)
}

async function userLoginController(req, res) {
    const { email, password } = req.body

    if(!email || !password){
        return res.status(422).json({
            message: "Please provide all required fields",
            status: "failed"
        })
    }

    const user = await userModel.findOne({ email }).select("+password")

    if (!user) {
        return res.status(401).json({
            message: "Email or password is INVALID"
        })
    }

    const isValidPassword = await user.comparePassword(password)

    if (!isValidPassword) {
        return res.status(401).json({
            message: "Email or password is INVALID"
        })
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" })

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    }

    res.cookie("token", token, cookieOptions)

    res.status(200).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    })

}

async function userLogoutController(req, res) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[ 1 ]

    if (!token) {
        return res.status(200).json({
            message: "User logged out successfully"
        })
    }
    await tokenBlackListModel.create({
        token: token
    })
    res.clearCookie("token")
    res.status(200).json({
        message: "User logged out successfully"
    })

}


module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController
} 