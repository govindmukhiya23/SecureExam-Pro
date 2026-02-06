# 🚀 Deployment Guide - SecureExam Pro

## ⚠️ CRITICAL SECURITY ALERT

**Your Supabase keys have been exposed in the .env file!**

### Immediate Actions Required:
1. ✅ **Rotate all Supabase keys immediately**
   - Go to: https://app.supabase.com
   - Project Settings → API Keys
   - Regenerate ANON_KEY and SERVICE_KEY
   - Update all deployments

2. ✅ **Never commit .env files to Git**
   - Add to `.gitignore`:
     ```
     .env
     .env.local
     .env.*.local
     *.pem
     ```

3. ✅ **Use environment variable management**
   - Never paste secrets in chat/documents
   - Use secure secret management tools

---

## 📋 DEPLOYMENT OPTIONS

### Option 1: Vercel (Recommended for Frontend)
**Best for:** React/Frontend deployment
**Cost:** Free tier available
**Setup Time:** 5 minutes

**Steps:**
1. Push code to GitHub (without .env)
2. Go to https://vercel.com
3. Click "New Project"
4. Select your repository
5. Add environment variables in Settings
6. Deploy

**Environment Variables to Add:**
```
VITE_API_URL=https://your-api-domain.com
```

---

### Option 2: Render (Recommended for Backend)
**Best for:** Node.js/Express backend
**Cost:** Free tier available
**Setup Time:** 10 minutes

**Steps:**
1. Push code to GitHub
2. Go to https://render.com
3. Click "New +" → "Web Service"
4. Connect GitHub repository
5. Configure:
   - **Name:** secureexam-api
   - **Environment:** Node
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
6. Add environment variables
7. Deploy

**Environment Variables:**
```
NODE_ENV=production
PORT=5000
JWT_SECRET=your_strong_secret_here
SUPABASE_URL=your_url
SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_KEY=your_key
CORS_ORIGIN=https://your-frontend-domain.com
```

---

### Option 3: Railway (All-in-One)
**Best for:** Full stack deployment
**Cost:** Pay-as-you-go
**Setup Time:** 15 minutes

**Steps:**
1. Go to https://railway.app
2. Create new project
3. Connect GitHub
4. Select repository
5. Add services:
   - Backend (Node.js)
   - Frontend (Static)
6. Configure environment variables
7. Deploy

---

### Option 4: Docker + Cloud Run (Google Cloud)
**Best for:** Scalable production
**Cost:** Free tier available
**Setup Time:** 30 minutes

**Create Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
```

**Deploy:**
```bash
gcloud run deploy secureexam-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

## 🔧 STEP-BY-STEP DEPLOYMENT (Vercel + Render)

### Step 1: Prepare Code for Deployment

**1.1 Update .gitignore:**
```bash
# In project root
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore
echo "dist/" >> .gitignore
echo "node_modules/" >> .gitignore
```

**1.2 Create .env.example (without secrets):**
```env
# Frontend
VITE_API_URL=https://your-api-domain.com

# Backend
NODE_ENV=production
PORT=5000
JWT_SECRET=your_secret_here
SUPABASE_URL=your_url
SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_KEY=your_key
CORS_ORIGIN=https://your-frontend-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**1.3 Push to GitHub:**
```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

---

### Step 2: Deploy Backend (Render)

**2.1 Create Render Account**
- Go to https://render.com
- Sign up with GitHub

**2.2 Create Web Service**
- Click "New +" → "Web Service"
- Connect your GitHub repository
- Select the repository

**2.3 Configure Service**
```
Name: secureexam-api
Environment: Node
Region: Oregon (or closest to you)
Branch: main
Build Command: npm run build
Start Command: npm start
```

**2.4 Add Environment Variables**
- Click "Environment"
- Add all variables from .env.example
- Use your actual Supabase keys (rotated)

**2.5 Deploy**
- Click "Create Web Service"
- Wait for deployment (5-10 minutes)
- Note the URL: `https://secureexam-api.onrender.com`

---

### Step 3: Deploy Frontend (Vercel)

**3.1 Create Vercel Account**
- Go to https://vercel.com
- Sign up with GitHub

**3.2 Import Project**
- Click "Add New..." → "Project"
- Select your repository
- Click "Import"

**3.3 Configure Project**
```
Framework: Vite
Root Directory: ./client
Build Command: npm run build
Output Directory: dist
```

**3.4 Add Environment Variables**
- Go to Settings → Environment Variables
- Add:
  ```
  VITE_API_URL=https://secureexam-api.onrender.com
  ```

**3.5 Deploy**
- Click "Deploy"
- Wait for deployment (3-5 minutes)
- Note the URL: `https://secureexam-pro.vercel.app`

---

### Step 4: Update CORS Configuration

**4.1 Update Backend CORS**
- Go to Render dashboard
- Select your service
- Go to Environment
- Update `CORS_ORIGIN`:
  ```
  https://secureexam-pro.vercel.app
  ```
- Redeploy

**4.2 Test CORS**
```bash
curl -H "Origin: https://secureexam-pro.vercel.app" \
  https://secureexam-api.onrender.com/api/health
```

---

## 🔐 SECURITY CHECKLIST FOR DEPLOYMENT

- [ ] Rotated all Supabase keys
- [ ] .env file added to .gitignore
- [ ] Created .env.example without secrets
- [ ] JWT_SECRET is 32+ characters
- [ ] CORS_ORIGIN is set to frontend domain
- [ ] NODE_ENV=production
- [ ] HTTPS is enforced
- [ ] Security headers are configured
- [ ] Rate limiting is enabled
- [ ] Database backups are configured
- [ ] Monitoring is set up
- [ ] Error tracking is configured

---

## 📊 DOMAIN SETUP

### Option 1: Use Provided Domains
- **Frontend:** `https://secureexam-pro.vercel.app` (free)
- **Backend:** `https://secureexam-api.onrender.com` (free)

### Option 2: Custom Domain

**For Vercel:**
1. Go to Project Settings → Domains
2. Add your domain
3. Update DNS records
4. Verify

**For Render:**
1. Go to Service Settings → Custom Domain
2. Add your domain
3. Update DNS records
4. Verify

**DNS Records to Add:**
```
Type: CNAME
Name: api
Value: secureexam-api.onrender.com
TTL: 3600
```

---

## 🧪 POST-DEPLOYMENT TESTING

### Test Backend
```bash
# Health check
curl https://secureexam-api.onrender.com/api/health

# Test CORS
curl -H "Origin: https://secureexam-pro.vercel.app" \
  https://secureexam-api.onrender.com/api/health

# Test authentication
curl -X POST https://secureexam-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password"}'
```

### Test Frontend
1. Open https://secureexam-pro.vercel.app
2. Try to register
3. Try to login
4. Check browser console for errors
5. Check network tab for API calls

---

## 📈 MONITORING & LOGGING

### Render Monitoring
- Dashboard shows:
  - CPU usage
  - Memory usage
  - Request count
  - Error rate
  - Logs

### Vercel Monitoring
- Dashboard shows:
  - Build status
  - Deployment history
  - Performance metrics
  - Error tracking

### Set Up Error Tracking (Optional)
```bash
# Install Sentry
npm install @sentry/node

# Add to server/src/index.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

---

## 🚨 TROUBLESHOOTING

### Issue: CORS Error
**Solution:**
1. Check CORS_ORIGIN in backend
2. Verify frontend domain matches
3. Redeploy backend
4. Clear browser cache

### Issue: 502 Bad Gateway
**Solution:**
1. Check backend logs
2. Verify environment variables
3. Check database connection
4. Restart service

### Issue: Slow Performance
**Solution:**
1. Check database queries
2. Enable caching
3. Optimize images
4. Use CDN

### Issue: Database Connection Error
**Solution:**
1. Verify Supabase keys
2. Check network access
3. Verify database is running
4. Check connection string

---

## 📞 SUPPORT RESOURCES

### Vercel Docs
- https://vercel.com/docs

### Render Docs
- https://render.com/docs

### Supabase Docs
- https://supabase.com/docs

### Express.js Docs
- https://expressjs.com

### React Docs
- https://react.dev

---

## ✅ DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Code is committed to GitHub
- [ ] .env is in .gitignore
- [ ] .env.example is created
- [ ] All tests pass
- [ ] Security audit complete
- [ ] Environment variables documented

### Deployment
- [ ] Backend deployed to Render
- [ ] Frontend deployed to Vercel
- [ ] Environment variables configured
- [ ] CORS configured
- [ ] Domain configured (if custom)
- [ ] SSL/TLS enabled

### Post-Deployment
- [ ] Health check passes
- [ ] CORS test passes
- [ ] Authentication works
- [ ] Database connection works
- [ ] Monitoring is active
- [ ] Error tracking is active

---

## 🎯 NEXT STEPS

1. **Rotate Supabase Keys** (URGENT)
2. **Prepare Code** (Update .gitignore, create .env.example)
3. **Deploy Backend** (Render)
4. **Deploy Frontend** (Vercel)
5. **Configure CORS** (Update backend)
6. **Test Everything** (Run tests)
7. **Set Up Monitoring** (Configure alerts)
8. **Document** (Update README)

---

**Status:** ✅ READY FOR DEPLOYMENT
**Estimated Time:** 30-45 minutes
**Cost:** Free tier available on both platforms

---

*For detailed deployment help, refer to the platform-specific documentation.*
