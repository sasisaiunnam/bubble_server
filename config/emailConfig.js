const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  // 1. Create a transporter object using SMTP transport
  //    You need to use a service like SendGrid, Mailgun, or set up your own SMTP server.
  //    For testing with Gmail, you might need to use an "App Password".
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error(
      "Email configuration is incomplete. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, and EMAIL_PASS in Backend/.env."
    );
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587, // Use port 587 for TLS, 465 for SSL
    secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // 2. Define the email options
  const mailOptions = {
    from: '"Bubble App" <no-reply@bubble.com>', // Sender address
    to: options.email, // List of receivers
    subject: options.subject, // Subject line
    text: options.message, // Plain text body
    // html: "<b>Hello world?</b>", // You can also send HTML body
  };

  // 3. Send the email
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Email could not be sent");
  }
};

module.exports = sendEmail;