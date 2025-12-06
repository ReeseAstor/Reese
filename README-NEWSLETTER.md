# Newsletter System Documentation

This is a complete newsletter system for the Reese Astor author website. It includes subscription management, email sending, and an admin panel.

## Features

- ✅ **Subscription Management**: Users can subscribe and unsubscribe via email links
- ✅ **Email Confirmation**: Automatic confirmation emails sent upon subscription
- ✅ **Newsletter Creation**: Admin panel for creating and managing newsletters
- ✅ **Bulk Email Sending**: Send newsletters to all active subscribers
- ✅ **Subscriber Management**: View all subscribers and their status
- ✅ **Statistics Dashboard**: Track subscriber counts and newsletter metrics
- ✅ **Email Templates**: Beautiful HTML email templates
- ✅ **Unsubscribe Links**: One-click unsubscribe functionality

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Email Service

Copy the example environment file and configure your email settings:

```bash
cp .env.example .env
```

Edit `.env` and add your SMTP credentials:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**For Gmail:**
- Enable 2-factor authentication
- Generate an App Password: https://support.google.com/accounts/answer/185833
- Use the App Password (not your regular password) in `SMTP_PASS`

**For Other Email Providers:**
- Update `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` according to your provider's settings
- Common providers:
  - **SendGrid**: `smtp.sendgrid.net`, port 587
  - **Mailgun**: `smtp.mailgun.org`, port 587
  - **Outlook**: `smtp-mail.outlook.com`, port 587
  - **Yahoo**: `smtp.mail.yahoo.com`, port 587

### 3. Configure Base URL

Update `BASE_URL` in `.env` to match your domain:

```env
BASE_URL=http://localhost:3000
# For production:
BASE_URL=https://reeseastor.com
```

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on port 3000 (or the port specified in `.env`).

## Usage

### Frontend Integration

The newsletter subscription form on `index.html` is already connected to the API. No additional configuration needed!

### Admin Panel

Access the admin panel at:
```
http://localhost:3000/admin.html
```

**Features:**
- **Dashboard**: View subscriber statistics
- **Subscribers**: View all subscribers and their status
- **Newsletters**: Create, send, and manage newsletters

### Creating a Newsletter

1. Go to the admin panel
2. Click on the "Newsletters" tab
3. Fill in the subject and content
4. Click "Create Newsletter"
5. Click "Send" to send it to all active subscribers

### Email Templates

The system includes two email templates:

1. **Subscription Confirmation**: Sent automatically when someone subscribes
2. **Newsletter**: Used for sending newsletters to subscribers

Both templates are HTML-based and include:
- Responsive design
- Unsubscribe links
- Branded styling matching the website

## API Endpoints

### Public Endpoints

- `POST /api/subscribe` - Subscribe to newsletter
  ```json
  { "email": "user@example.com" }
  ```

- `POST /api/unsubscribe` - Unsubscribe from newsletter
  ```json
  { "token": "unsubscribe-token" }
  ```

- `GET /api/unsubscribe/:token` - Get subscriber info for unsubscribe page

### Admin Endpoints

- `GET /api/admin/stats` - Get subscription statistics
- `GET /api/admin/subscribers` - Get all subscribers
- `GET /api/admin/newsletters` - Get all newsletters
- `POST /api/admin/newsletters` - Create a newsletter
- `POST /api/admin/newsletters/:id/send` - Send a newsletter
- `DELETE /api/admin/newsletters/:id` - Delete a newsletter

## Data Storage

The system uses JSON files for data storage (located in the `data/` directory):

- `data/subscribers.json` - Subscriber database
- `data/newsletters.json` - Newsletter database

**Note**: For production use with high traffic, consider migrating to a proper database (PostgreSQL, MongoDB, etc.). The current structure makes this migration straightforward.

## Security Considerations

1. **Admin Panel**: Currently, the admin panel has no authentication. For production:
   - Add authentication middleware
   - Use environment variables for admin credentials
   - Consider implementing role-based access control

2. **Rate Limiting**: Consider adding rate limiting to prevent abuse:
   - Limit subscription requests per IP
   - Limit email sending frequency

3. **Email Validation**: The system validates email format, but consider:
   - Double opt-in (require email confirmation before activation)
   - Email verification services
   - Spam detection

4. **CORS**: Currently allows all origins. For production, configure CORS to only allow your domain.

## Production Deployment

### Recommended Steps:

1. **Use a Production Email Service**:
   - Consider services like SendGrid, Mailgun, or AWS SES
   - These provide better deliverability and analytics

2. **Add Authentication**:
   - Implement admin authentication
   - Use secure session management

3. **Database Migration**:
   - Migrate from JSON files to a proper database
   - Consider PostgreSQL or MongoDB

4. **Add Monitoring**:
   - Error logging (e.g., Sentry)
   - Email delivery tracking
   - Performance monitoring

5. **Environment Variables**:
   - Never commit `.env` file
   - Use secure secret management in production

6. **HTTPS**:
   - Ensure all communication is over HTTPS
   - Update `BASE_URL` to use HTTPS

## Troubleshooting

### Emails Not Sending

1. Check SMTP credentials in `.env`
2. Verify email service is configured correctly
3. Check server logs for error messages
4. For Gmail, ensure you're using an App Password, not your regular password

### Subscribers Not Receiving Emails

1. Check spam/junk folders
2. Verify email addresses are valid
3. Check email service logs
4. Ensure `BASE_URL` is correctly configured

### Admin Panel Not Loading

1. Ensure the server is running
2. Check browser console for errors
3. Verify API endpoints are accessible

## Support

For issues or questions, check the server logs for detailed error messages.

## License

All rights reserved. © 2024 Reese Astor
