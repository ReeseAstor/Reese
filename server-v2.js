/**
 * Newsletter System Backend Server - UPGRADED VERSION
 * Enhanced with database, authentication, rate limiting, and advanced features
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const session = require('express-session');
const cron = require('node-cron');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

// Database
const Database = require('better-sqlite3');
const dbPath = path.join(__dirname, 'data', 'newsletter.db');
const db = new Database(dbPath);

// Initialize database
function initDatabase() {
    // Subscribers table
    db.exec(`
        CREATE TABLE IF NOT EXISTS subscribers (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            active INTEGER DEFAULT 1,
            verified INTEGER DEFAULT 0,
            verification_token TEXT,
            unsubscribe_token TEXT UNIQUE NOT NULL,
            subscribed_at TEXT NOT NULL,
            verified_at TEXT,
            unsubscribed_at TEXT,
            source TEXT,
            metadata TEXT
        )
    `);

    // Newsletters table
    db.exec(`
        CREATE TABLE IF NOT EXISTS newsletters (
            id TEXT PRIMARY KEY,
            subject TEXT NOT NULL,
            content TEXT NOT NULL,
            html_content TEXT,
            scheduled_at TEXT,
            sent_at TEXT,
            sent_count INTEGER DEFAULT 0,
            open_count INTEGER DEFAULT 0,
            click_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            created_by TEXT,
            status TEXT DEFAULT 'draft'
        )
    `);

    // Email tracking table
    db.exec(`
        CREATE TABLE IF NOT EXISTS email_tracking (
            id TEXT PRIMARY KEY,
            newsletter_id TEXT,
            subscriber_id TEXT,
            email TEXT NOT NULL,
            sent_at TEXT NOT NULL,
            opened_at TEXT,
            clicked_at TEXT,
            opened_count INTEGER DEFAULT 0,
            clicked_count INTEGER DEFAULT 0,
            FOREIGN KEY (newsletter_id) REFERENCES newsletters(id),
            FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
        )
    `);

    // Admin users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_login TEXT
        )
    `);

    // Scheduled jobs table
    db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
            id TEXT PRIMARY KEY,
            newsletter_id TEXT NOT NULL,
            scheduled_at TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL,
            FOREIGN KEY (newsletter_id) REFERENCES newsletters(id)
        )
    `);

    // Create default admin if doesn't exist
    const adminExists = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
    if (!adminExists) {
        const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const passwordHash = bcrypt.hashSync(defaultPassword, 10);
        db.prepare(`
            INSERT INTO admin_users (id, username, password_hash, created_at)
            VALUES (?, ?, ?, ?)
        `).run(uuidv4(), 'admin', passwordHash, new Date().toISOString());
        console.log('Default admin created: username=admin, password=' + defaultPassword);
        console.log('⚠️  CHANGE THE DEFAULT PASSWORD IN PRODUCTION!');
    }
}

// Initialize database
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow inline scripts for admin panel
}));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || uuidv4(),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
    credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.'));

// Rate limiting
const subscriptionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: 'Too many subscription attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.'
});

// Admin authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.status(401).json({ success: false, error: 'Authentication required' });
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

// Email templates
function getVerificationEmail(email, token) {
    const verifyUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/verify.html?token=${token}`;
    return {
        subject: 'Verify your subscription - Reese Astor Newsletter',
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
                    .button { display: inline-block; padding: 12px 24px; background: #f8d7a4; color: #04060f; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Verify Your Subscription</h1>
                    </div>
                    <div class="content">
                        <p>Thank you for subscribing to Reese Astor's newsletter!</p>
                        <p>Please click the button below to verify your email address and complete your subscription:</p>
                        <div style="text-align: center;">
                            <a href="${verifyUrl}" class="button">Verify Email Address</a>
                        </div>
                        <p>Or copy and paste this link into your browser:</p>
                        <p style="word-break: break-all; color: #666; font-size: 12px;">${verifyUrl}</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Reese Astor. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `Thank you for subscribing! Please verify your email by visiting: ${verifyUrl}`
    };
}

function getNewsletterEmail(newsletter, unsubscribeToken, trackingId) {
    const unsubscribeUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/unsubscribe.html?token=${unsubscribeToken}`;
    const trackingPixel = trackingId ? `<img src="${process.env.BASE_URL || 'http://localhost:3000'}/api/track/open/${trackingId}" width="1" height="1" style="display:none;" />` : '';
    
    // Convert links to tracked links
    let htmlContent = newsletter.html_content || newsletter.content.replace(/\n/g, '<br>');
    if (trackingId) {
        htmlContent = htmlContent.replace(/<a\s+href="([^"]+)"/g, (match, url) => {
            if (!url.startsWith('http')) return match;
            const trackedUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/track/click/${trackingId}?url=${encodeURIComponent(url)}`;
            return `<a href="${trackedUrl}"`;
        });
    }
    
    return {
        subject: newsletter.subject,
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
                        <h1>${newsletter.subject}</h1>
                    </div>
                    <div class="content">
                        ${htmlContent}
                    </div>
                    <div class="footer">
                        <p>You can unsubscribe at any time by clicking <a href="${unsubscribeUrl}">here</a>.</p>
                        <p>&copy; ${new Date().getFullYear()} Reese Astor. All rights reserved.</p>
                    </div>
                    ${trackingPixel}
                </div>
            </body>
            </html>
        `,
        text: newsletter.content
    };
}

async function sendEmail(to, emailData) {
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
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

// API Routes

// Admin login
app.post('/api/admin/login', [
    body('username').notEmpty().trim(),
    body('password').notEmpty()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    req.session.authenticated = true;
    req.session.userId = user.id;
    req.session.username = user.username;

    // Update last login
    db.prepare('UPDATE admin_users SET last_login = ? WHERE id = ?')
        .run(new Date().toISOString(), user.id);

    res.json({ success: true, message: 'Login successful', user: { username: user.username } });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out successfully' });
});

// Check auth status
app.get('/api/admin/auth', (req, res) => {
    res.json({ 
        authenticated: !!(req.session && req.session.authenticated),
        username: req.session?.username 
    });
});

// Subscribe endpoint (with double opt-in)
app.post('/api/subscribe', subscriptionLimiter, [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Valid email address is required' });
    }

    try {
        const { email } = req.body;
        const emailLower = email.toLowerCase().trim();
        const unsubscribeToken = uuidv4();
        const verificationToken = uuidv4();

        // Check if already exists
        const existing = db.prepare('SELECT * FROM subscribers WHERE email = ?').get(emailLower);
        
        if (existing) {
            if (existing.verified && existing.active) {
                return res.status(400).json({ success: false, error: 'This email is already subscribed' });
            } else if (existing.verified && !existing.active) {
                // Reactivate
                db.prepare(`
                    UPDATE subscribers 
                    SET active = 1, subscribed_at = ?, unsubscribe_token = ?
                    WHERE email = ?
                `).run(new Date().toISOString(), unsubscribeToken, emailLower);
                
                return res.json({ success: true, message: 'Subscription reactivated! Check your email for confirmation.' });
            } else {
                // Resend verification
                db.prepare('UPDATE subscribers SET verification_token = ? WHERE email = ?')
                    .run(verificationToken, emailLower);
            }
        } else {
            // Create new subscriber
            db.prepare(`
                INSERT INTO subscribers (id, email, active, verified, verification_token, unsubscribe_token, subscribed_at)
                VALUES (?, ?, 0, 0, ?, ?, ?)
            `).run(uuidv4(), emailLower, verificationToken, unsubscribeToken, new Date().toISOString());
        }

        // Send verification email
        const emailData = getVerificationEmail(emailLower, verificationToken);
        await sendEmail(emailLower, emailData);

        res.json({ 
            success: true, 
            message: 'Please check your email to verify your subscription.' 
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Verify email endpoint
app.get('/api/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const subscriber = db.prepare('SELECT * FROM subscribers WHERE verification_token = ?').get(token);
        
        if (!subscriber) {
            return res.status(404).json({ success: false, error: 'Invalid verification token' });
        }

        if (subscriber.verified) {
            return res.json({ success: true, message: 'Email already verified' });
        }

        // Verify subscriber
        db.prepare(`
            UPDATE subscribers 
            SET verified = 1, active = 1, verified_at = ?
            WHERE verification_token = ?
        `).run(new Date().toISOString(), token);

        res.json({ success: true, message: 'Email verified successfully!' });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Unsubscribe endpoint
app.post('/api/unsubscribe', [
    body('token').notEmpty()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Unsubscribe token is required' });
    }

    try {
        const { token } = req.body;
        const subscriber = db.prepare('SELECT * FROM subscribers WHERE unsubscribe_token = ?').get(token);
        
        if (!subscriber) {
            return res.status(404).json({ success: false, error: 'Invalid unsubscribe token' });
        }

        db.prepare(`
            UPDATE subscribers 
            SET active = 0, unsubscribed_at = ?
            WHERE unsubscribe_token = ?
        `).run(new Date().toISOString(), token);

        res.json({ success: true, message: 'Successfully unsubscribed' });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get unsubscribe info
app.get('/api/unsubscribe/:token', (req, res) => {
    try {
        const { token } = req.params;
        const subscriber = db.prepare('SELECT email, active FROM subscribers WHERE unsubscribe_token = ?').get(token);
        
        if (!subscriber) {
            return res.status(404).json({ success: false, error: 'Invalid unsubscribe token' });
        }

        res.json({ success: true, email: subscriber.email, active: !!subscriber.active });
    } catch (error) {
        console.error('Get unsubscribe info error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Email tracking endpoints
app.get('/api/track/open/:id', (req, res) => {
    try {
        const { id } = req.params;
        const tracking = db.prepare('SELECT * FROM email_tracking WHERE id = ?').get(id);
        
        if (tracking) {
            const openedAt = tracking.opened_at || new Date().toISOString();
            const openCount = (tracking.opened_count || 0) + 1;
            
            db.prepare(`
                UPDATE email_tracking 
                SET opened_at = ?, opened_count = ?
                WHERE id = ?
            `).run(openedAt, openCount, id);
        }
        
        // Return 1x1 transparent pixel
        res.set('Content-Type', 'image/png');
        res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    } catch (error) {
        res.status(200).send('');
    }
});

app.get('/api/track/click/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { url } = req.query;
        const tracking = db.prepare('SELECT * FROM email_tracking WHERE id = ?').get(id);
        
        if (tracking && url) {
            const clickedAt = tracking.clicked_at || new Date().toISOString();
            const clickCount = (tracking.clicked_count || 0) + 1;
            
            db.prepare(`
                UPDATE email_tracking 
                SET clicked_at = ?, clicked_count = ?
                WHERE id = ?
            `).run(clickedAt, clickCount, id);
            
            // Update newsletter click count
            if (tracking.newsletter_id) {
                const newsletter = db.prepare('SELECT click_count FROM newsletters WHERE id = ?').get(tracking.newsletter_id);
                if (newsletter) {
                    db.prepare('UPDATE newsletters SET click_count = ? WHERE id = ?')
                        .run((newsletter.click_count || 0) + 1, tracking.newsletter_id);
                }
            }
        }
        
        res.redirect(url || '/');
    } catch (error) {
        res.redirect('/');
    }
});

// Admin routes (require authentication)
app.use('/api/admin', requireAuth);

// Get stats
app.get('/api/admin/stats', (req, res) => {
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM subscribers').get().count;
        const active = db.prepare('SELECT COUNT(*) as count FROM subscribers WHERE active = 1 AND verified = 1').get().count;
        const newsletters = db.prepare('SELECT COUNT(*) as count FROM newsletters').get().count;
        const sent = db.prepare('SELECT COUNT(*) as count FROM newsletters WHERE sent_at IS NOT NULL').get().count;
        
        // Get recent subscriptions (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recent = db.prepare(`
            SELECT COUNT(*) as count FROM subscribers 
            WHERE subscribed_at > ?
        `).get(thirtyDaysAgo.toISOString()).count;

        res.json({ 
            success: true, 
            stats: {
                totalSubscribers: total,
                activeSubscribers: active,
                inactiveSubscribers: total - active,
                totalNewsletters: newsletters,
                sentNewsletters: sent,
                recentSubscriptions: recent
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get subscribers
app.get('/api/admin/subscribers', (req, res) => {
    try {
        const subscribers = db.prepare(`
            SELECT id, email, active, verified, subscribed_at, verified_at, unsubscribed_at
            FROM subscribers
            ORDER BY subscribed_at DESC
        `).all();
        
        res.json({ success: true, subscribers });
    } catch (error) {
        console.error('Get subscribers error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create newsletter
app.post('/api/admin/newsletters', [
    body('subject').notEmpty().trim(),
    body('content').notEmpty()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Subject and content are required' });
    }

    try {
        const { subject, content, html_content, scheduled_at } = req.body;
        const newsletter = {
            id: uuidv4(),
            subject,
            content,
            html_content: html_content || null,
            scheduled_at: scheduled_at || null,
            created_at: new Date().toISOString(),
            created_by: req.session.username,
            status: scheduled_at ? 'scheduled' : 'draft'
        };

        db.prepare(`
            INSERT INTO newsletters (id, subject, content, html_content, scheduled_at, created_at, created_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            newsletter.id,
            newsletter.subject,
            newsletter.content,
            newsletter.html_content,
            newsletter.scheduled_at,
            newsletter.created_at,
            newsletter.created_by,
            newsletter.status
        );

        // If scheduled, add to scheduled jobs
        if (scheduled_at) {
            db.prepare(`
                INSERT INTO scheduled_jobs (id, newsletter_id, scheduled_at, status, created_at)
                VALUES (?, ?, ?, 'pending', ?)
            `).run(uuidv4(), newsletter.id, scheduled_at, new Date().toISOString());
        }

        res.json({ success: true, newsletter });
    } catch (error) {
        console.error('Create newsletter error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get newsletters
app.get('/api/admin/newsletters', (req, res) => {
    try {
        const newsletters = db.prepare(`
            SELECT * FROM newsletters ORDER BY created_at DESC
        `).all();
        
        res.json({ success: true, newsletters });
    } catch (error) {
        console.error('Get newsletters error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get newsletter analytics
app.get('/api/admin/newsletters/:id/analytics', (req, res) => {
    try {
        const { id } = req.params;
        const newsletter = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
        
        if (!newsletter) {
            return res.status(404).json({ success: false, error: 'Newsletter not found' });
        }

        const tracking = db.prepare(`
            SELECT 
                COUNT(*) as total_sent,
                SUM(opened_count) as total_opens,
                SUM(clicked_count) as total_clicks,
                COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as unique_opens,
                COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as unique_clicks
            FROM email_tracking
            WHERE newsletter_id = ?
        `).get(id);

        const openRate = tracking.total_sent > 0 ? (tracking.unique_opens / tracking.total_sent * 100).toFixed(2) : 0;
        const clickRate = tracking.total_sent > 0 ? (tracking.unique_clicks / tracking.total_sent * 100).toFixed(2) : 0;

        res.json({
            success: true,
            analytics: {
                sent: newsletter.sent_count || 0,
                opens: tracking.total_opens || 0,
                uniqueOpens: tracking.unique_opens || 0,
                clicks: tracking.total_clicks || 0,
                uniqueClicks: tracking.unique_clicks || 0,
                openRate: `${openRate}%`,
                clickRate: `${clickRate}%`
            }
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Send newsletter
app.post('/api/admin/newsletters/:id/send', async (req, res) => {
    try {
        const { id } = req.params;
        const newsletter = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
        
        if (!newsletter) {
            return res.status(404).json({ success: false, error: 'Newsletter not found' });
        }

        const subscribers = db.prepare(`
            SELECT * FROM subscribers 
            WHERE active = 1 AND verified = 1
        `).all();
        
        if (subscribers.length === 0) {
            return res.status(400).json({ success: false, error: 'No active subscribers to send to' });
        }

        let sentCount = 0;
        let errorCount = 0;

        for (const subscriber of subscribers) {
            const trackingId = uuidv4();
            
            // Create tracking record
            db.prepare(`
                INSERT INTO email_tracking (id, newsletter_id, subscriber_id, email, sent_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(trackingId, id, subscriber.id, subscriber.email, new Date().toISOString());

            const emailData = getNewsletterEmail(newsletter, subscriber.unsubscribe_token, trackingId);
            const result = await sendEmail(subscriber.email, emailData);
            
            if (result.success) {
                sentCount++;
            } else {
                errorCount++;
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        db.prepare(`
            UPDATE newsletters 
            SET sent_at = ?, sent_count = ?, status = 'sent'
            WHERE id = ?
        `).run(new Date().toISOString(), sentCount, id);

        res.json({ 
            success: true, 
            message: `Newsletter sent to ${sentCount} subscribers`,
            sentCount,
            errorCount
        });
    } catch (error) {
        console.error('Send newsletter error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete newsletter
app.delete('/api/admin/newsletters/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = db.prepare('DELETE FROM newsletters WHERE id = ?').run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Newsletter not found' });
        }

        res.json({ success: true, message: 'Newsletter deleted' });
    } catch (error) {
        console.error('Delete newsletter error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Scheduled job processor
function processScheduledJobs() {
    const now = new Date().toISOString();
    const jobs = db.prepare(`
        SELECT * FROM scheduled_jobs 
        WHERE status = 'pending' AND scheduled_at <= ?
    `).all(now);

    for (const job of jobs) {
        db.prepare('UPDATE scheduled_jobs SET status = "processing" WHERE id = ?').run(job.id);
        
        // Trigger send (in production, use a queue system)
        fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/admin/newsletters/${job.newsletter_id}/send`, {
            method: 'POST',
            headers: {
                'Cookie': `connect.sid=${process.env.ADMIN_SESSION_ID || ''}`
            }
        }).then(() => {
            db.prepare('UPDATE scheduled_jobs SET status = "completed" WHERE id = ?').run(job.id);
        }).catch(() => {
            db.prepare('UPDATE scheduled_jobs SET status = "failed" WHERE id = ?').run(job.id);
        });
    }
}

// Run scheduled job processor every minute
cron.schedule('* * * * *', processScheduledJobs);

// Initialize
initEmailService();

app.listen(PORT, () => {
    console.log(`Newsletter system server (UPGRADED) running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
    console.log(`Database: ${dbPath}`);
});
