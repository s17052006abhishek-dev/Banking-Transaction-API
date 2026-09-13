const nodemailer = require('nodemailer');
const { Resend } = require('resend');
require('dotenv').config();

const gmailTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
    },
});

const resend = new Resend(process.env.RESEND_API_KEY);

gmailTransport.verify((error, success) => {
    if (error) {
        console.error('Error connecting to Gmail SMTP:', error);
    } else {
        console.log('Gmail SMTP is ready to send registration emails');
    }
});

const sendRegistrationEmailViaGmail = async (to, subject, text, html) => {
    try {
        const info = await gmailTransport.sendMail({
            from: `"Backend Transaction Api" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html,
        });

        console.log('Registration email sent via Gmail:', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending registration email via Gmail:', error);
        throw error;
    }
};

const sendEmailViaResend = async (to, subject, text, html) => {
    try {
        const info = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to,
            subject,
            text,
            html,
        });

        if (info.error) {
            throw new Error(info.error.message);
        }

        console.log('Transaction email sent via Resend:', info);
        return info;
    } catch (error) {
        console.error('Error sending transaction email via Resend:', error);
        throw error;
    }
};

async function sendRegistrationEmail(userEmail, name) {
    const subject = 'Welcome to Backend Transaction Api!';
    const text = `Hello ${name},\n\nThank you for registering at Backend Transaction Api. We're excited to have you on board!\n\nBest regards,\nThe Backend Transaction Api Team`;
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Transaction Api. We're excited to have you on board!</p><p>Best regards,<br>The Backend Transaction Api Team</p>`;

    await sendRegistrationEmailViaGmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Successful!';
    const text = `Hello ${name},\n\nYour transaction of $${amount} to account ${toAccount} was successful.\n\nBest regards,\nThe Backend Transaction Api Team`;
    const html = `<p>Hello ${name},</p><p>Your transaction of $${amount} to account ${toAccount} was successful.</p><p>Best regards,<br>The Backend Transaction Api Team</p>`;

    await sendEmailViaResend(userEmail, subject, text, html);
}

async function sendReceivedTransactionEmail(userEmail, name, amount, fromAccount) {
    const subject = 'Payment Received!';
    const text = `Hello ${name},\n\nYou received $${amount} from account ${fromAccount}.\n\nBest regards,\nThe Backend Transaction Api Team`;
    const html = `<p>Hello ${name},</p><p>You received $${amount} from account ${fromAccount}.</p><p>Best regards,<br>The Backend Transaction Api Team</p>`;

    await sendEmailViaResend(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Failed';
    const text = `Hello ${name},\n\nWe regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.\n\nBest regards,\nThe Backend Transaction Api Team`;
    const html = `<p>Hello ${name},</p><p>We regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.</p><p>Best regards,<br>The Backend Transaction Api Team</p>`;

    await sendEmailViaResend(userEmail, subject, text, html);
}

async function sendSystemFundingEmail(userEmail, name, amount, toAccount) {
    const subject = 'System Funding Received';
    const text = `Hello ${name},\n\nThe system has credited your account ${toAccount} with $${amount}.\n\nBest regards,\nThe Backend Transaction Api Team`;
    const html = `<p>Hello ${name},</p><p>The system has credited your account ${toAccount} with $${amount}.</p><p>Best regards,<br>The Backend Transaction Api Team</p>`;

    await sendEmailViaResend(userEmail, subject, text, html);
}

module.exports = {
    sendRegistrationEmail,
    sendTransactionEmail,
    sendReceivedTransactionEmail,
    sendTransactionFailureEmail,
    sendSystemFundingEmail
};