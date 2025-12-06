/**
 * Professional Newsletter System Backend Server
 * Complete newsletter management system with subscription, email sending, admin panel,
 * double opt-in, analytics, rate limiting, authentication, and more
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const cron = require('node-cron');
const validator = require('validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.')); // Serve static files

// Rate limiting
const subscriptionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: 'Too many subscription attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Admin authentication
const adminAuth = basicAuth({
    users: {
        [process.env.ADMIN_USERNAME || 'admin']: process.env.ADMIN_PASSWORD || 'admin123'
    },
    challenge: true,
    realm: 'Newsletter Admin Panel'
});

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const NEWSLETTERS_FILE = path.join(DATA_DIR, 'newsletters.json');
const EMAIL_QUEUE_FILE = path.join(DATA_DIR, 'email-queue.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Initialize files if they don't exist
        const files = [
            { path: SUBSCRIBERS_FILE, default: [] },
            { path: NEWSLETTERS_FILE, default: [] },
            { path: EMAIL_QUEUE_FILE, default: [] },
            { path: ANALYTICS_FILE, default: { opens: {}, clicks: {}, bounces: [] } }
        ];
        
        for (const file of files) {
            try {
                await fs.access(file.path);
            } catch {
                await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
            }
        }
    } catch (error) {
        console.error('Error setting up data directory:', error);
    }
}

// Helper functions for data management
async function readSubscribers() {
    try {
        const data = await fs.readFile(SUBSCRIBERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading subscribers:', error);
        return [];
    }
}

async function writeSubscribers(subscribers) {
    try {
        await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing subscribers:', error);
        return false;
    }
}

async function readNewsletters() {
    try {
        const data = await fs.readFile(NEWSLETTERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading newsletters:', error);
        return [];
    }
}

async function writeNewsletters(newsletters) {
    try {
        await fs.writeFile(NEWSLETTERS_FILE, JSON.stringify(newsletters, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing newsletters:', error);
        return false;
    }
}

async function readEmailQueue() {
    try {
        const data = await fs.readFile(EMAIL_QUEUE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading email queue:', error);
        return [];
    }
}

async function writeEmailQueue(queue) {
    try {
        await fs.writeFile(EMAIL_QUEUE_FILE, JSON.stringify(queue, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing email queue:', error);
        return false;
    }
}

async function readAnalytics() {
    try {
        const data = await fs.readFile(ANALYTICS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading analytics:', error);
        return { opens: {}, clicks: {}, bounces: [] };
    }
}

async function writeAnalytics(analytics) {
    try {
        await fs.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing analytics:', error);
        return false;
    }
}

// Email service
const nodemailer = require('nodemailer');

let transporter = null;

function initEmailService() {
    const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
        }
    };

    if (emailConfig.auth.user && emailConfig.auth.pass) {
        transporter = nodemailer.createTransport(emailConfig);
        logger.info('Email service initialized');
    } else {
        logger.warn('Email service not configured. Set SMTP_USER and SMTP_PASS environment variables.');
    }
}

// Email templates with tracking
function getSubscriptionConfirmationEmail(email, confirmationToken) {
    const confirmUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/confirm-subscription?token=${confirmationToken}`;
    
    return {
        subject: 'Confirm Your Subscription to Reese Astor\'s Newsletter',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: 'Space Grotesk', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #04060f 0%, #0f1a2c 100%); color: #eef1ff; padding: 40px 30px; text-align: center; }
                    .content { background: #fff; padding: 40px 30px; }
                    .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
                    .button { display: inline-block; padding: 14px 28px; background: #f8d7a4; color: #04060f; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: 600; }
                    .button:hover { background: #f5c97a; }
                    ul { margin: 15px 0; padding-left: 20px; }
                    li { margin: 8px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to the Inner Circle</h1>
                    </div>
                    <div class="content">
                        <p>Dear Reader,</p>
                        <p>Thank you for subscribing to Reese Astor's newsletter! To complete your subscription and start receiving exclusive content, please confirm your email address by clicking the button below:</p>
                        <div style="text-align: center;">
                            <a href="${confirmUrl}" class="button">Confirm Subscription</a>
                        </div>
                        <p>Or copy and paste this link into your browser:</p>
                        <p style="word-break: break-all; color: #666; font-size: 12px;">${confirmUrl}</p>
                        <p>Once confirmed, you'll receive:</p>
                        <ul>
                            <li>Early chapters from upcoming novels</li>
                            <li>Annotated playlists that inspired the stories</li>
                            <li>Behind-the-scenes notes from the drafting desk</li>
                            <li>Micro-essays about the creative process</li>
                        </ul>
                        <p>If you didn't subscribe to this newsletter, you can safely ignore this email.</p>
                        <p>Warmly,<br>Reese Astor</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Reese Astor. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
Welcome to Reese Astor's Newsletter!

Thank you for subscribing! To complete your subscription, please confirm your email address by visiting this link:

${confirmUrl}

Once confirmed, you'll receive early chapters, playlists, behind-the-scenes notes, and micro-essays about the creative process.

If you didn't subscribe, you can safely ignore this email.

Warmly,
Reese Astor
        `
    };
}

function getNewsletterEmail(newsletter, subscriber, trackingPixelUrl, clickTrackingBase) {
    const unsubscribeUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/unsubscribe.html?token=${subscriber.unsubscribeToken}`;
    
    // Replace links with tracking URLs
    let content = newsletter.content;
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']/gi;
    const links = [];
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
        links.push(match[1]);
    }
    
    links.forEach((link, index) => {
        if (!link.startsWith('http://') && !link.startsWith('https://') && !link.startsWith('mailto:')) {
            return; // Skip relative links and mailto
        }
        const trackingId = `${newsletter.id}-${subscriber.id}-${index}`;
        const trackingUrl = `${clickTrackingBase}?id=${trackingId}&url=${encodeURIComponent(link)}`;
        content = content.replace(link, trackingUrl);
    });
    
    return {
        subject: newsletter.subject,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: 'Space Grotesk', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #04060f 0%, #0f1a2c 100%); color: #eef1ff; padding: 40px 30px; text-align: center; }
                    .content { background: #fff; padding: 40px 30px; }
                    .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
                    .newsletter-content { line-height: 1.8; }
                    .newsletter-content h2 { color: #04060f; margin-top: 30px; }
                    .newsletter-content p { margin-bottom: 15px; }
                    .newsletter-content a { color: #f8d7a4; text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${newsletter.subject}</h1>
                    </div>
                    <div class="content">
                        <div class="newsletter-content">
                            ${content.replace(/\n/g, '<br>')}
                        </div>
                    </div>
                    <div class="footer">
                        <p>You can unsubscribe at any time by clicking <a href="${unsubscribeUrl}">here</a>.</p>
                        <p>&copy; ${new Date().getFullYear()} Reese Astor. All rights reserved.</p>
                    </div>
                </div>
                <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
            </body>
            </html>
        `,
        text: newsletter.content.replace(/<[^>]*>/g, '')
    };
}

async function sendEmail(to, emailData, trackingId = null) {
    if (!transporter) {
        console.warn('Email service not configured. Email not sent to:', to);
        return { success: false, error: 'Email service not configured' };
    }

    try {
        const info = await transporter.sendMail({
            from: `"Reese Astor" <${process.env.SMTP_USER}>`,
            to: to,
            subject: emailData.subject,
            text: emailData.text,
            html: emailData.html
        });
        
        logger.info('Email sent successfully', { messageId: info.messageId, to });
        
        // Track email sent
        if (trackingId) {
            const analytics = await readAnalytics();
            if (!analytics.sent) analytics.sent = {};
            if (!analytics.sent[trackingId]) analytics.sent[trackingId] = 0;
            analytics.sent[trackingId]++;
            await writeAnalytics(analytics);
        }
        
        return { success: true, messageId: info.messageId };
    } catch (error) {
        logger.error('Error sending email', error, { to, trackingId });
        
        // Track bounce
        if (trackingId) {
            const analytics = await readAnalytics();
            if (!analytics.bounces) analytics.bounces = [];
            analytics.bounces.push({
                email: to,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            await writeAnalytics(analytics);
        }
        
        return { success: false, error: error.message };
    }
}

// Enhanced email queue processor with priority, exponential backoff, and better error handling
let isProcessingQueue = false;
let queueStats = {
    totalProcessed: 0,
    totalFailed: 0,
    totalRetried: 0,
    lastProcessed: null,
    averageProcessingTime: 0
};

async function processEmailQueue() {
    // Prevent concurrent processing
    if (isProcessingQueue) {
        logger.info('Queue processing already in progress, skipping...');
        return;
    }
    
    isProcessingQueue = true;
    const startTime = Date.now();
    
    try {
        const queue = await readEmailQueue();
        if (queue.length === 0) {
            isProcessingQueue = false;
            return;
        }
        
        // Sort queue by priority and retry count (priority first, then by retry count)
        queue.sort((a, b) => {
            const priorityA = a.priority || 0;
            const priorityB = b.priority || 0;
            if (priorityA !== priorityB) return priorityB - priorityA;
            return (a.retries || 0) - (b.retries || 0);
        });
        
        // Dynamic batch size based on queue length and system load
        const baseBatchSize = 10;
        const maxBatchSize = 50;
        const queueLength = queue.length;
        const batchSize = Math.min(
            Math.max(baseBatchSize, Math.floor(queueLength / 10)),
            maxBatchSize
        );
        
        const batch = queue.splice(0, batchSize);
        const results = {
            success: 0,
            failed: 0,
            retried: 0
        };
        
        // Process batch with concurrency control
        const concurrency = 5; // Process 5 emails concurrently
        const chunks = [];
        for (let i = 0; i < batch.length; i += concurrency) {
            chunks.push(batch.slice(i, i + concurrency));
        }
        
        for (const chunk of chunks) {
            const promises = chunk.map(async (item) => {
                try {
                    // Check if item should be retried (exponential backoff)
                    if (item.retries > 0) {
                        const lastAttempt = item.lastAttempt ? new Date(item.lastAttempt) : new Date(0);
                        const backoffDelay = Math.min(1000 * Math.pow(2, item.retries - 1), 3600000); // Max 1 hour
                        const timeSinceLastAttempt = Date.now() - lastAttempt.getTime();
                        
                        if (timeSinceLastAttempt < backoffDelay) {
                            // Not ready for retry yet, put back in queue
                            queue.push(item);
                            return { status: 'deferred', item };
                        }
                    }
                    
                    const result = await sendEmail(item.to, item.emailData, item.trackingId);
                    
                    if (result.success) {
                        results.success++;
                        queueStats.totalProcessed++;
                        return { status: 'success', item };
                    } else {
                        // Handle failure with exponential backoff
                        const maxRetries = item.maxRetries || 5;
                        if ((item.retries || 0) < maxRetries) {
                            item.retries = (item.retries || 0) + 1;
                            item.lastAttempt = new Date().toISOString();
                            item.errors = item.errors || [];
                            item.errors.push({
                                error: result.error,
                                timestamp: new Date().toISOString(),
                                retry: item.retries
                            });
                            queue.push(item);
                            results.retried++;
                            queueStats.totalRetried++;
                            return { status: 'retried', item };
                        } else {
                            // Max retries reached, mark as failed
                            results.failed++;
                            queueStats.totalFailed++;
                            logger.error(`Email failed after ${maxRetries} retries`, {}, { to: item.to, newsletterId: item.newsletterId });
                            return { status: 'failed', item };
                        }
                    }
                } catch (error) {
                    console.error('Error processing queue item:', error);
                    const maxRetries = item.maxRetries || 5;
                    if ((item.retries || 0) < maxRetries) {
                        item.retries = (item.retries || 0) + 1;
                        item.lastAttempt = new Date().toISOString();
                        item.errors = item.errors || [];
                        item.errors.push({
                            error: error.message,
                            timestamp: new Date().toISOString(),
                            retry: item.retries
                        });
                        queue.push(item);
                        results.retried++;
                        queueStats.totalRetried++;
                        return { status: 'retried', item };
                    } else {
                        results.failed++;
                        queueStats.totalFailed++;
                        return { status: 'failed', item };
                    }
                }
            });
            
            await Promise.all(promises);
            
            // Small delay between chunks to avoid overwhelming the email service
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        await writeEmailQueue(queue);
        
        const processingTime = Date.now() - startTime;
        queueStats.lastProcessed = new Date().toISOString();
        queueStats.averageProcessingTime = 
            (queueStats.averageProcessingTime * 0.9) + (processingTime * 0.1); // Exponential moving average
        
        logger.info('Queue processed', {
            success: results.success,
            retried: results.retried,
            failed: results.failed,
            queueLength: queue.length
        });
        
    } catch (error) {
        logger.error('Error in queue processor', error);
    } finally {
        isProcessingQueue = false;
    }
}

// Process queue every 30 seconds for faster processing
cron.schedule('*/30 * * * * *', processEmailQueue);

// Also process immediately on startup
setTimeout(processEmailQueue, 5000);

// Scheduled newsletter sender - checks for newsletters scheduled to be sent
async function processScheduledNewsletters() {
    try {
        const newsletters = await readNewsletters();
        const now = new Date();
        
        for (const newsletter of newsletters) {
            if (newsletter.scheduledAt && !newsletter.sentAt) {
                const scheduledTime = new Date(newsletter.scheduledAt);
                
                // Check if it's time to send (within 1 minute window)
                if (scheduledTime <= now && (now - scheduledTime) < 60000) {
                    logger.info('Sending scheduled newsletter', { newsletterId: newsletter.id, subject: newsletter.subject });
                    
                    const subscribers = await readSubscribers();
                    const activeSubscribers = subscribers.filter(s => s.active && s.confirmed);
                    
                    if (activeSubscribers.length === 0) {
                        logger.warn('No active subscribers to send scheduled newsletter to', { newsletterId: newsletter.id });
                        newsletter.sentAt = new Date().toISOString();
                        newsletter.sentCount = 0;
                        const index = newsletters.findIndex(n => n.id === newsletter.id);
                        newsletters[index] = newsletter;
                        await writeNewsletters(newsletters);
                        continue;
                    }
                    
                    // Add emails to queue
                    const queue = await readEmailQueue();
                    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                    
                    for (const subscriber of activeSubscribers) {
                        const trackingId = `${newsletter.id}-${subscriber.id}`;
                        const trackingPixelUrl = `${baseUrl}/api/track/open?id=${trackingId}`;
                        const clickTrackingBase = `${baseUrl}/api/track/click`;
                        
                        const emailData = getNewsletterEmail(newsletter, subscriber, trackingPixelUrl, clickTrackingBase);
                        
                        queue.push({
                            id: uuidv4(),
                            to: subscriber.email,
                            emailData: emailData,
                            trackingId: trackingId,
                            newsletterId: newsletter.id,
                            subscriberId: subscriber.id,
                            priority: 1, // Scheduled newsletters have priority
                            retries: 0,
                            maxRetries: 5,
                            createdAt: new Date().toISOString()
                        });
                    }
                    
                    await writeEmailQueue(queue);
                    
                    newsletter.sentAt = new Date().toISOString();
                    newsletter.sentCount = activeSubscribers.length;
                    
                    const index = newsletters.findIndex(n => n.id === newsletter.id);
                    newsletters[index] = newsletter;
                    await writeNewsletters(newsletters);
                    
                    logger.info('Scheduled newsletter queued', {
                        newsletterId: newsletter.id,
                        subscriberCount: activeSubscribers.length
                    });
                }
            }
        }
    } catch (error) {
        logger.error('Error processing scheduled newsletters', error);
    }
}

// Check for scheduled newsletters every minute
cron.schedule('* * * * *', processScheduledNewsletters);

// Background analytics aggregation
async function aggregateAnalytics() {
    try {
        const analytics = await readAnalytics();
        const newsletters = await readNewsletters();
        
        // Aggregate daily stats
        const today = new Date().toISOString().split('T')[0];
        if (!analytics.daily) analytics.daily = {};
        if (!analytics.daily[today]) {
            analytics.daily[today] = {
                opens: 0,
                clicks: 0,
                sent: 0,
                bounces: 0
            };
        }
        
        // Aggregate newsletter-specific stats
        if (!analytics.newsletterStats) analytics.newsletterStats = {};
        newsletters.forEach(newsletter => {
            if (!analytics.newsletterStats[newsletter.id]) {
                analytics.newsletterStats[newsletter.id] = {
                    sent: newsletter.sentCount || 0,
                    opens: 0,
                    clicks: 0,
                    bounces: 0,
                    lastUpdated: new Date().toISOString()
                };
            }
            
            // Count opens and clicks for this newsletter
            const opens = analytics.opens || {};
            const clicks = analytics.clicks || {};
            let openCount = 0;
            let clickCount = 0;
            
            Object.keys(opens).forEach(key => {
                if (key.startsWith(newsletter.id)) {
                    openCount += opens[key];
                }
            });
            
            Object.keys(clicks).forEach(key => {
                if (key.startsWith(newsletter.id)) {
                    clickCount += clicks[key];
                }
            });
            
            analytics.newsletterStats[newsletter.id] = {
                sent: newsletter.sentCount || 0,
                opens: openCount,
                clicks: clickCount,
                bounces: (analytics.bounces || []).filter(b => 
                    b.newsletterId === newsletter.id
                ).length,
                lastUpdated: new Date().toISOString()
            };
        });
        
        await writeAnalytics(analytics);
    } catch (error) {
        logger.error('Error aggregating analytics', error);
    }
}

// Aggregate analytics every 5 minutes
cron.schedule('*/5 * * * *', aggregateAnalytics);

// Background cleanup tasks
async function cleanupOldData() {
    try {
        const analytics = await readAnalytics();
        const subscribers = await readSubscribers();
        const now = Date.now();
        
        // Clean up old confirmation tokens (older than 7 days)
        let cleaned = 0;
        subscribers.forEach(subscriber => {
            if (subscriber.confirmationToken && !subscriber.confirmed) {
                const subscribedDate = new Date(subscriber.subscribedAt);
                const daysSince = (now - subscribedDate.getTime()) / (1000 * 60 * 60 * 24);
                
                if (daysSince > 7) {
                    subscriber.active = false;
                    subscriber.cleanupReason = 'Expired confirmation token';
                    cleaned++;
                }
            }
        });
        
        if (cleaned > 0) {
            await writeSubscribers(subscribers);
            logger.info(`Cleaned up expired confirmation tokens`, { count: cleaned });
        }
        
        // Clean up old analytics data (keep last 90 days)
        if (analytics.daily) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);
            
            Object.keys(analytics.daily).forEach(date => {
                if (new Date(date) < cutoffDate) {
                    delete analytics.daily[date];
                }
            });
            
            await writeAnalytics(analytics);
        }
        
        // Clean up old bounces (keep last 30 days)
        if (analytics.bounces && analytics.bounces.length > 0) {
            const bounceCutoff = new Date();
            bounceCutoff.setDate(bounceCutoff.getDate() - 30);
            
            analytics.bounces = analytics.bounces.filter(bounce => {
                const bounceDate = new Date(bounce.timestamp);
                return bounceDate >= bounceCutoff;
            });
            
            await writeAnalytics(analytics);
        }
        
    } catch (error) {
        logger.error('Error in cleanup task', error);
    }
}

// Run cleanup daily at 2 AM
cron.schedule('0 2 * * *', cleanupOldData);

// Enhanced logging utility
const logger = {
    info: (message, data = {}) => {
        const log = {
            level: 'info',
            timestamp: new Date().toISOString(),
            message,
            ...data
        };
        console.log(JSON.stringify(log));
    },
    error: (message, error = {}, data = {}) => {
        const log = {
            level: 'error',
            timestamp: new Date().toISOString(),
            message,
            error: error.message || error,
            stack: error.stack,
            ...data
        };
        console.error(JSON.stringify(log));
    },
    warn: (message, data = {}) => {
        const log = {
            level: 'warn',
            timestamp: new Date().toISOString(),
            message,
            ...data
        };
        console.warn(JSON.stringify(log));
    }
};

// Background subscriber segmentation and tagging
async function processSubscriberSegmentation() {
    try {
        const subscribers = await readSubscribers();
        const analytics = await readAnalytics();
        let updated = 0;
        
        subscribers.forEach(subscriber => {
            if (!subscriber.active || !subscriber.confirmed) return;
            
            const tags = subscriber.tags || [];
            const newTags = [...tags];
            
            // Tag based on subscription date
            const subscribedDate = new Date(subscriber.subscribedAt);
            const daysSince = (Date.now() - subscribedDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSince < 30 && !newTags.includes('new-subscriber')) {
                newTags.push('new-subscriber');
            } else if (daysSince >= 30 && newTags.includes('new-subscriber')) {
                newTags.splice(newTags.indexOf('new-subscriber'), 1);
            }
            
            if (daysSince >= 90 && !newTags.includes('long-term-subscriber')) {
                newTags.push('long-term-subscriber');
            }
            
            // Tag based on engagement (opens/clicks)
            const opens = analytics.opens || {};
            const clicks = analytics.clicks || {};
            let totalOpens = 0;
            let totalClicks = 0;
            
            Object.keys(opens).forEach(key => {
                if (key.includes(subscriber.id)) {
                    totalOpens += opens[key] || 0;
                }
            });
            
            Object.keys(clicks).forEach(key => {
                if (key.includes(subscriber.id)) {
                    totalClicks += clicks[key] || 0;
                }
            });
            
            if (totalOpens >= 5 && !newTags.includes('engaged-reader')) {
                newTags.push('engaged-reader');
            }
            
            if (totalClicks >= 3 && !newTags.includes('active-clicker')) {
                newTags.push('active-clicker');
            }
            
            // Tag based on domain
            const domain = subscriber.email.split('@')[1];
            if (domain && !newTags.includes(`domain-${domain}`)) {
                // Only tag common domains to avoid too many tags
                const commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
                if (commonDomains.includes(domain)) {
                    newTags.push(`domain-${domain}`);
                }
            }
            
            if (JSON.stringify(newTags.sort()) !== JSON.stringify(tags.sort())) {
                subscriber.tags = newTags;
                subscriber.lastSegmented = new Date().toISOString();
                updated++;
            }
        });
        
        if (updated > 0) {
            await writeSubscribers(subscribers);
            logger.info(`Subscriber segmentation completed`, { updated });
        }
    } catch (error) {
        logger.error('Error in subscriber segmentation', error);
    }
}

// Run segmentation every 6 hours
cron.schedule('0 */6 * * *', processSubscriberSegmentation);

// Enhanced error recovery for failed queue items
async function recoverFailedQueueItems() {
    try {
        const queue = await readEmailQueue();
        const now = Date.now();
        let recovered = 0;
        
        queue.forEach(item => {
            // Recover items that have been stuck for more than 24 hours
            if (item.retries > 0 && item.lastAttempt) {
                const lastAttempt = new Date(item.lastAttempt);
                const hoursSince = (now - lastAttempt.getTime()) / (1000 * 60 * 60);
                
                if (hoursSince > 24 && (item.retries || 0) < (item.maxRetries || 5)) {
                    // Reset retry count and try again
                    item.retries = 0;
                    item.lastAttempt = null;
                    item.recoveredAt = new Date().toISOString();
                    recovered++;
                }
            }
        });
        
        if (recovered > 0) {
            await writeEmailQueue(queue);
            logger.info(`Recovered ${recovered} stuck queue items`);
        }
    } catch (error) {
        logger.error('Error in queue recovery', error);
    }
}

// Run recovery check every 12 hours
cron.schedule('0 */12 * * *', recoverFailedQueueItems);

// API Routes

// Subscribe endpoint with double opt-in
app.post('/api/subscribe', subscriptionLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !validator.isEmail(email)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid email address is required' 
            });
        }

        const subscribers = await readSubscribers();
        const emailLower = email.toLowerCase().trim();
        
        // Check if already subscribed
        const existing = subscribers.find(s => s.email === emailLower);
        if (existing) {
            if (existing.active && existing.confirmed) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'This email is already subscribed' 
                });
            } else if (existing.active && !existing.confirmed) {
                // Queue resend confirmation email (high priority)
                const queue = await readEmailQueue();
                const emailData = getSubscriptionConfirmationEmail(emailLower, existing.confirmationToken);
                queue.push({
                    id: uuidv4(),
                    to: emailLower,
                    emailData: emailData,
                    priority: 2, // Confirmation emails have highest priority
                    retries: 0,
                    maxRetries: 3,
                    createdAt: new Date().toISOString()
                });
                await writeEmailQueue(queue);
                
                return res.json({ 
                    success: true, 
                    message: 'Confirmation email sent. Please check your inbox to complete your subscription.' 
                });
            }
        }

        // Create new subscriber with confirmation token
        const confirmationToken = uuidv4();
        const unsubscribeToken = uuidv4();
        const newSubscriber = {
            id: uuidv4(),
            email: emailLower,
            active: true,
            confirmed: false,
            subscribedAt: new Date().toISOString(),
            confirmedAt: null,
            confirmationToken: confirmationToken,
            unsubscribeToken: unsubscribeToken,
            tags: [],
            metadata: {}
        };

        subscribers.push(newSubscriber);
        await writeSubscribers(subscribers);

        // Queue confirmation email (high priority)
        const queue = await readEmailQueue();
        const emailData = getSubscriptionConfirmationEmail(emailLower, confirmationToken);
        queue.push({
            id: uuidv4(),
            to: emailLower,
            emailData: emailData,
            priority: 2, // Confirmation emails have highest priority
            retries: 0,
            maxRetries: 3,
            createdAt: new Date().toISOString()
        });
        await writeEmailQueue(queue);

        logger.info('New subscription request', { email: emailLower });
        
        res.json({ 
            success: true, 
            message: 'Please check your email to confirm your subscription.' 
        });
    } catch (error) {
        logger.error('Subscribe error', error, { email: req.body.email });
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Confirm subscription endpoint
app.get('/api/confirm-subscription', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.redirect('/?error=invalid_token');
        }

        const subscribers = await readSubscribers();
        const subscriber = subscribers.find(s => s.confirmationToken === token);
        
        if (!subscriber) {
            return res.redirect('/?error=invalid_token');
        }

        if (subscriber.confirmed) {
            return res.redirect('/?message=already_confirmed');
        }

        subscriber.confirmed = true;
        subscriber.confirmedAt = new Date().toISOString();
        subscriber.active = true;
        
        await writeSubscribers(subscribers);

        // Queue welcome email (high priority)
        const queue = await readEmailQueue();
        const welcomeEmail = {
            subject: 'Welcome to Reese Astor\'s Newsletter',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: 'Space Grotesk', Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #04060f 0%, #0f1a2c 100%); color: #eef1ff; padding: 30px; text-align: center; }
                        .content { background: #fff; padding: 30px; }
                        .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Welcome to the Inner Circle</h1>
                        </div>
                        <div class="content">
                            <p>Dear Reader,</p>
                            <p>Your subscription has been confirmed! You're now part of an exclusive community that receives:</p>
                            <ul>
                                <li>Early chapters from upcoming novels</li>
                                <li>Annotated playlists that inspired the stories</li>
                                <li>Behind-the-scenes notes from the drafting desk</li>
                                <li>Micro-essays about the creative process</li>
                            </ul>
                            <p>I'm thrilled to share this journey with you. Every newsletter is crafted with care, designed to feel like a secret you were meant to find.</p>
                            <p>Stay tuned for your first newsletter soon!</p>
                            <p>Warmly,<br>Reese Astor</p>
                        </div>
                        <div class="footer">
                            <p>You can unsubscribe at any time by clicking <a href="${process.env.BASE_URL || 'http://localhost:3000'}/unsubscribe.html?token=${subscriber.unsubscribeToken}">here</a>.</p>
                            <p>&copy; ${new Date().getFullYear()} Reese Astor. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: 'Welcome to Reese Astor\'s Newsletter! Your subscription has been confirmed.'
        };
        queue.push({
            id: uuidv4(),
            to: subscriber.email,
            emailData: welcomeEmail,
            priority: 2, // Welcome emails have highest priority
            retries: 0,
            maxRetries: 3,
            createdAt: new Date().toISOString()
        });
        await writeEmailQueue(queue);

        logger.info('Subscription confirmed', { email: subscriber.email });
        
        res.redirect('/?message=subscription_confirmed');
    } catch (error) {
        logger.error('Confirm subscription error', error, { token: req.query.token });
        res.redirect('/?error=confirmation_failed');
    }
});

// Unsubscribe endpoint
app.post('/api/unsubscribe', apiLimiter, async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ 
                success: false, 
                error: 'Unsubscribe token is required' 
            });
        }

        const subscribers = await readSubscribers();
        const subscriber = subscribers.find(s => s.unsubscribeToken === token);
        
        if (!subscriber) {
            return res.status(404).json({ 
                success: false, 
                error: 'Invalid unsubscribe token' 
            });
        }

        subscriber.active = false;
        subscriber.unsubscribedAt = new Date().toISOString();
        
        await writeSubscribers(subscribers);

        logger.info('Subscriber unsubscribed', { email: subscriber.email });
        
        res.json({ 
            success: true, 
            message: 'Successfully unsubscribed' 
        });
    } catch (error) {
        logger.error('Unsubscribe error', error, { token: req.body.token });
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Get unsubscribe token from email (for unsubscribe page)
app.get('/api/unsubscribe/:token', apiLimiter, async (req, res) => {
    try {
        const { token } = req.params;
        const subscribers = await readSubscribers();
        const subscriber = subscribers.find(s => s.unsubscribeToken === token);
        
        if (!subscriber) {
            return res.status(404).json({ 
                success: false, 
                error: 'Invalid unsubscribe token' 
            });
        }

        res.json({ 
            success: true, 
            email: subscriber.email,
            active: subscriber.active 
        });
    } catch (error) {
        console.error('Get unsubscribe info error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Email tracking endpoints
app.get('/api/track/open', async (req, res) => {
    try {
        const { id } = req.query;
        if (id) {
            const analytics = await readAnalytics();
            if (!analytics.opens) analytics.opens = {};
            if (!analytics.opens[id]) analytics.opens[id] = 0;
            analytics.opens[id]++;
            analytics.opens[`${id}_last`] = new Date().toISOString();
            await writeAnalytics(analytics);
        }
        // Return 1x1 transparent pixel
        res.set('Content-Type', 'image/png');
        res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    } catch (error) {
        logger.error('Track open error', error, { id: req.query.id });
        res.status(500).send();
    }
});

app.get('/api/track/click', async (req, res) => {
    try {
        const { id, url } = req.query;
        if (id && url) {
            const analytics = await readAnalytics();
            if (!analytics.clicks) analytics.clicks = {};
            if (!analytics.clicks[id]) analytics.clicks[id] = 0;
            analytics.clicks[id]++;
            analytics.clicks[`${id}_last`] = new Date().toISOString();
            await writeAnalytics(analytics);
        }
        res.redirect(url || '/');
    } catch (error) {
        logger.error('Track click error', error, { id: req.query.id, url: req.query.url });
        res.redirect(url || '/');
    }
});

// Admin: Get all subscribers
app.get('/api/admin/subscribers', adminAuth, apiLimiter, async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        const sanitized = subscribers.map(s => ({
            id: s.id,
            email: s.email,
            active: s.active,
            confirmed: s.confirmed,
            subscribedAt: s.subscribedAt,
            confirmedAt: s.confirmedAt,
            unsubscribedAt: s.unsubscribedAt,
            tags: s.tags || []
        }));
        res.json({ success: true, subscribers: sanitized });
    } catch (error) {
        logger.error('Get subscribers error', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Admin: Export subscribers
app.get('/api/admin/subscribers/export', adminAuth, apiLimiter, async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        const active = subscribers.filter(s => s.active && s.confirmed);
        
        const csv = [
            ['Email', 'Subscribed At', 'Confirmed At', 'Tags'].join(','),
            ...active.map(s => [
                s.email,
                s.subscribedAt,
                s.confirmedAt || '',
                (s.tags || []).join(';')
            ].join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=subscribers.csv');
        logger.info('Subscribers exported', { count: active.length });
        res.send(csv);
    } catch (error) {
        logger.error('Export subscribers error', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Admin: Get subscriber stats
app.get('/api/admin/stats', adminAuth, apiLimiter, async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        const active = subscribers.filter(s => s.active && s.confirmed).length;
        const pending = subscribers.filter(s => s.active && !s.confirmed).length;
        const total = subscribers.length;
        const newsletters = await readNewsletters();
        const analytics = await readAnalytics();
        
        // Calculate newsletter stats
        const newsletterStats = newsletters.map(nl => {
            const sentCount = nl.sentCount || 0;
            const opens = analytics.opens || {};
            const clicks = analytics.clicks || {};
            let openCount = 0;
            let clickCount = 0;
            
            Object.keys(opens).forEach(key => {
                if (key.startsWith(nl.id)) {
                    openCount += opens[key];
                }
            });
            
            Object.keys(clicks).forEach(key => {
                if (key.startsWith(nl.id)) {
                    clickCount += clicks[key];
                }
            });
            
            return {
                id: nl.id,
                subject: nl.subject,
                sentCount,
                openCount,
                clickCount,
                openRate: sentCount > 0 ? ((openCount / sentCount) * 100).toFixed(2) : 0,
                clickRate: sentCount > 0 ? ((clickCount / sentCount) * 100).toFixed(2) : 0
            };
        });
        
        res.json({ 
            success: true, 
            stats: {
                totalSubscribers: total,
                activeSubscribers: active,
                pendingSubscribers: pending,
                inactiveSubscribers: total - active - pending,
                totalNewsletters: newsletters.length,
                newsletterStats: newsletterStats
            }
        });
    } catch (error) {
        logger.error('Get stats error', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Admin: Create newsletter
app.post('/api/admin/newsletters', adminAuth, apiLimiter, async (req, res) => {
    try {
        const { subject, content, scheduledAt, tags } = req.body;
        
        if (!subject || !content) {
            return res.status(400).json({ 
                success: false, 
                error: 'Subject and content are required' 
            });
        }

        const newsletters = await readNewsletters();
        const newsletter = {
            id: uuidv4(),
            subject: subject,
            content: content,
            createdAt: new Date().toISOString(),
            scheduledAt: scheduledAt || null,
            sentAt: null,
            sentCount: 0,
            tags: tags || []
        };

        newsletters.push(newsletter);
        await writeNewsletters(newsletters);

        logger.info('Newsletter created', { newsletterId: newsletter.id, subject: newsletter.subject });
        
        res.json({ 
            success: true, 
            newsletter: newsletter 
        });
    } catch (error) {
        logger.error('Create newsletter error', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Admin: Get all newsletters
app.get('/api/admin/newsletters', adminAuth, apiLimiter, async (req, res) => {
    try {
        const newsletters = await readNewsletters();
        res.json({ success: true, newsletters: newsletters });
    } catch (error) {
        logger.error('Get newsletters error', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Admin: Send newsletter
app.post('/api/admin/newsletters/:id/send', adminAuth, apiLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const newsletters = await readNewsletters();
        const newsletter = newsletters.find(n => n.id === id);
        
        if (!newsletter) {
            return res.status(404).json({ 
                success: false, 
                error: 'Newsletter not found' 
            });
        }

        const subscribers = await readSubscribers();
        const activeSubscribers = subscribers.filter(s => s.active && s.confirmed);
        
        if (activeSubscribers.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No active subscribers to send to' 
            });
        }

        // Add emails to queue with priority
        const queue = await readEmailQueue();
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        
        for (const subscriber of activeSubscribers) {
            const trackingId = `${newsletter.id}-${subscriber.id}`;
            const trackingPixelUrl = `${baseUrl}/api/track/open?id=${trackingId}`;
            const clickTrackingBase = `${baseUrl}/api/track/click`;
            
            const emailData = getNewsletterEmail(newsletter, subscriber, trackingPixelUrl, clickTrackingBase);
            
            queue.push({
                id: uuidv4(),
                to: subscriber.email,
                emailData: emailData,
                trackingId: trackingId,
                newsletterId: newsletter.id,
                subscriberId: subscriber.id,
                priority: 1, // Newsletter emails have priority
                retries: 0,
                maxRetries: 5,
                createdAt: new Date().toISOString()
            });
        }
        
        await writeEmailQueue(queue);
        
        newsletter.sentAt = new Date().toISOString();
        newsletter.sentCount = activeSubscribers.length;
        
        const index = newsletters.findIndex(n => n.id === id);
        newsletters[index] = newsletter;
        await writeNewsletters(newsletters);

        res.json({ 
            success: true, 
            message: `Newsletter queued for ${activeSubscribers.length} subscribers`,
            queuedCount: activeSubscribers.length
        });
        
        logger.info('Newsletter queued for sending', {
            newsletterId: id,
            subscriberCount: activeSubscribers.length
        });
    } catch (error) {
        logger.error('Send newsletter error', error, { newsletterId: id });
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Admin: Delete newsletter
app.delete('/api/admin/newsletters/:id', adminAuth, apiLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const newsletters = await readNewsletters();
        const filtered = newsletters.filter(n => n.id !== id);
        
        if (filtered.length === newsletters.length) {
            return res.status(404).json({ 
                success: false, 
                error: 'Newsletter not found' 
            });
        }

        await writeNewsletters(filtered);
        logger.info('Newsletter deleted', { newsletterId: id });
        res.json({ success: true, message: 'Newsletter deleted' });
    } catch (error) {
        logger.error('Delete newsletter error', error, { newsletterId: id });
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Admin: Get analytics
app.get('/api/admin/analytics', adminAuth, apiLimiter, async (req, res) => {
    try {
        const analytics = await readAnalytics();
        res.json({ success: true, analytics: analytics });
    } catch (error) {
        logger.error('Get analytics error', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
            },
            queue: {
                length: (await readEmailQueue()).length,
                isProcessing: isProcessingQueue,
                stats: queueStats
            },
            services: {
                email: transporter ? 'configured' : 'not configured',
                dataDir: DATA_DIR
            }
        };
        
        // Check data directory accessibility
        try {
            await fs.access(DATA_DIR);
            health.services.dataDirAccessible = true;
        } catch {
            health.services.dataDirAccessible = false;
            health.status = 'degraded';
        }
        
        res.json(health);
    } catch (error) {
        logger.error('Health check error', error);
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// System metrics endpoint (admin only)
app.get('/api/admin/metrics', adminAuth, apiLimiter, async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        const newsletters = await readNewsletters();
        const queue = await readEmailQueue();
        const analytics = await readAnalytics();
        
        const metrics = {
            timestamp: new Date().toISOString(),
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                nodeVersion: process.version,
                platform: process.platform
            },
            subscribers: {
                total: subscribers.length,
                active: subscribers.filter(s => s.active && s.confirmed).length,
                pending: subscribers.filter(s => s.active && !s.confirmed).length,
                inactive: subscribers.filter(s => !s.active).length
            },
            newsletters: {
                total: newsletters.length,
                sent: newsletters.filter(n => n.sentAt).length,
                scheduled: newsletters.filter(n => n.scheduledAt && !n.sentAt).length,
                draft: newsletters.filter(n => !n.scheduledAt && !n.sentAt).length
            },
            queue: {
                length: queue.length,
                isProcessing: isProcessingQueue,
                stats: queueStats,
                byPriority: {
                    high: queue.filter(q => (q.priority || 0) >= 1).length,
                    normal: queue.filter(q => (q.priority || 0) === 0).length
                },
                byStatus: {
                    new: queue.filter(q => (q.retries || 0) === 0).length,
                    retrying: queue.filter(q => (q.retries || 0) > 0).length
                }
            },
            analytics: {
                totalOpens: Object.values(analytics.opens || {}).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0),
                totalClicks: Object.values(analytics.clicks || {}).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0),
                totalBounces: (analytics.bounces || []).length,
                dailyStats: analytics.daily || {}
            }
        };
        
        res.json({ success: true, metrics });
    } catch (error) {
        logger.error('Error getting metrics', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Admin panel route (protected)
app.get('/admin.html', adminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Initialize
ensureDataDir().then(() => {
    initEmailService();
    
    app.listen(PORT, () => {
        logger.info('Professional Newsletter System started', {
            port: PORT,
            adminPanel: `http://localhost:${PORT}/admin.html`,
            unsubscribePage: `http://localhost:${PORT}/unsubscribe.html`,
            healthCheck: `http://localhost:${PORT}/api/health`
        });
        console.log(`\n🚀 Professional Newsletter System running on port ${PORT}`);
        console.log(`📊 Admin panel: http://localhost:${PORT}/admin.html`);
        console.log(`📧 Unsubscribe page: http://localhost:${PORT}/unsubscribe.html`);
        console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
        console.log(`\nAdmin credentials:`);
        console.log(`Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
        console.log(`Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
        console.log(`\n⚠️  Please change admin credentials in production!`);
    });
});
