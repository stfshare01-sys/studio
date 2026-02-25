/**
 * Notification Triggers - Cloud Functions
 * 
 * Auto-sends emails when a notification is created in the user's subcollection.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Office 365 SMTP Configuration
// IMPORTANT: The password must be provided via env variable SMTP_PASSWORD
const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'stfshare01@stuffactory.mx',
        pass: process.env.SMTP_PASSWORD || '',   // Set this in your functions/.env file
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

/**
 * Trigger: Enviar correo electrónico al jefe (u otro usuario) cuando recibe
 * una nueva notificación en la base de datos (campanita).
 */
export const onNotificationCreated = onDocumentCreated(
    'users/{userId}/notifications/{notificationId}',
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) {
            console.log('No data associated with the event.');
            return;
        }

        const notificationData = snapshot.data();
        const userId = event.params.userId;

        try {
            // Fetch the user's email address
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                console.log(`User ${userId} not found, skipping email notification.`);
                return;
            }

            const userData = userDoc.data();
            const recipientEmail = userData?.email;

            if (!recipientEmail) {
                console.log(`User ${userId} has no email address configured, skipping.`);
                return;
            }

            if (!process.env.SMTP_PASSWORD) {
                console.warn('⚠️ SMTP_PASSWORD environment variable is NOT SET. Emails will fail to send. Please set it in functions/.env');
            }

            const subjectInfo = notificationData.title || 'Nueva Notificación de Recursos Humanos';
            const linkParam = notificationData.link ? `https://nexus.stuffactory.mx${notificationData.link}` : 'https://nexus.stuffactory.mx';

            // Generate a simple HTML email body
            const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #2563eb; padding: 20px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0;">STUFFACTORY</h2>
                </div>
                <div style="padding: 20px; background-color: #f9fafb;">
                    <h3 style="color: #1f2937;">${notificationData.title}</h3>
                    <p style="color: #4b5563; line-height: 1.5;">${notificationData.message}</p>
                    
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="${linkParam}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">Ver Detalle en el Sistema</a>
                    </div>
                </div>
                <div style="padding: 15px; background-color: #f3f4f6; text-align: center; font-size: 12px; color: #6b7280;">
                    Este es un mensaje automático generado por STUFFACTORY.<br/>
                    Por favor, no respondas a este correo directo.
                </div>
            </div>
            `;

            // Setup email data
            const mailOptions = {
                from: '"STUFFACTORY" <stfshare01@stuffactory.mx>',
                to: recipientEmail,
                subject: subjectInfo,
                html: htmlBody,
            };

            // Send the email
            const info = await transporter.sendMail(mailOptions);
            console.log(`[Email Trigger] Correo enviado a ${recipientEmail} (ID: ${info.messageId})`);

        } catch (error) {
            console.error(`[Email Trigger] Error enviando correo a usuario ${userId}:`, error);
        }
    }
);
