# 🚀 QUICK DEPLOYMENT CHECKLIST

## ⚠️ URGENT: SECURITY ISSUE

Your Supabase keys were exposed. **ROTATE THEM IMMEDIATELY:**

1. Go to: https://app.supabase.com
2. Project Settings → API Keys
3. Click "Rotate" on both keys
4. Update all deployments with new keys

---

## 📋 DEPLOYMENT IN 5 STEPS

### Step 1: Prepare Code (5 minutes)
```bash
# Add .env to .gitignore
echo ".env" >> .gitignore

# Create .env.example (without secrets)
cat > .env.example << 'EOF'
NODE_ENV=production
PORT=5000
JWT_SECRET=your_secret_here
SUPABASE_URL=your_url
SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_KEY=your_key
CORS_ORIGIN=https://your-frontend-domain.com
EOF

# Commit
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### Step 2: Deploy Backend (10 minutes)
1. Go to https://render.com
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Select your repository
5. Configure:
   - Build: `npm run build`
   - Start: `npm start`
6. Add environment variables
7. Deploy
8. **Note the URL:** `https://your-api.onrender.com`

### Step 3: Deploy Frontend (10 minutes)
1. Go to https://vercel.com
2. Sign up with GitHub
3. Click "Add New..." → "Project"
4. Select your repository
5. Configure:
   - Root: `./client`
   - Build: `npm run build`
6. Add environment variable:
   ```
   VITE_API_URL=https://your-api.onrender.com
   ```
7. Deploy
8. **Note the URL:** `https://your-app.vercel.app`

### Step 4: Update CORS (5 minutes)
1. Go to Render dashboard
2. Select your backend service
3. Go to Environment
4. Update `CORS_ORIGIN`:
   ```
   https://your-app.vercel.app
   ```
5. Redeploy

### Step 5: Test (5 minutes)
```bash
# Test backend
curl https://your-api.onrender.com/api/health

# Test frontend
Open https://your-app.vercel.app in browser
Try to register/login
```

---

## 🔑 ENVIRONMENT VARIABLES NEEDED

### Backend (Render)
```
NODE_ENV=production
PORT=5000
JWT_SECRET=your_strong_secret_32_chars_minimum
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_rotated_anon_key
SUPABASE_SERVICE_KEY=your_rotated_service_key
CORS_ORIGIN=https://your-frontend-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Frontend (Vercel)
```
VITE_API_URL=https://your-api-domain.com
```

---

## ✅ VERIFICATION

After deployment, verify:
- [ ] Backend health check: `https://your-api.onrender.com/api/health`
- [ ] Frontend loads: `https://your-app.vercel.app`
- [ ] Can register new user
- [ ] Can login
- [ ] No CORS errors in console
- [ ] No 401/403 errors

---

## 🆘 QUICK TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| CORS Error | Update CORS_ORIGIN in backend, redeploy |
| 502 Bad Gateway | Check backend logs, verify env vars |
| Can't login | Check JWT_SECRET, verify Supabase keys |
| Slow loading | Check network tab, verify API URL |
| Database error | Verify Supabase keys are rotated |

---

## 📞 PLATFORM LINKS

- **Render:** https://render.com
- **Vercel:** https://vercel.com
- **Supabase:** https://app.supabase.com
- **GitHub:** https://github.com

---

**Total Time:** ~35 minutes
**Cost:** Free tier available
**Status:** Ready to deploy

---

For detailed guide, see: **DEPLOYMENT_GUIDE.md**
