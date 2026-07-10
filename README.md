# AIX Nova Bot 🤖

> A production-ready AI Telegram Bot powered by OpenAI GPT-4o, built with Node.js, Express, and MongoDB Atlas.

## ✨ Features

### 🤖 AI Capabilities
- **Natural Conversations** - Powered by OpenAI GPT-4o
- **Image Understanding** - Analyze and describe images
- **File Reading** - Read and analyze text-based files
- **Conversation Memory** - Remembers context across messages
- **Markdown & Code Blocks** - Formatted responses
- **Typing Indicator** - Shows "typing..." while generating

### 📱 Telegram Bot
- **Commands** - `/start`, `/help`, `/settings`, `/history`, `/clear`, `/about`
- **Inline Keyboards** - Interactive settings UI
- **Reply Keyboards** - Quick action buttons
- **Profile Management** - User preferences
- **Admin Broadcast** - Send messages to all users

### 🔧 Admin Panel (REST API)
- **Dashboard** - Real-time stats and metrics
- **User Management** - View, search, ban, delete users
- **Chat History** - Browse user conversations
- **Analytics** - Usage charts and trends
- **Settings** - Global bot configuration
- **Logs** - View application logs
- **Bot Status** - Health monitoring

### 🔒 Security
- JWT Authentication
- Helmet security headers
- Rate limiting
- Input validation & sanitization
- MongoDB injection prevention
- CORS protection

## 🚀 Quick Start

### 🚀 Quick Start (Zero-Config)

You only need **3 values** to get started:
1. **MONGODB_URI** — from [MongoDB Atlas](https://www.mongodb.com/atlas)
2. **OPENAI_API_KEY** — from [OpenAI](https://platform.openai.com/api-keys)
3. **TELEGRAM_BOT_TOKEN** — from [@BotFather](https://t.me/BotFather)

### Prerequisites
- Node.js 18+

### 1. Install

```bash
cd server
npm install
```

### 2. Configure

Edit `server/.env` and replace these 3 values only:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/aix-nova
OPENAI_API_KEY=sk-proj-your-actual-key
TELEGRAM_BOT_TOKEN=your-actual-bot-token
```

Everything else (JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, etc.) has already been auto-generated with secure random values.

### 3. Run

```bash
npm run dev    # Development with auto-reload
# OR
npm start     # Production
```

### 4. Get Started

- **Telegram**: Open your bot and send `/start`
- **API Health**: `http://localhost:5000/health`
- **Admin API**: `POST /api/auth/login` with the auto-generated credentials shown in the console

> **First run?** The server will print auto-generated admin credentials in the console.

## 📚 API Reference

### Authentication
```
POST /api/auth/login       - Admin login
GET  /api/auth/profile     - Get admin profile
POST /api/auth/verify      - Verify token
PUT  /api/auth/change-password - Change password
```

### AI Chat
```
POST /api/chat             - Send message & get AI response
POST /api/image            - Analyze an image
POST /api/file             - Analyze a file
GET  /api/history          - Get conversation history
DELETE /api/history        - Clear conversation history
GET  /api/profile          - Get user profile
PUT  /api/profile          - Update user profile
```

### Admin Panel
```
GET  /api/admin/dashboard     - Dashboard stats
GET  /api/admin/analytics     - Detailed analytics
GET  /api/admin/usage         - Usage statistics
GET  /api/admin/settings      - Get settings
PUT  /api/admin/settings      - Update settings
GET  /api/admin/bot-status    - Bot health
POST /api/admin/broadcast     - Broadcast message
GET  /api/admin/logs          - View logs
GET  /api/admin/users         - List users
GET  /api/admin/users/:id     - Get user details
PUT  /api/admin/users/:id/ban - Ban/unban user
DELETE /api/admin/users/:id   - Delete user
GET  /api/admin/users/:id/chats - User chats
GET  /api/admin/admins        - List admins
POST /api/admin/admins        - Create admin
```

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Using Docker

```bash
# Build image
docker build -t aix-nova-bot .

# Run container
docker run -d \
  --name aix-nova-bot \
  -p 5000:5000 \
  --env-file server/.env \
  -v $(pwd)/logs:/app/logs \
  aix-nova-bot
```

## 🌐 Deployment to Render

1. Push your code to GitHub
2. Create a new **Web Service** on Render
3. Connect your repository
4. Configure:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add environment variables from `.env`
6. Deploy!

## ⚙️ PM2 Process Management

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
npm run pm2

# Monitor
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

## 📁 Project Structure

```
server/
├── config/
│   ├── index.js          # Configuration
│   └── database.js       # MongoDB connection
├── controllers/
│   ├── authController.js  # Authentication
│   ├── chatController.js  # AI chat logic
│   ├── userController.js  # User management
│   └── adminController.js # Admin panel
├── middleware/
│   ├── auth.js            # JWT verification
│   ├── errorHandler.js    # Error handling
│   ├── rateLimiter.js     # Rate limiting
│   └── validate.js        # Input validation
├── models/
│   ├── User.js            # User model
│   ├── Conversation.js    # Conversation model
│   ├── Message.js         # Message model
│   ├── Usage.js           # Usage tracking
│   ├── Settings.js        # User settings
│   └── Admin.js           # Admin model
├── routes/
│   ├── auth.js            # Auth routes
│   ├── chat.js            # Chat routes
│   ├── user.js            # User routes
│   └── admin.js           # Admin routes
├── services/
│   ├── openai.js          # OpenAI integration
│   └── logger.js          # Winston logger
├── telegram/
│   ├── bot.js             # Bot initialization
│   ├── commands.js        # Bot commands
│   └── handlers.js        # Message handlers
├── utils/
│   ├── helpers.js         # Utility functions
│   └── sanitize.js        # Input sanitization
├── scripts/
│   └── seedAdmin.js       # Admin seed script
├── app.js                 # Express app
├── server.js              # Entry point
├── package.json
└── package-lock.json
```

## 🧠 Tech Stack

| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime environment |
| **Express** | Web framework |
| **MongoDB Atlas** | Cloud database |
| **Mongoose** | ODM for MongoDB |
| **OpenAI SDK** | AI/LLM integration |
| **node-telegram-bot-api** | Telegram integration |
| **JWT** | Authentication |
| **Winston** | Logging |
| **Helmet** | Security headers |
| **Docker** | Containerization |
| **PM2** | Process management |

## 🔒 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | No | Environment (development/production) |
| `MONGODB_URI` | **Yes** | MongoDB connection string |
| `OPENAI_API_KEY` | **Yes** | OpenAI API key |
| `TELEGRAM_BOT_TOKEN` | **Yes** | Telegram bot token |
| `JWT_SECRET` | **Yes** | JWT signing secret |
| `LOG_LEVEL` | No | Logging level (default: info) |
| `CORS_ORIGINS` | No | Allowed CORS origins |
| `ADMIN_USERNAME` | No | Default admin username |
| `ADMIN_PASSWORD` | Yes* | Default admin password |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📝 License

MIT License - feel free to use and modify!

## 📧 Support

For issues and feature requests, please open an issue on GitHub.

---

<p align="center">
  Made with ❤️ by the AIX Nova Team
</p>
