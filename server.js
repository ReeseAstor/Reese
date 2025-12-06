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
        console.log('Email service initialized');
    } else {
        console.warn('Email service not configured. Set SMTP_USER and SMTP_PASS environment variables.');
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
        
        console.log('Email sent:', info.messageId);
        
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
        console.error('Error sending email:', error);
        
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

// Email queue processor
async function processEmailQueue() {
    const queue = await readEmailQueue();
    if (queue.length === 0) return;
    
    const batchSize = 10; // Process 10 emails at a time
    const batch = queue.splice(0, batchSize);
    
    for (const item of batch) {
        try {
            const result = await sendEmail(item.to, item.emailData, item.trackingId);
            if (!result.success && item.retries < 3) {
                item.retries = (item.retries || 0) + 1;
                queue.push(item); // Re-queue for retry
            }
        } catch (error) {
            console.error('Error processing queue item:', error);
            if (item.retries < 3) {
                item.retries = (item.retries || 0) + 1;
                queue.push(item);
            }
        }
    }
    
    await writeEmailQueue(queue);
}

// Process queue every minute
cron.schedule('* * * * *', processEmailQueue);

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
                // Resend confirmation email
                const emailData = getSubscriptionConfirmationEmail(emailLower, existing.confirmationToken);
                await sendEmail(emailLower, emailData);
                
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

        // Send confirmation email
        const emailData = getSubscriptionConfirmationEmail(emailLower, confirmationToken);
        await sendEmail(emailLower, emailData);

        res.json({ 
            success: true, 
            message: 'Please check your email to confirm your subscription.' 
        });
    } catch (error) {
        console.error('Subscribe error:', error);
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

        // Send welcome email
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
        await sendEmail(subscriber.email, welcomeEmail);

        res.redirect('/?message=subscription_confirmed');
    } catch (error) {
        console.error('Confirm subscription error:', error);
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

        res.json({ 
            success: true, 
            message: 'Successfully unsubscribed' 
        });
    } catch (error) {
        console.error('Unsubscribe error:', error);
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
        console.error('Track open error:', error);
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
        console.error('Track click error:', error);
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
        console.error('Get subscribers error:', error);
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
        res.send(csv);
    } catch (error) {
        console.error('Export subscribers error:', error);
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
        console.error('Get stats error:', error);
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

        res.json({ 
            success: true, 
            newsletter: newsletter 
        });
    } catch (error) {
        console.error('Create newsletter error:', error);
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
        console.error('Get newsletters error:', error);
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
                retries: 0,
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
    } catch (error) {
        console.error('Send newsletter error:', error);
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
        res.json({ success: true, message: 'Newsletter deleted' });
    } catch (error) {
        console.error('Delete newsletter error:', error);
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
        console.error('Get analytics error:', error);
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
        console.log(`Professional Newsletter System running on port ${PORT}`);
        console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
        console.log(`Unsubscribe page: http://localhost:${PORT}/unsubscribe.html`);
        console.log(`\nAdmin credentials:`);
        console.log(`Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
        console.log(`Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
        console.log(`\n⚠️  Please change admin credentials in production!`);
    });
});
