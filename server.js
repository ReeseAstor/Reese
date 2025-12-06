/**
 * Newsletter System Backend Server
 * Complete newsletter management system with subscription, email sending, and admin panel
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('.')); // Serve static files

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const NEWSLETTERS_FILE = path.join(DATA_DIR, 'newsletters.json');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Initialize subscribers file if it doesn't exist
        try {
            await fs.access(SUBSCRIBERS_FILE);
        } catch {
            await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify([], null, 2));
        }
        
        // Initialize newsletters file if it doesn't exist
        try {
            await fs.access(NEWSLETTERS_FILE);
        } catch {
            await fs.writeFile(NEWSLETTERS_FILE, JSON.stringify([], null, 2));
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

// Email service
const nodemailer = require('nodemailer');

let transporter = null;

function initEmailService() {
    // Email configuration from environment variables or defaults
    const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
        }
    };

    // Only create transporter if credentials are provided
    if (emailConfig.auth.user && emailConfig.auth.pass) {
        transporter = nodemailer.createTransport(emailConfig);
        console.log('Email service initialized');
    } else {
        console.warn('Email service not configured. Set SMTP_USER and SMTP_PASS environment variables.');
    }
}

// Email templates
function getSubscriptionConfirmationEmail(email, unsubscribeToken) {
    const unsubscribeUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/unsubscribe.html?token=${unsubscribeToken}`;
    
    return {
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
                    .button { display: inline-block; padding: 12px 24px; background: #f8d7a4; color: #04060f; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to the Inner Circle</h1>
                    </div>
                    <div class="content">
                        <p>Dear Reader,</p>
                        <p>Thank you for subscribing to Reese Astor's newsletter! You're now part of an exclusive community that receives:</p>
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
                        <p>You can unsubscribe at any time by clicking <a href="${unsubscribeUrl}">here</a>.</p>
                        <p>&copy; ${new Date().getFullYear()} Reese Astor. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
Welcome to Reese Astor's Newsletter!

Thank you for subscribing! You're now part of an exclusive community that receives early chapters, playlists, behind-the-scenes notes, and micro-essays about the creative process.

Stay tuned for your first newsletter soon!

Warmly,
Reese Astor

Unsubscribe: ${unsubscribeUrl}
        `
    };
}

function getNewsletterEmail(newsletter, unsubscribeToken) {
    const unsubscribeUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/unsubscribe.html?token=${unsubscribeToken}`;
    
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
                    .newsletter-content { line-height: 1.8; }
                    .newsletter-content h2 { color: #04060f; margin-top: 30px; }
                    .newsletter-content p { margin-bottom: 15px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${newsletter.subject}</h1>
                    </div>
                    <div class="content">
                        <div class="newsletter-content">
                            ${newsletter.content.replace(/\n/g, '<br>')}
                        </div>
                    </div>
                    <div class="footer">
                        <p>You can unsubscribe at any time by clicking <a href="${unsubscribeUrl}">here</a>.</p>
                        <p>&copy; ${new Date().getFullYear()} Reese Astor. All rights reserved.</p>
                    </div>
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

// Subscribe endpoint
app.post('/api/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
            if (existing.active) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'This email is already subscribed' 
                });
            } else {
                // Reactivate subscription
                existing.active = true;
                existing.subscribedAt = new Date().toISOString();
                existing.unsubscribeToken = uuidv4();
                
                await writeSubscribers(subscribers);
                
                // Send confirmation email
                const emailData = getSubscriptionConfirmationEmail(emailLower, existing.unsubscribeToken);
                await sendEmail(emailLower, emailData);
                
                return res.json({ 
                    success: true, 
                    message: 'Subscription reactivated! Check your email for confirmation.' 
                });
            }
        }

        // Create new subscriber
        const unsubscribeToken = uuidv4();
        const newSubscriber = {
            id: uuidv4(),
            email: emailLower,
            active: true,
            subscribedAt: new Date().toISOString(),
            unsubscribeToken: unsubscribeToken
        };

        subscribers.push(newSubscriber);
        await writeSubscribers(subscribers);

        // Send confirmation email
        const emailData = getSubscriptionConfirmationEmail(emailLower, unsubscribeToken);
        await sendEmail(emailLower, emailData);

        res.json({ 
            success: true, 
            message: 'Successfully subscribed! Check your email for confirmation.' 
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Unsubscribe endpoint
app.post('/api/unsubscribe', async (req, res) => {
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
app.get('/api/unsubscribe/:token', async (req, res) => {
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

// Admin: Get all subscribers
app.get('/api/admin/subscribers', async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        // Don't expose unsubscribe tokens in list view
        const sanitized = subscribers.map(s => ({
            id: s.id,
            email: s.email,
            active: s.active,
            subscribedAt: s.subscribedAt,
            unsubscribedAt: s.unsubscribedAt
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

// Admin: Get subscriber stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        const active = subscribers.filter(s => s.active).length;
        const total = subscribers.length;
        const newsletters = await readNewsletters();
        
        res.json({ 
            success: true, 
            stats: {
                totalSubscribers: total,
                activeSubscribers: active,
                inactiveSubscribers: total - active,
                totalNewsletters: newsletters.length
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
app.post('/api/admin/newsletters', async (req, res) => {
    try {
        const { subject, content } = req.body;
        
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
            sentAt: null,
            sentCount: 0
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
app.get('/api/admin/newsletters', async (req, res) => {
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
app.post('/api/admin/newsletters/:id/send', async (req, res) => {
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
        const activeSubscribers = subscribers.filter(s => s.active);
        
        if (activeSubscribers.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No active subscribers to send to' 
            });
        }

        let sentCount = 0;
        let errorCount = 0;

        // Send emails (in production, use a queue system for large lists)
        for (const subscriber of activeSubscribers) {
            const emailData = getNewsletterEmail(newsletter, subscriber.unsubscribeToken);
            const result = await sendEmail(subscriber.email, emailData);
            
            if (result.success) {
                sentCount++;
            } else {
                errorCount++;
            }
            
            // Small delay to avoid overwhelming the email server
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        newsletter.sentAt = new Date().toISOString();
        newsletter.sentCount = sentCount;
        
        const index = newsletters.findIndex(n => n.id === id);
        newsletters[index] = newsletter;
        await writeNewsletters(newsletters);

        res.json({ 
            success: true, 
            message: `Newsletter sent to ${sentCount} subscribers`,
            sentCount: sentCount,
            errorCount: errorCount
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
app.delete('/api/admin/newsletters/:id', async (req, res) => {
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

// Initialize
ensureDataDir().then(() => {
    initEmailService();
    
    app.listen(PORT, () => {
        console.log(`Newsletter system server running on port ${PORT}`);
        console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
        console.log(`Unsubscribe page: http://localhost:${PORT}/unsubscribe.html`);
    });
});
