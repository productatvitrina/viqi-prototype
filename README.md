# ViQi Prototype - Film & TV Industry Matchmaking

A modern SaaS application that connects Film & TV professionals using AI-powered matching and personalized outreach.

## 🚀 Quick Start (Session-Only POC)

### Prerequisites
- Node.js 18+
- Python 3.9+
- Google OAuth App (for SSO)
- Stripe Account (for payment checks)
- Gemini API Key (for AI matching)

### Setup

1. **Clone and install dependencies:**
   ```bash
   npm install
   cd apps/api && pip install -r requirements.txt
   ```

2. **Configure environment variables:**
   Copy `.env.production.example` and set your API keys:
   - Google OAuth credentials
   - Stripe keys
   - Gemini API key

3. **Configure Google OAuth:**
   - Go to [Google Console](https://console.developers.google.com)
   - Create a new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add `http://localhost:3000/api/auth/callback/google` to authorized redirect URIs

4. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000 (session-only)
   - API Docs: http://localhost:8000/docs

## 📋 Features

### Core Functionality (Session-Only POC)
- ✅ Mobile-first responsive design
- ✅ Session-only authentication (Google OAuth + email)
- ✅ AI-powered matching using Gemini API
- ✅ Stripe payment verification (no database)
- ✅ Real-time results processing
- ✅ Zero database dependencies
- ✅ Comprehensive debugging logs

### User Flow (Session-Only)
1. **Landing**: User describes what they're looking for
2. **Authentication**: Google OAuth or email (stored in session only)
3. **Processing**: Query sent to Gemini API for matching
4. **Payment Check**: Stripe API checks payment status by email
5. **Results**: Shows full results if paid, paywall if not paid

### Configuration
- Session-only approach - no database setup required
- Environment variables for API integrations
- Easily deployable to Vercel (frontend) + Render (backend)

## 🧪 Testing

```bash
# Run all tests
npm test

# Test specific components
npm run test:web
npm run test:api
```

## 📊 Mock Data

The prototype includes realistic Film & TV industry data:
- **Companies**: Netflix, Warner Bros, Paramount, ILM, Deluxe, etc.
- **People**: Producers, VFX Supervisors, Directors, etc.
- **Content**: Popular movies and TV shows with metadata
- **Pricing**: Starter ($29/mo, 50 credits) and Pro ($79/mo, 200 credits)

## 🔧 Architecture

```
viqi-prototype/
├── apps/
│   ├── web/          # Next.js 14 frontend
│   └── api/          # FastAPI backend
├── packages/
│   └── shared/       # Shared types
└── docker-compose.yml # PostgreSQL + Redis
```

## 🐛 Debug Mode

Set `DEBUG=true` in `.env` to enable comprehensive logging:
- HTTP requests/responses
- Database queries
- LLM API calls
- Authentication flows
- Payment processing

## 🚧 Production Considerations

This is a prototype. For production:
- Replace mock matching with real database queries
- Implement proper error handling
- Add monitoring and alerting
- Set up CI/CD pipeline
- Configure production databases
- Add rate limiting and security headers

## 📞 Support

Check the logs in development mode for detailed debugging information. All major operations are logged with timestamps and request IDs.
