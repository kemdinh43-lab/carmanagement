# Angel One Travel Ops - Deploy

## 1. Supabase

Run `supabase/migrations/0001_core.sql` in Supabase SQL Editor.

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://cyagfkfaclwhafocdqgy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

## 2. GitHub

```bash
git init
git add .
git commit -m "Initial Angel One Travel ops app"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 3. Vercel

1. Import the GitHub repo in Vercel.
2. Framework preset: Next.js.
3. Add the two Supabase env vars above.
4. Deploy.

## 4. First Use

1. Open `/auth`.
2. Create users by role: sale, dispatcher, driver, accountant, admin.
3. For driver users, choose the matching driver profile.
4. Driver users are routed to `Tài xế mobile` and only see their assigned driver profile.
