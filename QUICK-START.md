# Quick Start Guide - Newsletter System

## 🚀 Get Started in 3 Steps

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Email

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your email credentials:
   ```env
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   BASE_URL=http://localhost:3000
   ```

   **For Gmail:**
   - Go to https://myaccount.google.com/apppasswords
   - Generate an App Password
   - Use that password (not your regular password)

### Step 3: Start the Server

```bash
npm start
```

That's it! The newsletter system is now running.

## 📍 Access Points

- **Website**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin.html
- **Unsubscribe Page**: http://localhost:3000/unsubscribe.html

## ✨ Features Ready to Use

1. **Newsletter Subscription**: The form on the homepage is already connected!
2. **Admin Panel**: Create and send newsletters to all subscribers
3. **Email Confirmation**: Subscribers automatically receive confirmation emails
4. **Unsubscribe**: One-click unsubscribe via email links

## 📧 Testing Without Email Service

If you don't want to configure email right away, the system will still work:
- Subscriptions will be saved
- The admin panel will function
- You'll see warnings in the console about emails not being sent

Configure email when you're ready to send actual newsletters!

## 🎯 Next Steps

1. Test subscription on the homepage
2. Check the admin panel to see your subscriber
3. Create a test newsletter
4. Send it to yourself (once email is configured)

For detailed documentation, see `README-NEWSLETTER.md`.
